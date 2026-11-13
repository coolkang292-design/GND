import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  computeStageGrowth,
  toMetricPoints,
  type RawSession,
  type StageGrowth,
} from "@/lib/domain/level-growth";
import { LEVEL_DEFS, MAX_LEVEL, getStageGroups } from "@/lib/domain/progression";

export type StageGrowthResult =
  | {
      state: "ready";
      level: number;
      stageIndex: number;
      stageName: string;
      /** 이 단계에 들어온 시각 (ISO) */
      enteredAt: string;
      summary: StageGrowth;
    }
  /** 1단계이거나 단계 진입 이력이 없다 — 수치를 만들지 않는다 */
  | { state: "no_baseline"; level: number; stageIndex: number; stageName: string };

type HistoryRow = { level: number; entered_at: string };

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/** `range`로 끝까지 읽는다. 상한까지 계속 꽉 차면 일부 데이터로 계산하지 않도록 던진다. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_SIZE) return rows;
  }
  throw new Error(`level-growth: 세션이 ${MAX_PAGES * PAGE_SIZE}건을 넘어 일부만으로는 계산하지 않는다`);
}

/**
 * 현재 단계의 '내 성장' — 본인 기록만 읽는다. 서버 함수·기준선 테이블은 쓰지 않는다.
 *
 * 기준선 = 현재 단계 첫 레벨 진입 시각 이하의 종목별 최고 기록. 진입 이력(`user_level_history`)이
 * 이미 시각을 고정해 두므로 따로 저장하지 않고, 읽을 때마다 같은 규칙으로 계산한다.
 */
export async function getMyStageGrowth(input: {
  /**
   * ⚠️ **반드시 본인 id로 거른다.** RLS는 크루 친구의 공개 세션도 읽게 열어 두어서,
   * 필터가 없으면 친구의 종목이 내 성장에 섞인다 (evolution.ts와 같은 이유).
   */
  userId: string;
  level: number;
  /** 실제 캐릭터 단계. 레벨이 높아도 진화 대기 중이면 이 단계를 사용한다. */
  currentStage?: number;
}): Promise<StageGrowthResult> {
  const def = LEVEL_DEFS[Math.min(Math.max(Math.trunc(input.level), 1), MAX_LEVEL) - 1];
  const stages = getStageGroups();
  const stageIndex = input.currentStage ?? def.stageIndex;
  const stage = stages[stageIndex - 1];
  if (!stage || stage.stageIndex !== stageIndex) throw new Error("invalid growth stage");
  const prevStage = stageIndex > 1 ? stages[stageIndex - 2] : null;
  const noBaseline = {
    state: "no_baseline" as const,
    level: input.level,
    stageIndex: stage.stageIndex,
    stageName: stage.stageName,
  };
  // 1단계는 그 전 기록이 앱에 없다 — 비교 기준이 없다
  if (!prevStage) return noBaseline;

  const supabase = getSupabaseBrowserClient();
  const levels = [stage.startLevel, prevStage.startLevel];
  const { data: history, error: historyError } = await supabase
    .from("user_level_history")
    .select("level, entered_at")
    .eq("user_id", input.userId)
    .in("level", levels)
    .limit(2);
  if (historyError) throw historyError;
  const rows = (history ?? []) as HistoryRow[];
  const entry = rows.find((r) => r.level === stage.startLevel);
  if (!entry) return noBaseline;
  const prevEntry = rows.find((r) => r.level === prevStage.startLevel) ?? null;
  const enteredAtMs = Date.parse(entry.entered_at);

  // ⚠️ PostgREST는 `max_rows`(기본 1000)로 `limit`을 조용히 깎을 수 있다 — 기준선이 일부 기록만으로 계산돼도
  // 신호가 없다. 그래서 `range`로 1000행씩 끝까지 읽고, 상한에 닿으면 부분 데이터로 계산하지 않고 던진다.
  // 진입 이하(기준선 쪽)와 이후(현재 쪽)는 따로 읽어 한쪽이 다른 쪽을 밀어내지 못하게 한다.
  const sessionSelect =
    "id, completed_at, tabata_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, distance_meters, is_completed))";
  const base = () =>
    supabase
      .from("workout_sessions")
      .select(sessionSelect)
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .is("deleted_at", null);
  const [before, after] = await Promise.all([
    fetchAllPages((from, to) =>
      base()
        .lte("completed_at", entry.entered_at)
        .order("completed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      base()
        .gt("completed_at", entry.entered_at)
        .order("completed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
  ]);
  const sessions = [...before, ...after];

  return {
    state: "ready",
    level: input.level,
    stageIndex: stage.stageIndex,
    stageName: stage.stageName,
    enteredAt: entry.entered_at,
    summary: computeStageGrowth({
      points: toMetricPoints(sessions as unknown as RawSession[]),
      stageEnteredAtMs: enteredAtMs,
      previousStageEnteredAtMs: prevEntry ? Date.parse(prevEntry.entered_at) : null,
    }),
  };
}
