import type { ExercisePrescription } from "./workout-plan";

/**
 * 세트를 마치고 받는 체감. `workout_sets.effort_feedback`에 그대로 저장된다
 * (0067) — 값을 바꾸면 DB check 제약과 갈라진다.
 */
export type EffortFeedback = "too_light" | "on_target" | "too_heavy";

/** 지난 기록의 세트 한 줄. `getPreviousExerciseRecords()`가 주는 모양 그대로다. */
export type PreviousCompletedSet = {
  weightKg: number;
  reps: number;
  isCompleted: boolean;
};

export type InitialProgramLoad = {
  /** null이면 앱이 무게를 정하지 않았다는 뜻 — 화면은 빈 칸으로 두고 안내를 띄운다 */
  weightKg: number | null;
  source: "history" | "first_set";
  guide: string;
};

/** 부동소수 오차가 무게 입력칸에 새지 않게 한다 (2.5·1·5 단위라 소수 둘이면 충분) */
function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 처방 값만으로 만드는 무게 선택 안내.
 *
 * ⚠️ 문구를 화면에 박지 마라. 처방(`repsMin`·`repsMax`·`targetRir`)이 프로그램마다
 * 다르고, 두 곳에 두면 반드시 갈라진다. 카드·오버레이·시트가 전부 이 함수를 쓴다.
 */
export function programWeightGuide(prescription: ExercisePrescription): string {
  const { repsMin, repsMax, targetRir } = prescription;
  return (
    `${repsMin}~${repsMax}회를 안정된 자세로 수행할 수 있는 무게를 선택하세요.\n` +
    `${repsMax}회를 마치고도 ${targetRir}회 정도 더 할 수 있는 무게가 적당합니다.`
  );
}

/**
 * 지난 기록에서 오늘 시작할 무게를 고른다 (설계 2026-08-12).
 *
 * **근거가 되는 세트는 "완료했고, 반복 하한을 채웠고, 무게가 있는" 것뿐이다.**
 * - 미완료 세트: 들다 만 무게다. 이걸 쓰면 다음 회차도 실패한다
 * - 하한 미달(8회 목표에 3회): 그 무게를 감당했다는 증거가 아니다
 * - 0kg: 맨몸이나 무게를 안 적은 기록이다. 0을 "추천 무게"로 확정하면 안 된다
 *
 * 상한을 넘긴 것(10회 목표에 15회)은 **근거로 쓴다.** 가벼웠을 뿐 못 든 게 아니고,
 * 여기서 버리면 가볍게 여러 번 한 사람이 매번 `first_set` 안내를 다시 본다.
 *
 * 여럿이면 **가장 무거운 것**을 쓴다. 순서가 아니라 값으로 고른다 —
 * 세트 순서(램프업/드롭셋)는 우리가 정하지 않으므로 순서에 기대면 흔들린다.
 *
 * ⚠️ 결과는 **제안**이다. 사용자가 고친 값이 언제나 이긴다.
 */
export function initialProgramLoad(
  prescription: ExercisePrescription,
  previous: readonly PreviousCompletedSet[],
): InitialProgramLoad {
  const guide = programWeightGuide(prescription);
  const evidence = previous.filter(
    (set) =>
      set.isCompleted && set.weightKg > 0 && set.reps >= prescription.repsMin,
  );
  if (evidence.length === 0) {
    return { weightKg: null, source: "first_set", guide };
  }
  const heaviest = evidence.reduce((best, set) =>
    set.weightKg >= best.weightKg ? set : best,
  );
  return { weightKg: roundKg(heaviest.weightKg), source: "history", guide };
}

/**
 * 다음 회차 권장 무게 (설계 2026-08-12).
 *
 * **한 번에 한 단위만 움직인다.** `too_light`라고 두 단위를 올리면 다음 회차에
 * 하한을 못 채우고, 그 실패가 그 다음 회차 추천까지 끌어내린다.
 *
 * | 세트 실적 | 마지막 세트 체감 | 결과 |
 * |---|---|---|
 * | 전부 상한 달성 | `on_target`·`too_light` | +1단위 |
 * | 전부 상한 달성 | `too_heavy` | −1단위 |
 * | 상한 미달 | `too_heavy` | −1단위 |
 * | 상한 미달 | 그 외 | 그대로 |
 *
 * `too_heavy`는 "자세가 무너졌다"는 신호라 상한을 채웠어도 내린다 — 반복 수보다
 * 자세가 먼저다. 0kg 아래로는 내려가지 않는다.
 */
export function nextProgramLoad(
  prescription: ExercisePrescription,
  currentWeightKg: number,
  completedReps: readonly number[],
  finalFeedback: EffortFeedback,
): number {
  const step = prescription.loadStepKg;
  if (finalFeedback === "too_heavy") {
    return roundKg(Math.max(0, currentWeightKg - step));
  }
  const reachedTop =
    completedReps.length > 0 &&
    completedReps.every((reps) => reps >= prescription.repsMax);
  return reachedTop ? roundKg(currentWeightKg + step) : roundKg(currentWeightKg);
}
