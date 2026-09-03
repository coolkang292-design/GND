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
  /*
    ⚠️ 상한이 **8**이다 (2026-09-04). 사다리 24회차는 3개씩 8묶음이라
       7·8주차가 나온다. 여기가 6으로 남아 있으면 그 행을 읽는 순간
       `invalid_workout_plan_program_metadata`를 던지고 **달력 전체가 안
       뜬다** — 계획 하나가 아니라 화면이 통째로 죽는다.

       DB(0101)의 `program_week` check와 **같은 범위**여야 한다. 한쪽만
       넓히면 서버는 저장하는데 앱이 못 읽는 상태가 된다.
  */
  const programWeek = boundedInteger(row.program_week, 1, 8);
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
    /*
      같은 날 계획이 여러 개일 수 있다 (0101). 날짜만으로 정렬하면 같은 날
      안에서 순서가 조회할 때마다 달라져서, 달력 카드가 이유 없이 위아래로
      바뀐다. 예정 시각 → 만든 순서로 **안정된 순서**를 만든다.
    */
    .order("plan_date", { ascending: true })
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as WorkoutPlanRow[]).map(fromRow);
}

/**
 * 특정 날짜의 계획 **전부** (없으면 빈 배열).
 *
 * ⚠️ 2026-09-04까지 이 함수는 `getWorkoutPlanByDate`였고 `.maybeSingle()`로
 *    한 줄만 받았다. 같은 날 계획이 둘 이상이면 `.maybeSingle()`은 값을 주는
 *    대신 **에러를 던진다** — 하루 1계획 제약(0015)을 푸는 순간 기록 화면이
 *    통째로 죽는 자리였다. 목록으로 바꾼 것은 취향이 아니라 필수였다.
 *
 * 날짜 필터는 여전히 DB가 한다. 달력과 프로그램 화면은 `getWorkoutPlans`로
 * 전량을 받는다 — 그쪽은 정말로 전 기간이 필요하다.
 */
export async function getWorkoutPlansByDate(
  userId: string,
  planDate: string,
): Promise<WorkoutPlan[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    // `getWorkoutPlans`와 같은 순서 규칙 — 두 경로가 다른 순서를 주면
    // 달력에서 본 첫 계획과 기록 화면이 집는 첫 계획이 달라진다
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as WorkoutPlanRow[]).map(fromRow);
}

/**
 * 새 계획 한 줄을 만든다.
 *
 * ⚠️ 2026-09-04까지는 `saveWorkoutPlan`이 `(user_id, plan_date)` **upsert**로
 *    만들기와 고치기를 겸했다. 0101이 그 unique 제약을 없애면 upsert의
 *    `onConflict` 대상이 사라져 Postgres가 42P10으로 거절한다 — 만들기와
 *    고치기를 갈라 놓은 것은 그 때문이다.
 *
 * ⚠️ **0101 적용 전에는** 그날 이미 계획이 있으면 23505(unique_violation)가
 *    난다. 부르는 쪽이 그 코드를 사람 말로 바꿔 준다(`planSaveErrorText`).
 */
export async function createWorkoutPlan(input: {
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
    .insert({
      user_id: input.userId,
      plan_date: input.planDate,
      source_session_id: input.sourceSessionId,
      exercises: input.exercises,
      tabata_minutes: input.tabataMinutes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as WorkoutPlanRow);
}

/**
 * 기존 계획을 고친다 — **id로 잡는다**.
 *
 * 날짜로 잡던 예전 방식은 같은 날 계획이 둘이면 어느 것을 고칠지 말할 수 없다.
 *
 * ⚠️ `tabata_minutes`를 항상 명시한다. 생략하면 일반 계획으로 고쳤는데도 옛
 *    타바타 표식이 남아 회차 종류가 갈린다 (upsert 시절과 같은 함정).
 */
export async function updateWorkoutPlan(input: {
  planId: string;
  sourceSessionId: string | null;
  exercises: PlanExercise[];
  tabataMinutes?: TabataMinutes | null;
}): Promise<WorkoutPlan> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_plans")
    .update({
      source_session_id: input.sourceSessionId,
      exercises: input.exercises,
      tabata_minutes: input.tabataMinutes ?? null,
    })
    .eq("id", input.planId)
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
