import {
  isTimeMeasured,
  planFromSets,
  type SetupItem,
  type SetupPlan,
} from "@/lib/domain/recommended-sets";
import { mergeImportedExercises } from "@/lib/domain/workout-import";
import {
  parsePlanExercises,
  type PlanExercise,
  type PlanSet,
} from "@/lib/domain/workout-plan";

/**
 * 한 종목이 가질 수 있는 세트 수의 상한.
 *
 * `parsePlanExercises`가 30을 넘기면 계획 전체를 버린다. 화면에서 31세트를
 * 만들 수 있으면 저장이 조용히 실패하므로 같은 수를 여기서 막는다.
 */
export const MAX_PLAN_SETS = 30;

/** 편집 중인 종목 한 줄 — 원본 세트 배열을 그대로 들고 다닌다 */
export type PlanEditRow = { key: string; exercise: PlanExercise };

export type PlanSetupEntry = { item: SetupItem; plan: SetupPlan };

const ZERO_SET: PlanSet = {
  weightKg: 0,
  reps: 0,
  distanceKm: 0,
  durationMin: 0,
};

function timedExercise(exercise: PlanExercise): boolean {
  return isTimeMeasured(exercise.exerciseType, exercise.measure);
}

/** 계획의 종목들 → 편집용 줄. `makeKey`는 `toDraftExercises`와 같은 규약이다. */
export function planEditRows(
  exercises: readonly PlanExercise[],
  makeKey: () => string,
): PlanEditRow[] {
  return exercises.map((exercise) => ({
    key: makeKey(),
    exercise: { ...exercise, sets: exercise.sets.map((set) => ({ ...set })) },
  }));
}

export function setupEntriesFromRows(
  rows: readonly PlanEditRow[],
): PlanSetupEntry[] {
  return rows.map((row) => ({
    item: {
      id: row.key,
      name: row.exercise.name,
      exercise_type: row.exercise.exerciseType,
      measure: row.exercise.measure,
    },
    plan: planFromSets(row.exercise.sets, timedExercise(row.exercise)),
  }));
}

/** 세트 수를 맞춘다. 늘릴 때는 **마지막 세트를 복사**한다 (0이 아니라). */
function resizeSets(sets: readonly PlanSet[], count: number): PlanSet[] {
  const size = Math.min(MAX_PLAN_SETS, Math.max(1, Math.trunc(count)));
  if (size <= sets.length) return sets.slice(0, size).map((set) => ({ ...set }));
  const last = sets.at(-1) ?? ZERO_SET;
  return [
    ...sets.map((set) => ({ ...set })),
    ...Array.from({ length: size - sets.length }, () => ({ ...last })),
  ];
}

/**
 * 조절 화면이 돌려준 대표값을 세트 배열에 반영한다 — **바뀐 항목만.**
 *
 * ⚠️ 이 함수가 이 기능의 유일한 신규 로직이고, 존재 이유는 하나다.
 *
 * 지난 기록을 복사한 예정표는 세트마다 무게가 다르다(60·65·70kg). 그런데
 * 조절 화면이 쓰는 `SetupPlan`은 **대표값 하나**(`planFromSets`가 첫 세트를
 * 읽는다)뿐이다. 돌려받은 값을 그대로 전 세트에 뿌리면 사용자가 아무것도
 * 안 건드리고 `조절`을 펼쳤다 접기만 해도 60·65·70이 60·60·60으로 뭉개진다.
 *
 * 그래서 지금 값과 대조해 **실제로 달라진 항목만** 반영한다. 세트 수만 바꾸면
 * 무게 배분이 살아남고, 무게를 바꾸면 그때는 사용자가 원한 것이므로 전 세트에
 * 적용한다.
 */
export function applySetupPlanToRow(
  row: PlanEditRow,
  next: SetupPlan,
): PlanEditRow {
  const { exercise } = row;
  const timed = timedExercise(exercise);
  const current = planFromSets(exercise.sets, timed);

  let sets: PlanSet[] =
    next.sets === current.sets
      ? exercise.sets.map((set) => ({ ...set }))
      : resizeSets(exercise.sets, next.sets);

  if (next.amount !== current.amount) {
    const amount = Math.max(0, next.amount);
    sets = sets.map((set) =>
      timed ? { ...set, durationMin: amount } : { ...set, reps: amount },
    );
  }
  if (next.weightKg !== current.weightKg) {
    const weightKg = Math.max(0, next.weightKg);
    sets = sets.map((set) => ({ ...set, weightKg }));
  }

  return { key: row.key, exercise: { ...exercise, sets } };
}

export function removePlanRow(
  rows: readonly PlanEditRow[],
  key: string,
): PlanEditRow[] {
  return rows.filter((row) => row.key !== key);
}

/**
 * 종목을 뒤에 붙인다. **이름이 겹치면 건너뛴다** — 기록 화면의 '지난 기록
 * 불러오기'와 같은 규칙을 쓰려고 `mergeImportedExercises`에 위임한다.
 * 규칙이 두 벌이 되면 한쪽만 고쳐졌을 때 갈라진다.
 */
export function appendPlanRows(
  rows: readonly PlanEditRow[],
  added: readonly PlanExercise[],
  makeKey: () => string,
): { rows: PlanEditRow[]; addedCount: number; skippedCount: number } {
  const merged = mergeImportedExercises(
    rows.map((row) => row.exercise),
    [...added],
  );
  return {
    rows: [...rows, ...planEditRows(merged.added, makeKey)],
    addedCount: merged.added.length,
    skippedCount: merged.skippedCount,
  };
}

/**
 * 저장용 배열. **DB 파서를 그대로 통과시킨다** — 화면에서 만든 값이라도
 * 저장 직전에 한 번 더 거르면, 파서가 통째로 버려서 계획이 조용히 비는 일을
 * 저장 전에 잡을 수 있다(빈 배열이면 호출부가 저장을 막는다).
 */
export function planExercisesFromRows(
  rows: readonly PlanEditRow[],
): PlanExercise[] {
  return parsePlanExercises(rows.map((row) => row.exercise));
}
