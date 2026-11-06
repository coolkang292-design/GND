import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  evaluateEvolution,
  type EvolutionStatus,
} from "@/lib/domain/evolution";
import { computeGrowth, type GrowthRecord } from "@/lib/domain/evolution-growth";

type SessionRow = {
  completed_at: string;
  workout_exercises:
    | {
        exercise_name: string;
        workout_sets:
          | {
              weight_kg: number | null;
              reps: number | null;
              duration_seconds: number | null;
              is_completed: boolean | null;
            }[]
          | null;
      }[]
    | null;
};

/**
 * 다음 진화 현황 — **읽기 전용**. 본인 완료 세션만 읽고(user_id 필터) 아무것도 쓰지 않는다.
 * 유효 운동일 = 완료(status=completed)·삭제 안 됨·완료 시각 있음. 같은 날 여러 세션은 1일.
 */
export async function getMyEvolutionStatus(input: {
  /**
   * ⚠️ **반드시 본인 id로 거른다.** RLS는 크루 친구의 공개(group) 세션도 읽게 열어
   * 두어서, 필터가 없으면 친구의 운동일·종목이 내 진화 현황에 섞인다(실측: 본인 64일
   * 세션인데 필터 없이는 138세션이 읽힘).
   */
  userId: string;
  totalXp: number;
  currentStage: number;
}): Promise<EvolutionStatus> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "completed_at, workout_exercises(exercise_name, workout_sets(weight_kg, reps, duration_seconds, is_completed))",
    )
    .eq("user_id", input.userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .limit(2000);
  if (error) throw error;

  const rows = (data ?? []) as unknown as SessionRow[];
  const workoutDays: string[] = [];
  const records: GrowthRecord[] = [];
  for (const row of rows) {
    const day = dayKey(new Date(row.completed_at), DEFAULT_TIMEZONE);
    workoutDays.push(day);
    for (const ex of row.workout_exercises ?? []) {
      const sets = (ex.workout_sets ?? []).filter((s) => s.is_completed !== false);
      if (sets.length === 0) continue;
      records.push({
        exercise: ex.exercise_name,
        day,
        sets: sets.map((s) => ({
          weight_kg: s.weight_kg,
          reps: s.reps,
          duration_seconds: s.duration_seconds,
        })),
      });
    }
  }

  return evaluateEvolution({
    totalXp: input.totalXp,
    currentStage: input.currentStage,
    workoutDays,
    today: dayKey(new Date(), DEFAULT_TIMEZONE),
    growth: computeGrowth(records),
  });
}
