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
}): Promise<StageGrowthResult> {
  const def = LEVEL_DEFS[Math.min(Math.max(Math.trunc(input.level), 1), MAX_LEVEL) - 1];
  const stages = getStageGroups();
  const stage = stages[def.stageIndex - 1];
  const prevStage = def.stageIndex > 1 ? stages[def.stageIndex - 2] : null;
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

  // ⚠️ 한 번에 읽으면 `limit`이 어느 쪽을 자를지 모른다. 진입 이하(기준선 쪽)와 이후(현재 쪽)를
  // 따로, 최신순으로 읽어 한쪽이 다른 쪽을 밀어내지 못하게 한다. 기준선은 기간 제한이 없어 넉넉히 읽는다.
  const sessionSelect =
    "completed_at, tabata_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, is_completed))";
  const [beforeRes, afterRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select(sessionSelect)
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .lte("completed_at", entry.entered_at)
      .order("completed_at", { ascending: false })
      .limit(2000),
    supabase
      .from("workout_sessions")
      .select(sessionSelect)
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .gt("completed_at", entry.entered_at)
      .order("completed_at", { ascending: false })
      .limit(1000),
  ]);
  if (beforeRes.error) throw beforeRes.error;
  if (afterRes.error) throw afterRes.error;
  const sessions = [...(beforeRes.data ?? []), ...(afterRes.data ?? [])];

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
