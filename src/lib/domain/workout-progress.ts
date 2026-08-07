/**
 * 오늘 운동의 진행률 (2026-08-07, 사용자 목업).
 *
 * 큰 팝업 상단에 `전체 운동 진행률 · 3 / 8 완료 · 37%`를 그린다. 예전에는 그
 * 자리에 `{종목명} 완료` 헤드라인이 있었는데, 방금 끝낸 것을 말할 뿐 **오늘
 * 얼마나 남았는지**는 어디에도 없었다.
 *
 * ⚠️ **종목이 아니라 세트를 센다.** 목업의 `3 / 8`이 세트 수다(3/8 = 37%).
 * 종목 기준이면 세트가 많은 종목과 하나뿐인 종목이 같은 무게가 된다.
 *
 * 화면에서 계산하지 않고 여기 두는 이유는 두 화면(입력·휴식)이 같은 값을
 * 써야 하기 때문이다 — 갈라지면 한쪽만 고쳐진다.
 */

/** 세트의 완료 여부만 본다 — `LocalSet`을 통째로 받지 않는다 */
type SetLike = { done: boolean };
type ExerciseLike = { sets: readonly SetLike[] };

export type WorkoutProgress = {
  completed: number;
  total: number;
  /** 0~100 **정수**. 다 안 했는데 100으로 보이지 않게 내림한다 */
  percent: number;
};

export function workoutProgress(
  exercises: readonly ExerciseLike[],
): WorkoutProgress {
  let completed = 0;
  let total = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (set.done) completed += 1;
    }
  }
  return {
    completed,
    total,
    // total이 0이면 0으로 나누지 않는다 — 담기 전에도 팝업이 뜰 수 있다
    percent: total === 0 ? 0 : Math.floor((completed / total) * 100),
  };
}

export type ExerciseSetProgress = {
  done: number;
  total: number;
  remaining: number;
};

/** 한 종목의 세트 진행 — 휴식 화면의 `3세트 / 4세트 · 1세트 남음` */
export function exerciseSetProgress(
  exercise: ExerciseLike | undefined,
): ExerciseSetProgress {
  const sets = exercise?.sets ?? [];
  const done = sets.filter((set) => set.done).length;
  return { done, total: sets.length, remaining: sets.length - done };
}
