/**
 * 하루 계획 규칙 (사용자 결정 2026-10-13).
 *
 * 신고: 달력 오늘 칸에는 계획이 둘(점프 스쿼트 / 풀업·밴드 레터럴 레이즈)인데
 * 운동 탭에는 점프 스쿼트만 보였다. 0102가 하루 계획 여러 개를 허용했고, 운동
 * 탭은 그중 한 줄만 묶는다. 계획을 쓰는 7곳 중 5곳이 그날 계획이 있어도 새 행을
 * 만들었다.
 *
 * 결정: 하루 **일반 계획은 하나**. 인터벌·프로그램 회차는 구조가 달라(코스로
 * 열림 / 회차 진행률) 따로 둔다. 어디서 더하든 이 파일의 규칙으로 같은 행에 쓴다.
 *
 * ⚠️ DB 타입을 모른다 — `@/lib/day-plan-store.ts`가 조합한다.
 */
import { TABATA_EXERCISE_COUNT } from "./tabata";
import { normalizedExerciseName } from "./workout-import";
import type { PlanExercise } from "./workout-plan";

export type DayPlanLike = {
  id: string;
  planDate: string;
  // `isGeneralPlan`과 같은 이유로 선택 필드다 — 0059·0066 이전 행과 테스트 고정값에는
  // 두 필드가 아예 없다(undefined). 필수로 두면 그런 계획을 이 규칙들에 못 넘긴다.
  tabataMinutes?: number | null;
  programEnrollmentId?: string | null;
  exercises: PlanExercise[];
};

/**
 * ⚠️ `=== null`로 쓰지 마라. 0059·0066 이전 행과 테스트 고정값(`calendar-view.test`의
 *    `PLAN`)에는 두 필드가 **아예 없다**(undefined). 엄격 비교면 그 계획이 전부
 *    "특별 계획"으로 분류돼 운동 탭 목록에서 사라진다.
 */
export function isGeneralPlan(plan: {
  tabataMinutes?: number | null;
  programEnrollmentId?: string | null;
}): boolean {
  return !plan.tabataMinutes && !plan.programEnrollmentId;
}

/** 그날의 일반 계획. 목록은 조회가 정한 안정된 순서(예정 시각 → 만든 순서)다 */
export function pickDayGeneralPlan<P extends DayPlanLike>(plans: P[]): P | null {
  return plans.find(isGeneralPlan) ?? null;
}

/**
 * 한 계획에 담을 수 있는 종목 수 — DB check(0015)는 `exercises` 길이 1..50이다.
 *
 * ⚠️ 넘겨서 저장하면 DB가 거절할 뿐 아니라, 이미 들어간 행도 위험하다.
 *    `parsePlanExercises`가 50개 초과를 빈 배열로 돌려주고 `fromRow`는 빈 배열을
 *    `invalid_workout_plan`으로 던져서, **그 행 하나 때문에 달력 전체가 안 뜬다.**
 *    합치는 쪽이 이 상한을 지켜야 하는 이유다.
 */
export const MAX_PLAN_EXERCISES = 50;

/**
 * 이름이 겹치지 않는 종목만 뒤에 붙인다 — 겹치면 원래 계획의 세트가 남는다.
 *
 * - `skippedCount`: 이름이 비었거나 이미 있어서 건너뛴 수 (사용자가 잃는 것이 없다)
 * - `overflowCount`: 새 종목인데 `MAX_PLAN_EXERCISES`를 넘겨서 **못 넣은** 수
 *   (사용자가 담으려던 것이 빠졌으니 호출한 쪽이 알려야 한다)
 *
 * `base` 안에 이미 있는 중복은 손대지 않는다 — 합치기가 원본 계획을 고쳐 쓰면 안 된다.
 */
export function mergePlanExercises(
  base: PlanExercise[],
  added: PlanExercise[],
): { exercises: PlanExercise[]; skippedCount: number; overflowCount: number } {
  const known = new Set(base.map((item) => normalizedExerciseName(item.name)));
  const exercises = [...base];
  let skippedCount = 0;
  let overflowCount = 0;
  for (const item of added) {
    const name = normalizedExerciseName(item.name);
    if (!name || known.has(name)) {
      skippedCount += 1;
      continue;
    }
    // 넘쳐서 못 넣은 이름도 기록한다 — 같은 이름이 또 오면 "넘침"이 아니라 "중복"이다
    known.add(name);
    if (exercises.length >= MAX_PLAN_EXERCISES) {
      overflowCount += 1;
      continue;
    }
    exercises.push(item);
  }
  return { exercises, skippedCount, overflowCount };
}

export type DayPlanMerge = {
  keepId: string;
  exercises: PlanExercise[];
  deleteIds: string[];
};

/**
 * 같은 날 일반 계획이 둘 이상이면 첫 것에 합칠 계획. 합칠 것이 없으면 null.
 *
 * 나머지 계획을 순서대로 첫 계획에 합친다. **한 계획이라도 통째로 들어가지 못하면
 * (50개 초과) 거기서 멈춘다** — 그 계획과 뒤의 계획은 합치지도 지우지도 않는다.
 * 일부만 옮기고 지우면 종목이 사라지고, 건너뛰고 뒤의 것을 먼저 합치면 순서가 뒤집힌다.
 * 못 합친 계획은 그대로 남아 다음 읽기에서 다시 시도된다.
 */
export function planDayMerge<P extends DayPlanLike>(plans: P[]): DayPlanMerge | null {
  const general = plans.filter(isGeneralPlan);
  if (general.length < 2) return null;
  const [keep, ...rest] = general;
  let exercises = keep.exercises;
  const deleteIds: string[] = [];
  for (const other of rest) {
    const merged = mergePlanExercises(exercises, other.exercises);
    if (merged.overflowCount > 0) break;
    exercises = merged.exercises;
    deleteIds.push(other.id);
  }
  if (deleteIds.length === 0) return null;
  return { keepId: keep.id, exercises, deleteIds };
}

/**
 * 합쳐야 할 날짜 — **오늘 이후만**. 지난 계획은 0116이 수정·삭제를 막는다
 * (놓친 계획을 지워 월간 완료율이 오르는 구멍). 건드리면 DB가 거절한다.
 */
export function datesNeedingMerge<P extends DayPlanLike>(
  plans: P[],
  todayKey: string,
): string[] {
  const counts = new Map<string, number>();
  for (const plan of plans) {
    if (!isGeneralPlan(plan) || plan.planDate < todayKey) continue;
    counts.set(plan.planDate, (counts.get(plan.planDate) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();
}

/**
 * 운동을 완료한 뒤 오늘 계획에 남길 종목 (사용자 결정 2026-10-13).
 *
 * 세트를 **하나라도** 끝낸 종목은 한 것으로 본다. 하나도 안 한 종목만 남는다 —
 * 하루 한 계획이 되면서, 예전처럼 통째로 지우면 "오전에 절반만"이 나머지까지
 * 지운다.
 */
export function remainingAfterWorkout(
  planned: PlanExercise[],
  workout: { name: string; sets: { done: boolean }[] }[],
): PlanExercise[] {
  const done = new Set(
    workout
      .filter((item) => item.sets.some((set) => set.done))
      .map((item) => normalizedExerciseName(item.name)),
  );
  return planned.filter((item) => !done.has(normalizedExerciseName(item.name)));
}

// ── 퀘스트 = 오늘 달력 계획 전부 (사용자 결정 2026-11-26) ─────────────────────
//
// 신고: "오늘의 퀘스트 운동과 달력에 등록된 운동이 다르다." 같은 날 일반 계획과 인터벌
// 계획이 함께 있으면, 일반 계획이 목록(=퀘스트)으로 들어오고 인터벌 계획은 퀘스트에서
// 사라졌다(인터벌 카드는 목록이 비었을 때만 보였다). 결정: **퀘스트 카드 하나에 둘 다
// 담고 한 번에 이어서 한다** — 목록 안 인터벌(설계 2026-11-22)을 그대로 쓴다.

/** 인터벌 계획은 앞 4종이 블록, 그 뒤가 이어하기다 (`splitIntervalPlan`, 시작 위치 0) */
const INTERVAL_BLOCK_SIZE = TABATA_EXERCISE_COUNT;

/**
 * 오늘 목록과 **함께 퀘스트에 담을 인터벌 계획**. 없으면 null.
 *
 * - 목록이 이미 인터벌을 들었으면(`listHasInterval`) 없다 — 한 목록에 인터벌은 하나다
 * - 프로그램 회차 목록이면 없다 — 회차에는 인터벌을 담지 않는다(`addIntervalToList`와 같다)
 * - 목록이 묶인 계획 자신이면 없다
 */
export function pickCompanionIntervalPlan<P extends DayPlanLike>(input: {
  todayPlans: P[];
  boundPlanId: string | null;
  listHasInterval: boolean;
  listIsProgram: boolean;
}): P | null {
  if (input.listHasInterval || input.listIsProgram) return null;
  return (
    input.todayPlans.find(
      (plan) =>
        Boolean(plan.tabataMinutes) &&
        !plan.programEnrollmentId &&
        plan.id !== input.boundPlanId &&
        plan.exercises.length >= INTERVAL_BLOCK_SIZE,
    ) ?? null
  );
}

/**
 * 인터벌 계획의 이어하기 종목 중 **목록에 아직 없는 것만** — 이름이 겹치면 목록 쪽 세트를 남긴다
 * (`mergePlanExercises`와 같은 규칙).
 */
export function followUpsNotInList<T extends { name: string }>(
  listNames: readonly string[],
  followUps: readonly T[],
): T[] {
  const known = new Set(listNames.map(normalizedExerciseName));
  const out: T[] = [];
  for (const item of followUps) {
    const name = normalizedExerciseName(item.name);
    if (!name || known.has(name)) continue;
    known.add(name);
    out.push(item);
  }
  return out;
}

export type OtherPlanSettle =
  | { kind: "keep" }
  | { kind: "delete" }
  /** 안 한 종목만 남긴다. 인터벌 블록을 끝낸 인터벌 계획은 남은 이어하기만 든 일반 계획이 된다 */
  | { kind: "update"; exercises: PlanExercise[] };

type WorkoutItem = { name: string; sets: { done: boolean }[] };

function doneNames(items: readonly WorkoutItem[]): Set<string> {
  return new Set(
    items
      .filter((item) => item.sets.some((set) => set.done))
      .map((item) => normalizedExerciseName(item.name)),
  );
}

/**
 * 운동을 끝낸 뒤 **묶이지 않은** 오늘 계획을 어떻게 할지 (사용자 결정 2026-11-26).
 *
 * 예전엔 목록이 묶인 계획 하나만 정리했다(`settlePlanAfterWorkout`). 그래서 퀘스트(제안)로
 * 운동하거나 일반+인터벌을 한 번에 하면, 한 운동이 달력에 "예정"으로 남았다 — 운영
 * 10/27~11/25에 계획이 남은 운동일 12일이 있었다.
 *
 * - 프로그램 회차는 손대지 않는다 — 회차 진행표가 사라진다(묶인 경우만 정리한다)
 * - 일반 계획: 인터벌 블록을 **뺀** 운동(`regular`)과 이름을 맞춰, 한 종목을 뺀다.
 *   블록의 "버피"가 일반 계획의 "버피"를 지우면 안 된다(블록 횟수는 라운드 수다)
 * - 인터벌 계획: 이 운동에 인터벌 블록이 있고(`intervalBlock`) 계획의 블록 4종을 **다** 했을
 *   때만 블록을 끝낸 것으로 본다. 그다음 이어하기도 `regular`로 맞춰 남은 것만 남긴다.
 *   블록을 안 했으면 그대로 둔다 — 블록 일부만 남기면 인터벌이 깨진다
 */
export function settleOtherDayPlan(
  plan: DayPlanLike,
  workout: { regular: readonly WorkoutItem[]; intervalBlock: readonly WorkoutItem[] | null },
): OtherPlanSettle {
  if (plan.programEnrollmentId) return { kind: "keep" };
  const regularDone = doneNames(workout.regular);
  const notDone = (items: PlanExercise[]) =>
    items.filter((item) => !regularDone.has(normalizedExerciseName(item.name)));

  if (!plan.tabataMinutes) {
    const remaining = notDone(plan.exercises);
    if (remaining.length === 0) return { kind: "delete" };
    if (remaining.length === plan.exercises.length) return { kind: "keep" };
    return { kind: "update", exercises: remaining };
  }

  if (!workout.intervalBlock) return { kind: "keep" };
  const blockDone = doneNames(workout.intervalBlock);
  const block = plan.exercises.slice(0, INTERVAL_BLOCK_SIZE);
  if (!block.every((item) => blockDone.has(normalizedExerciseName(item.name)))) {
    return { kind: "keep" };
  }
  const remaining = notDone(plan.exercises.slice(INTERVAL_BLOCK_SIZE));
  return remaining.length === 0 ? { kind: "delete" } : { kind: "update", exercises: remaining };
}
