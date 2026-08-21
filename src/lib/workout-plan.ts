import {
  parsePlanExercises,
  type PlanExercise,
} from "@/lib/domain/workout-plan";
import { asTabataMinutes, type TabataMinutes } from "@/lib/domain/tabata";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type WorkoutPlan = {
  id: string;
  userId: string;
  planDate: string;
  sourceSessionId: string | null;
  exercises: PlanExercise[];
  /** 🔥 타바타 코스 분수 (4|8|16). null이면 일반 운동 계획 (0059) */
  tabataMinutes: TabataMinutes | null;
  title: string | null;
  scheduledAt: string | null;
  programEnrollmentId: string | null;
  programWeek: number | null;
  programSession: number | null;
  programTemplateVersion: number | null;
  createdAt: string;
  updatedAt: string;
};

type WorkoutPlanRow = {
  id: string;
  user_id: string;
  plan_date: string;
  source_session_id: string | null;
  exercises: unknown;
  tabata_minutes?: number | null; // 0059 적용 전에는 컬럼이 없을 수 있다
  title?: string | null;
  scheduled_at?: string | null;
  program_enrollment_id?: string | null;
  program_week?: number | null;
  program_session?: number | null;
  program_template_version?: number | null;
  created_at: string;
  updated_at: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function optionalTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length >= 1 && title.length <= 80 ? title : null;
}

function optionalIsoDate(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function fromRow(row: WorkoutPlanRow): WorkoutPlan {
  const exercises = parsePlanExercises(row.exercises);
  if (exercises.length === 0) throw new Error("invalid_workout_plan");
  const title = optionalTitle(row.title);
  const scheduledAt = optionalIsoDate(row.scheduled_at);
  const programEnrollmentId =
    typeof row.program_enrollment_id === "string" &&
    UUID.test(row.program_enrollment_id)
      ? row.program_enrollment_id
      : null;
  const programWeek = boundedInteger(row.program_week, 1, 6);
  const programSession = boundedInteger(row.program_session, 1, 3);
  const programTemplateVersion = boundedInteger(
    row.program_template_version,
    1,
    10_000,
  );
  if (
    row.program_enrollment_id != null &&
    (!programEnrollmentId ||
      !title ||
      !scheduledAt ||
      !programWeek ||
      !programSession ||
      !programTemplateVersion)
  ) {
    throw new Error("invalid_workout_plan_program_metadata");
  }
  return {
    id: row.id,
    userId: row.user_id,
    planDate: row.plan_date,
    sourceSessionId: row.source_session_id,
    exercises,
    tabataMinutes: asTabataMinutes(row.tabata_minutes),
    title,
    scheduledAt,
    programEnrollmentId,
    programWeek,
    programSession,
    programTemplateVersion,
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

/**
 * 특정 날짜의 계획 하나 (없으면 `null`).
 *
 * 기록 화면은 **오늘 계획 하나**만 쓰는데 예전에는 두 이펙트가 각자
 * `getWorkoutPlans`로 전 기간을 긁어와 `find`로 오늘을 골랐다 — 같은 조회가
 * 두 번 돌고, "오늘을 고르는 규칙"도 두 벌이라 한쪽만 고치면 갈라진다.
 * 날짜 필터를 DB에 맡기고 규칙을 여기 한 곳에 둔다.
 *
 * 달력과 프로그램 화면은 여전히 `getWorkoutPlans`로 전량을 받는다 — 그쪽은
 * 정말로 목록이 필요하다.
 */
export async function getWorkoutPlanByDate(
  userId: string,
  planDate: string,
): Promise<WorkoutPlan | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as WorkoutPlanRow) : null;
}

export async function saveWorkoutPlan(input: {
  userId: string;
  planDate: string;
  /** 지난 세션 복사면 세션 id, 새로 짠 계획이면 null (0015 RLS가 둘 다 허용) */
  sourceSessionId: string | null;
  exercises: PlanExercise[];
  /** 🔥 타바타 계획이면 코스 분수 (0059). 일반 계획은 생략 */
  tabataMinutes?: TabataMinutes | null;
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
        // 덮어쓰기(upsert)이므로 일반 계획일 때 null을 **명시해야** 한다.
        // 생략하면 같은 날짜의 옛 타바타 표식이 그대로 남는다.
        tabata_minutes: input.tabataMinutes ?? null,
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
