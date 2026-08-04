/**
 * 큰 팝업이 지금 보여줄 **한 종목** 고르기 (2026-08-04, 설계 ②).
 *
 * 팝업은 전체 목록이 아니라 지금 하는 종목 하나만 보여준다 — 그게 "집중"이다.
 *
 * ⚠️ 현재 종목은 **상태로 들고 간다.** "미완료 첫 세트가 있는 종목"으로 매번
 * 파생하면, 사용자가 뒤 종목으로 옮겨 기록하는 순간 앞 종목에 미완료가 남아
 * 있어 화면이 앞으로 튕겨 돌아간다. 이 파일은 그 상태를 옮길 때의 규칙만 갖는다.
 */
export type FocusExercise = {
  name: string;
  sets: { done: boolean }[];
};

/** 종목을 지우거나 불러와 개수가 바뀌어도 인덱스가 범위를 벗어나지 않게 */
export function clampFocusIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, index), total - 1);
}

function hasPending(exercise: FocusExercise | undefined): boolean {
  return Boolean(exercise?.sets.some((set) => !set.done));
}

/**
 * 세트를 완료한 뒤 어느 종목을 보여줄지.
 *
 * 현재 종목에 남은 세트가 있으면 머문다. 다 끝냈으면 **뒤에서 먼저** 찾고,
 * 뒤가 없으면 앞으로 돌아간다 — 순서를 건너뛰며 한 사람의 남은 종목을 놓치지
 * 않기 위해서다. 전부 끝났으면 그 자리에 머문다(임의로 튀지 않는다).
 */
export function advanceFocusAfterComplete(
  exercises: FocusExercise[],
  currentIndex: number,
): number {
  if (exercises.length === 0) return 0;

  const current = clampFocusIndex(currentIndex, exercises.length);
  if (hasPending(exercises[current])) return current;

  for (let i = current + 1; i < exercises.length; i++) {
    if (hasPending(exercises[i])) return i;
  }
  for (let i = 0; i < current; i++) {
    if (hasPending(exercises[i])) return i;
  }
  return current;
}
