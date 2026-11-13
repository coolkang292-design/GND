import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  BASELINE_WINDOW_DAYS,
  METRIC_VERSION,
  computeBaselines,
  computeLevelGrowth,
  toMetricPoints,
  type Baseline,
  type DaySample,
  type LevelGrowthSummary,
  type MetricKind,
  type RawSession,
} from "@/lib/domain/level-growth";
import { DAY_MS } from "@/lib/domain/time";

export type LevelGrowthResult =
  | {
      state: "ready";
      level: number;
      /** 이 레벨에 들어온 시각 (ISO) */
      enteredAt: string;
      summary: LevelGrowthSummary;
    }
  /** 레벨 진입 이력이 없다 (Lv.1이거나 이력 기록이 빠졌다) — 수치를 만들지 않는다 */
  | { state: "no_entry"; level: number };

type EntryRow = { level: number; entered_at: string; baseline_frozen_at: string | null };
type BaselineRow = {
  exercise_key: string;
  metric_type: MetricKind;
  baseline_value: number;
  samples: DaySample[] | null;
};

/**
 * 현재 레벨의 '내 성장' — 본인 기록만 읽는다.
 *
 * 기준선은 레벨마다 **한 번만** 고정된다. 아직 고정 전이면 진입 전 60일 기록으로 계산해
 * `freeze_level_baselines`에 넘기고, 그 뒤로는 저장된 값만 쓴다(원본 기록을 나중에 고쳐도
 * 기준선은 조용히 바뀌지 않는다).
 */
export async function getMyLevelGrowth(input: {
  /**
   * ⚠️ **반드시 본인 id로 거른다.** RLS는 크루 친구의 공개 세션도 읽게 열어 두어서,
   * 필터가 없으면 친구의 종목이 내 성장률에 섞인다 (evolution.ts와 같은 이유).
   */
  userId: string;
  level: number;
}): Promise<LevelGrowthResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: entry, error: entryError } = await supabase
    .from("user_level_history")
    .select("level, entered_at, baseline_frozen_at")
    .eq("user_id", input.userId)
    .eq("level", input.level)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) return { state: "no_entry", level: input.level };

  const row = entry as EntryRow;
  const enteredAtMs = Date.parse(row.entered_at);
  const since = new Date(enteredAtMs - BASELINE_WINDOW_DAYS * DAY_MS).toISOString();

  // ⚠️ 한 번에 읽으면 `limit`이 어느 쪽을 자를지 모른다. 기준선은 레벨마다 한 번 고정돼 영영 남으므로
  // 진입 전(기준선 쪽)과 진입 후(현재 쪽)를 따로, 최신순으로 읽어 한쪽이 다른 쪽을 밀어내지 못하게 한다.
  const sessionSelect =
    "completed_at, tabata_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, is_completed))";
  const [beforeRes, afterRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select(sessionSelect)
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .gt("completed_at", since)
      .lte("completed_at", row.entered_at)
      .order("completed_at", { ascending: false })
      .limit(1000),
    supabase
      .from("workout_sessions")
      .select(sessionSelect)
      .eq("user_id", input.userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .gt("completed_at", row.entered_at)
      .order("completed_at", { ascending: false })
      .limit(1000),
  ]);
  if (beforeRes.error) throw beforeRes.error;
  if (afterRes.error) throw afterRes.error;
  const sessions = [...(beforeRes.data ?? []), ...(afterRes.data ?? [])];

  const points = toMetricPoints(sessions as unknown as RawSession[]);

  let baselines: Baseline[];
  if (row.baseline_frozen_at) {
    const { data: stored, error: baselineError } = await supabase
      .from("level_growth_baselines")
      .select("exercise_key, metric_type, baseline_value, samples")
      .eq("user_id", input.userId)
      .eq("target_level", input.level)
      .eq("metric_version", METRIC_VERSION)
      .limit(500);
    if (baselineError) throw baselineError;
    baselines = ((stored ?? []) as BaselineRow[]).map((b) => ({
      exerciseKey: b.exercise_key,
      kind: b.metric_type,
      value: Number(b.baseline_value),
      samples: b.samples ?? [],
    }));
  } else {
    baselines = computeBaselines(points, enteredAtMs);
    // 고정은 최선 노력이다. 실패해도 화면은 계산값으로 그리고, 다음에 열 때 다시 시도한다.
    // `.rpc()`는 실패를 {error}로 돌려주지만, 네트워크 예외로 거부될 수도 있다 — 둘 다 삼킨다.
    try {
      await supabase.rpc("freeze_level_baselines", {
        p_level: input.level,
        p_metric_version: METRIC_VERSION,
        p_rows: baselines.map((b) => ({
          exercise_key: b.exerciseKey,
          metric_type: b.kind,
          baseline_value: b.value,
          samples: b.samples,
        })),
      });
    } catch {
      // 최선 노력
    }
  }

  return {
    state: "ready",
    level: input.level,
    enteredAt: row.entered_at,
    summary: computeLevelGrowth({ baselines, points, enteredAtMs }),
  };
}
