import { withoutIntervalBlock } from "./tabata";

/**
 * 운동 시작 전 '예상 점수'에 쓸 운동시간(분) — 계획에서 **확실히 아는 시간만** 센다.
 *
 * - 인터벌(타바타) 코스 4·8·16분은 코스 분수 그대로.
 * - 인터벌 블록 밖의 **유산소** 종목은 계획에 입력한 시간.
 * - 웨이트·맨몸(풀업 등)은 사람마다 달라 **추정하지 않는다** — `hasUnknownTime`으로 알리기만 한다.
 *
 * ⚠️ 새 점수 산식이 아니다. 여기서 나온 분(分)을 기존 점수 계산기(`forecastWorkout`)에
 *    `durationMinutes`로 넘길 뿐이다. 실제 완료 점수는 서버가 잰 시간으로 따로 정해진다.
 */
export type PlanMinutes = {
  /** 점수에 넣을 확실한 시간(분) */
  minutes: number;
  /** 시간을 알 수 없는 종목(웨이트·맨몸)이 계획에 들어 있나 */
  hasUnknownTime: boolean;
  /** 화면 문구용 출처 — 예: "인터벌 8분", "유산소 30분", "인터벌 8분 + 유산소 30분". 시간이 없으면 null */
  sourceLabel: string | null;
};

type PlanExercise = {
  exerciseType: "weight" | "bodyweight" | "cardio";
  sets: readonly { durationSeconds: number | null; isCompleted?: boolean }[];
};

const nonNegative = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function estimatePlanMinutes(
  tabataMinutes: number | null | undefined,
  exercises: readonly PlanExercise[],
  /**
   * 목록 안 인터벌 블록의 시작 위치 (이슈 #33). 비우면 0번부터 — 예전 동작.
   * 웨이트 뒤에 인터벌을 담은 목록(시작 위치 2 등)을 0번부터로 읽으면 웨이트가 블록으로, 블록이 웨이트로 잘못 갈렸다.
   */
  intervalStartIndex?: number | null,
): PlanMinutes {
  const interval = nonNegative(tabataMinutes);
  const outside = withoutIntervalBlock(tabataMinutes, exercises, intervalStartIndex);
  const cardioSeconds = outside
    .filter((ex) => ex.exerciseType === "cardio")
    .reduce((sum, ex) => sum + ex.sets.reduce((s, set) => s + nonNegative(set.durationSeconds), 0), 0);
  const cardio = round(cardioSeconds / 60);
  const hasUnknownTime = outside.some((ex) => ex.exerciseType !== "cardio" && ex.sets.length > 0);
  const parts: string[] = [];
  if (interval > 0) parts.push(`인터벌 ${interval}분`);
  if (cardio > 0) parts.push(`유산소 ${cardio}분`);
  return {
    minutes: round(interval + cardio),
    hasUnknownTime,
    sourceLabel: parts.length > 0 ? parts.join(" + ") : null,
  };
}
