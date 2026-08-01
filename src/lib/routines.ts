import {
  parsePlanExercises,
  type PlanExercise,
} from "@/lib/domain/workout-plan";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 나만의 운동 루틴 (0056) — `workout-plan.ts`를 그대로 미러링한다.
 *
 * 저장 포맷은 `workout_plans.exercises`와 **동일한 jsonb**라 직렬화 함수
 * (`parsePlanExercises`·`toPlanExercises`·`toDraftExercises`)를 새로 만들지 않는다.
 */
export type WorkoutRoutine = {
  id: string;
  userId: string;
  name: string;
  exercises: PlanExercise[];
  createdAt: string;
  updatedAt: string;
};

type WorkoutRoutineRow = {
  id: string;
  user_id: string;
  name: string;
  exercises: unknown;
  created_at: string;
  updated_at: string;
};

function fromRow(row: WorkoutRoutineRow): WorkoutRoutine {
  const exercises = parsePlanExercises(row.exercises);
  if (exercises.length === 0) throw new Error("invalid_workout_routine");
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 이름 중복(유니크 인덱스) */
export const ROUTINE_DUPLICATE_NAME = "routine_duplicate_name";
/** 슬롯 한도 초과 (0056 트리거) — 뒤에 한도 숫자가 붙는다 */
export const ROUTINE_SLOT_LIMIT = "routine_slot_limit";

/**
 * DB 오류를 화면이 읽을 수 있는 코드로 바꾼다.
 *
 * 유니크 위반은 23505, 슬롯 한도는 트리거가 `routine_slot_limit:N`을 던진다.
 * 그대로 흘리면 사용자에게 Postgres 문구가 보인다.
 */
function translateError(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new Error(ROUTINE_DUPLICATE_NAME);
  if (error.message?.includes(ROUTINE_SLOT_LIMIT)) {
    return new Error(ROUTINE_SLOT_LIMIT);
  }
  return new Error(error.message ?? "routine_save_failed");
}

export async function getMyRoutines(userId: string): Promise<WorkoutRoutine[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_routines")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as WorkoutRoutineRow[]).map(fromRow);
}

export async function saveRoutine(input: {
  userId: string;
  name: string;
  exercises: PlanExercise[];
}): Promise<WorkoutRoutine> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_routines")
    .insert({
      user_id: input.userId,
      name: input.name.trim(),
      exercises: input.exercises,
    })
    .select()
    .single();
  if (error) throw translateError(error);
  return fromRow(data as WorkoutRoutineRow);
}

export async function renameRoutine(
  routineId: string,
  name: string,
): Promise<WorkoutRoutine> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_routines")
    .update({ name: name.trim() })
    .eq("id", routineId)
    .select()
    .single();
  if (error) throw translateError(error);
  return fromRow(data as WorkoutRoutineRow);
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("workout_routines")
    .delete()
    .eq("id", routineId);
  if (error) throw error;
}
