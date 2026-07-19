import {
  parsePlanExercises,
  type PlanExercise,
} from "@/lib/domain/workout-plan";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type WorkoutPlan = {
  id: string;
  userId: string;
  planDate: string;
  sourceSessionId: string | null;
  exercises: PlanExercise[];
  createdAt: string;
  updatedAt: string;
};

type WorkoutPlanRow = {
  id: string;
  user_id: string;
  plan_date: string;
  source_session_id: string | null;
  exercises: unknown;
  created_at: string;
  updated_at: string;
};

function fromRow(row: WorkoutPlanRow): WorkoutPlan {
  const exercises = parsePlanExercises(row.exercises);
  if (exercises.length === 0) throw new Error("invalid_workout_plan");
  return {
    id: row.id,
    userId: row.user_id,
    planDate: row.plan_date,
    sourceSessionId: row.source_session_id,
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWorkoutPlans(userId: string): Promise<WorkoutPlan[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .order("plan_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as WorkoutPlanRow[]).map(fromRow);
}

export async function saveWorkoutPlan(input: {
  userId: string;
  planDate: string;
  /** 지난 세션 복사면 세션 id, 새로 짠 계획이면 null (0015 RLS가 둘 다 허용) */
  sourceSessionId: string | null;
  exercises: PlanExercise[];
}): Promise<WorkoutPlan> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_plans")
    .upsert(
      {
        user_id: input.userId,
        plan_date: input.planDate,
        source_session_id: input.sourceSessionId,
        exercises: input.exercises,
      },
      { onConflict: "user_id,plan_date" },
    )
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as WorkoutPlanRow);
}

export async function moveWorkoutPlan(
  planId: string,
  targetDate: string,
  replace: boolean,
): Promise<WorkoutPlan> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("move_workout_plan", {
    p_plan_id: planId,
    p_target_date: targetDate,
    p_replace: replace,
  });
  if (error) throw error;
  return fromRow(data as WorkoutPlanRow);
}

export async function deleteWorkoutPlan(planId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("workout_plans").delete().eq("id", planId);
  if (error) throw error;
}
