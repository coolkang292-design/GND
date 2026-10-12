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
 *
 * ⚠️ 합치기(`consolidate*`)는 **쓰기에 한해 최선 노력**이다. 달력은 로드할 때마다 이걸
 *    부르고, 거기서 던지면 달력이 통째로 오류 화면이 된다. 합치기는 정리일 뿐 필수가
 *    아니므로 쓰기가 실패하면 경고만 남기고 **DB에 실제로 있는 목록**을 돌려준다.
 *    읽기 실패는 그대로 던진다 — 돌려줄 목록 자체가 없다.
 */
import {
  datesNeedingMerge,
  isGeneralPlan,
  mergePlanExercises,
  pickDayGeneralPlan,
  planDayMerge,
  remainingAfterWorkout,
} from "@/lib/domain/day-plan";
import { errorText } from "@/lib/domain/error-text";
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
  let saved = keep;
  // 새로 들어간 종목이 없으면(나머지가 전부 이름이 겹침) 고칠 것이 없다 — 지우기만 한다.
  // 쓸데없는 UPDATE는 잠긴 계획에서 괜히 거절당할 길만 늘린다
  if (merge.exercises.length !== keep.exercises.length) {
    try {
      saved = await updateWorkoutPlan({
        planId: keep.id,
        sourceSessionId: keep.sourceSessionId,
        exercises: merge.exercises,
        tabataMinutes: null,
      });
    } catch (error) {
      // 고치기가 실패했는데 지우면 종목이 사라진다 — 아무것도 지우지 않고 그대로 둔다.
      // 다음 읽기에서 다시 시도된다
      console.warn("[day-plan] 같은 날 계획 합치기 실패", error);
      return plans;
    }
  }
  // 지우기는 하나씩 따로 — 하나가 실패해도 나머지는 지우고, 못 지운 계획은 목록에 남겨
  // 돌려주는 목록이 DB와 어긋나지 않게 한다. 종목은 이미 합쳐졌으니 다음 읽기에서
  // "새로 들어갈 것 없음"으로 지우기만 다시 시도된다
  const failedIds = new Set<string>();
  for (const id of merge.deleteIds) {
    try {
      await deleteWorkoutPlan(id);
    } catch (error) {
      failedIds.add(id);
      console.warn("[day-plan] 합친 계획 지우기 실패", error);
    }
  }
  return plans
    .filter((plan) => !merge.deleteIds.includes(plan.id) || failedIds.has(plan.id))
    .map((plan) => (plan.id === saved.id ? saved : plan));
}

export type DayPlanAddInput = {
  userId: string;
  planDate: string;
  exercises: PlanExercise[];
  sourceSessionId?: string | null;
};

export type DayPlanAddResult = {
  /** 종목이 들어간 그날의 일반 계획 */
  plan: WorkoutPlan;
  /** 그날 계획 전부 (합친 뒤) — 달력이 이 날짜를 통째로 갈아 끼운다 */
  dayPlans: WorkoutPlan[];
  created: boolean;
  /** 이름이 비었거나 이미 있어서 건너뛴 수 */
  skippedCount: number;
  /**
   * 새 종목인데 한 계획의 상한(`MAX_PLAN_EXERCISES`)을 넘겨 **못 담은** 수.
   * 0보다 크면 부르는 쪽이 사용자에게 알려야 한다 — 말없이 빠지면 담은 줄 안다
   */
  overflowCount: number;
};

/**
 * 같은 사용자·날짜의 `addToDayPlan`을 줄 세운다. 키는 `userId + planDate`.
 *
 * 왜. "읽기 → 없으면 만들기"는 한 덩어리가 아니다. 더블탭이나 두 화면의 동시 추가가
 * 둘 다 "그날 계획 없음"을 읽으면 행이 **둘** 생긴다(0101이 하루 여러 계획을 허용했다).
 * 이 모듈 안에서만 막는다 — 탭·기기를 넘는 경합은 막지 못한다(DB 제약이 필요하다).
 *
 * 앞 작업이 실패해도 뒤 작업은 돈다 — 줄에는 항상 "끝났음"만 남긴다.
 */
const addQueues = new Map<string, Promise<unknown>>();

function runSerialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = addQueues.get(key) ?? Promise.resolve();
  const result = previous.then(task);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  addQueues.set(key, tail);
  // 맨 뒤 작업이 끝났을 때만 지운다 — 그 사이 새 작업이 줄을 이었다면 그 줄을 건드리지 않는다
  void tail.then(() => {
    if (addQueues.get(key) === tail) addQueues.delete(key);
  });
  return result;
}

/** 그날 일반 계획이 있으면 붙이고, 없으면 만든다 */
export function addToDayPlan(input: DayPlanAddInput): Promise<DayPlanAddResult> {
  return runSerialized(`${input.userId}:${input.planDate}`, () => addToDayPlanNow(input));
}

async function addToDayPlanNow(input: DayPlanAddInput): Promise<DayPlanAddResult> {
  const dayPlans = await consolidateDayPlans(input.userId, input.planDate);
  const general = pickDayGeneralPlan(dayPlans);
  if (!general) {
    // 새로 만들 때도 같은 규칙을 지난다 — 빈 이름·중복·50개 초과가 그대로 저장되면
    // DB가 거절하거나(0015), 더 나쁘게는 읽을 수 없는 행이 되어 달력이 죽는다
    const fresh = mergePlanExercises([], input.exercises);
    if (fresh.exercises.length === 0) throw new Error("invalid_workout_plan");
    const plan = await createWorkoutPlan({
      userId: input.userId,
      planDate: input.planDate,
      sourceSessionId: input.sourceSessionId ?? null,
      exercises: fresh.exercises,
    });
    return {
      plan,
      dayPlans: [...dayPlans, plan],
      created: true,
      skippedCount: fresh.skippedCount,
      overflowCount: fresh.overflowCount,
    };
  }
  const merged = mergePlanExercises(general.exercises, input.exercises);
  if (merged.exercises.length === general.exercises.length) {
    return {
      plan: general,
      dayPlans,
      created: false,
      skippedCount: merged.skippedCount,
      overflowCount: merged.overflowCount,
    };
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
    overflowCount: merged.overflowCount,
  };
}

/**
 * - `deleted`: 계획을 지웠다 (다 했거나, 인터벌·프로그램 회차)
 * - `trimmed`: 안 한 종목만 남기고 고쳤다
 * - `kept`: 계획 종목을 하나도 안 해서 그대로 뒀다
 * - `gone`: 계획이 이미 없다
 * - `locked`: 지난 계획이라 DB가 막았다 — 기록으로 남는다. 실패가 아니다
 */
export type SettlePlanResult = "deleted" | "trimmed" | "kept" | "gone" | "locked";

/**
 * 지난 계획이라 쓰기가 막혔는가 (0116 `guard_past_workout_plan`).
 *
 * `PGRST116`은 RLS가 행을 가려 `.single()`이 0행을 받았을 때의 PostgREST 코드다 —
 * 잠긴 계획이 이 모양으로 오기도 한다.
 */
function isPastPlanLocked(error: unknown): boolean {
  const text = errorText(error);
  if (text.includes("past_plan_locked") || text.includes("past_plan_date")) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "PGRST116"
  );
}

/**
 * 운동을 완료한 뒤 묶인 계획을 정리한다 (사용자 결정 2026-10-13).
 * 예전에는 무조건 지웠다(`record/page.tsx` 완료 흐름).
 */
export async function settlePlanAfterWorkout(
  planId: string,
  workout: { name: string; sets: { done: boolean }[] }[],
): Promise<SettlePlanResult> {
  const plan = await getWorkoutPlanById(planId);
  if (!plan) return "gone";
  try {
    if (!isGeneralPlan(plan)) {
      await deleteWorkoutPlan(plan.id);
      return "deleted";
    }
    const remaining = remainingAfterWorkout(plan.exercises, workout);
    if (remaining.length === 0) {
      await deleteWorkoutPlan(plan.id);
      return "deleted";
    }
    if (remaining.length === plan.exercises.length) return "kept";
    await updateWorkoutPlan({
      planId: plan.id,
      sourceSessionId: plan.sourceSessionId,
      exercises: remaining,
      tabataMinutes: null,
    });
    return "trimmed";
  } catch (error) {
    // 자정 전에 시작한 운동을 자정 뒤에 끝내면 계획 날짜가 이미 어제다. 0116이 지난
    // 계획의 수정·삭제를 막는 것은 정상 동작이고, 계획은 기록으로 남는다. 운동 저장은
    // 이미 끝났으니 이걸 실패로 올리면 사용자에게 없는 오류를 보이게 된다
    if (isPastPlanLocked(error)) return "locked";
    throw error;
  }
}

/** `getWorkoutPlans`와 같은 순서: 날짜 → 예정 시각(없으면 먼저) → 만든 순서 */
function comparePlanOrder(a: WorkoutPlan, b: WorkoutPlan): number {
  if (a.planDate !== b.planDate) return a.planDate < b.planDate ? -1 : 1;
  if (a.scheduledAt !== b.scheduledAt) {
    if (a.scheduledAt === null) return -1;
    if (b.scheduledAt === null) return 1;
    const byTime = compareInstant(a.scheduledAt, b.scheduledAt);
    if (byTime !== 0) return byTime;
  }
  return compareInstant(a.createdAt, b.createdAt);
}

function compareInstant(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  // 같은 순간을 다른 표기("Z" / "+00:00")로 받아도 같은 값이다
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 달력이 받은 전 기간 목록에서 **오늘 이후** 중복 날짜를 합친다.
 * 지난 날짜는 0116 잠금 때문에 건드리지 않는다(`datesNeedingMerge`).
 *
 * 날짜 하나가 실패해도 던지지 않는다 — 여기서 던지면 달력이 통째로 오류 화면이다.
 * 실패한 날짜는 받은 그대로 두고 나머지를 계속한다. 합친 날짜를 뒤에 붙이면 순서가
 * 흐트러지므로 마지막에 `getWorkoutPlans`와 같은 순서로 다시 세운다.
 */
export async function consolidateUpcomingPlans(
  userId: string,
  plans: WorkoutPlan[],
  todayKey: string,
): Promise<WorkoutPlan[]> {
  let next = plans;
  for (const date of datesNeedingMerge(plans, todayKey)) {
    try {
      const merged = await consolidateDayPlans(userId, date);
      next = [...next.filter((plan) => plan.planDate !== date), ...merged];
    } catch (error) {
      console.warn("[day-plan] 같은 날 계획 합치기 실패", error);
    }
  }
  return [...next].sort(comparePlanOrder);
}
