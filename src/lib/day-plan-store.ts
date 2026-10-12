/**
 * 하루 계획 저장소 (사용자 결정 2026-10-13) — 규칙은 `domain/day-plan.ts`.
 *
 * 일반 계획을 **만들거나 더하는 곳은 전부** `addToDayPlan`을 부른다. 운동 탭
 * push, 달력 새 계획(검색·설정·루틴·지난 기록), 날짜 이동 합치기가 여기를 거친다.
 * `createWorkoutPlan`을 일반 계획에 직접 부르면 그날 계획이 둘이 되고, 운동 탭은
 * 하나만 보여 준다 — 2026-10-13 신고가 그것이었다. 인터벌 계획만 예외로 직접 만든다.
 *
 * ⚠️ 쓰는 순서는 언제나 **고치기 → 지우기**다. 반대로 하면 지우기만 성공했을 때
 *    종목이 사라진다. 고치기만 성공하면 다음 읽기에서 같은 이름이 걸러져 다시 합쳐진다.
 */
import {
  datesNeedingMerge,
  isGeneralPlan,
  mergePlanExercises,
  pickDayGeneralPlan,
  planDayMerge,
  remainingAfterWorkout,
} from "@/lib/domain/day-plan";
import type { PlanExercise } from "@/lib/domain/workout-plan";
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  getWorkoutPlanById,
  getWorkoutPlansByDate,
  updateWorkoutPlan,
  type WorkoutPlan,
} from "@/lib/workout-plan";

/** 그날 계획 전부를 읽고, 일반 계획이 둘 이상이면 하나로 합친 결과를 돌려준다 */
export async function consolidateDayPlans(
  userId: string,
  planDate: string,
): Promise<WorkoutPlan[]> {
  const plans = await getWorkoutPlansByDate(userId, planDate);
  return applyDayMerge(plans);
}

async function applyDayMerge(plans: WorkoutPlan[]): Promise<WorkoutPlan[]> {
  const merge = planDayMerge(plans);
  if (!merge) return plans;
  const keep = plans.find((plan) => plan.id === merge.keepId)!;
  const saved = await updateWorkoutPlan({
    planId: keep.id,
    sourceSessionId: keep.sourceSessionId,
    exercises: merge.exercises,
    tabataMinutes: null,
  });
  for (const id of merge.deleteIds) await deleteWorkoutPlan(id);
  return plans
    .filter((plan) => !merge.deleteIds.includes(plan.id))
    .map((plan) => (plan.id === saved.id ? saved : plan));
}

export type DayPlanAddResult = {
  /** 종목이 들어간 그날의 일반 계획 */
  plan: WorkoutPlan;
  /** 그날 계획 전부 (합친 뒤) — 달력이 이 날짜를 통째로 갈아 끼운다 */
  dayPlans: WorkoutPlan[];
  created: boolean;
  skippedCount: number;
};

/** 그날 일반 계획이 있으면 붙이고, 없으면 만든다 */
export async function addToDayPlan(input: {
  userId: string;
  planDate: string;
  exercises: PlanExercise[];
  sourceSessionId?: string | null;
}): Promise<DayPlanAddResult> {
  const dayPlans = await consolidateDayPlans(input.userId, input.planDate);
  const general = pickDayGeneralPlan(dayPlans);
  if (!general) {
    const plan = await createWorkoutPlan({
      userId: input.userId,
      planDate: input.planDate,
      sourceSessionId: input.sourceSessionId ?? null,
      exercises: input.exercises,
    });
    return { plan, dayPlans: [...dayPlans, plan], created: true, skippedCount: 0 };
  }
  const merged = mergePlanExercises(general.exercises, input.exercises);
  if (merged.exercises.length === general.exercises.length) {
    return { plan: general, dayPlans, created: false, skippedCount: merged.skippedCount };
  }
  const plan = await updateWorkoutPlan({
    planId: general.id,
    // 넘기지 않으면 null로 덮인다 — 원본 세션 연결을 잃지 않는다
    sourceSessionId: general.sourceSessionId,
    exercises: merged.exercises,
    tabataMinutes: null,
  });
  return {
    plan,
    dayPlans: dayPlans.map((item) => (item.id === plan.id ? plan : item)),
    created: false,
    skippedCount: merged.skippedCount,
  };
}

/**
 * 운동을 완료한 뒤 묶인 계획을 정리한다 (사용자 결정 2026-10-13).
 * 예전에는 무조건 지웠다(`record/page.tsx` 완료 흐름).
 */
export async function settlePlanAfterWorkout(
  planId: string,
  workout: { name: string; sets: { done: boolean }[] }[],
): Promise<void> {
  const plan = await getWorkoutPlanById(planId);
  if (!plan) return;
  if (!isGeneralPlan(plan)) {
    await deleteWorkoutPlan(plan.id);
    return;
  }
  const remaining = remainingAfterWorkout(plan.exercises, workout);
  if (remaining.length === 0) {
    await deleteWorkoutPlan(plan.id);
    return;
  }
  if (remaining.length === plan.exercises.length) return;
  await updateWorkoutPlan({
    planId: plan.id,
    sourceSessionId: plan.sourceSessionId,
    exercises: remaining,
    tabataMinutes: null,
  });
}

/**
 * 달력이 받은 전 기간 목록에서 **오늘 이후** 중복 날짜를 합친다.
 * 지난 날짜는 0116 잠금 때문에 건드리지 않는다(`datesNeedingMerge`).
 */
export async function consolidateUpcomingPlans(
  userId: string,
  plans: WorkoutPlan[],
  todayKey: string,
): Promise<WorkoutPlan[]> {
  let next = plans;
  for (const date of datesNeedingMerge(plans, todayKey)) {
    const merged = await consolidateDayPlans(userId, date);
    next = [...next.filter((plan) => plan.planDate !== date), ...merged];
  }
  return next;
}
