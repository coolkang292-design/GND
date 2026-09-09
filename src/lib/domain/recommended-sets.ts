import { newSet, type LocalSet } from "@/lib/workout";
import type { ExerciseType } from "@/lib/types";
import {
  DEFAULT_HOLD_SECONDS,
  durationSecondsOf,
  formatDurationAmount,
} from "./set-timer";

/** 추천 흐름의 기본값 (사용자 지시 2026-08-06) */
export const RECOMMENDED_SET_COUNT = 3;
export const RECOMMENDED_REPS = 10;
/**
 * 시간형(매달리기·플랭크·월 싯 등)의 기본 — **초** (2026-08-28).
 * 정의는 `set-timer.ts`가 갖는다 (`defaultSets()`도 같은 값을 써야 한다).
 */
export const RECOMMENDED_HOLD_SECONDS = DEFAULT_HOLD_SECONDS;

export type SetupPlan = {
  /** 세트 수 */
  sets: number;
  /**
   * 목표량. `reps`형이면 횟수, `time`형이면 **초** (2026-08-28에 분에서 바뀌었다).
   * 유산소는 쓰지 않는다(거리·시간 모두 운동 중 입력).
   */
  amount: number;
  /**
   * 세트마다 목표가 **다를 때만** 채워지는 전체 목록 (2026-09-04).
   *
   * ⚠️ 풀업 사다리(5·4·3·2·1) 때문에 생겼다. `amount` 하나로는 첫 세트밖에
   *    못 말해서 카드가 "5세트 · 5회"라고 **거짓말을 했다.**
   *
   * ⚠️ 모두 같으면 `undefined`로 둔다. 그래야 근력·인터벌과 설정 시트의
   *    표시가 한 글자도 안 바뀐다 — 새 값이 옛 화면을 흔들지 않게 한다.
   */
  amounts?: readonly number[];
  /** 무게(kg). `0`이면 **운동 중 입력** — 새 필드를 만들지 않는다 */
  weightKg: number;
};

/** 유산소는 세트 개념이 흐리다 — 1행으로 시작하고 거리·시간은 운동 중에 적는다 */
function isCardio(type: ExerciseType) {
  return type === "cardio";
}

/** 시간으로 재는 맨몸 종목인가 (플랭크·월 싯·핸드스탠드 …) */
export function isTimeMeasured(
  type: ExerciseType,
  measure: "reps" | "time" | null,
): boolean {
  return type === "bodyweight" && measure === "time";
}

/**
 * 추천 흐름의 기본 설정값.
 *
 * ⚠️ **`defaultSets`를 고치지 않은 이유**: 그쪽은 '운동 이름 검색'으로 담는
 * 경로도 쓴다(호출부가 `addExercises` 한 곳뿐이라 바꾸기는 쉽지만, 바꾸면
 * 검색 경로의 기본값까지 같이 변한다 — 요구에 없는 변경이다).
 */
export function defaultSetupPlan(
  type: ExerciseType,
  measure: "reps" | "time" | null,
): SetupPlan {
  if (isCardio(type)) return { sets: 1, amount: 0, weightKg: 0 };
  return {
    sets: RECOMMENDED_SET_COUNT,
    amount: isTimeMeasured(type, measure)
      ? RECOMMENDED_HOLD_SECONDS
      : RECOMMENDED_REPS,
    weightKg: 0, // = 운동 중 입력
  };
}

/**
 * 설정값 → 실제 세트 배열.
 *
 * 무게 `0`은 그대로 둔다. `newSet()`이 이미 `weightKg: 0`으로 시작하고,
 * `shouldAskBodyweight`가 0kg 완료 시 "맨몸이었나요?"를 물어 그 모호함을
 * 완료 시점에 사람에게 확인한다 — 그래서 '미입력'을 담을 새 필드가 필요 없다.
 */
export function planToSets(
  type: ExerciseType,
  measure: "reps" | "time" | null,
  plan: SetupPlan,
): LocalSet[] {
  const count = Math.max(1, plan.sets);
  return Array.from({ length: count }, () => {
    if (isCardio(type)) return newSet();
    if (isTimeMeasured(type, measure)) {
      // 계획 호환 필드(`durationMin`)도 같이 채운다 — 달력·루틴 JSON이 그 키를
      // 쓰고 서버 RPC가 존재를 검사한다. 진실은 `durationSec`다.
      return newSet({
        durationSec: plan.amount,
        durationMin: Math.round((plan.amount / 60) * 1000) / 1000,
      });
    }
    if (type === "weight") {
      return newSet({ reps: plan.amount, weightKg: plan.weightKg });
    }
    return newSet({ reps: plan.amount });
  });
}

/**
 * 이미 담긴 세트들 → 요약용 설정값 (2026-08-06).
 *
 * 이 줄은 **시작 전 목록에서 "무엇을 얼마나 할 예정인가"** 를 한 줄로 보여준다.
 * 세트별 실제 값은 바로 아래 입력 행에 그대로 보인다.
 *
 * ⚠️ 예전에는 **첫 세트만** 대표로 읽었다. 근력·인터벌은 모든 세트의 목표가
 *    같아서 문제가 없었지만, 풀업 사다리(5·4·3·2·1)에서 카드가 "5세트 · 5회"로
 *    **거짓말을 했다** (2026-09-04에 화면을 열어 보고 잡았다). 지금은 값이
 *    갈릴 때만 `amounts`에 전부 싣는다 — 같을 때는 싣지 않아서 옛 표시가
 *    한 글자도 안 바뀐다.
 */
export function planFromSets(
  sets: readonly {
    weightKg: number;
    reps: number;
    durationMin: number;
    durationSec?: number;
  }[],
  timed: boolean,
): SetupPlan {
  const first = sets[0];
  const amounts = sets.map((set) =>
    timed ? durationSecondsOf(set) : set.reps,
  );
  // 다 같으면 싣지 않는다 — 옛 표시를 그대로 두기 위해서다 (`amounts` 주석)
  const varied = amounts.some((amount) => amount !== amounts[0]);
  return {
    sets: sets.length,
    amount: first ? (timed ? durationSecondsOf(first) : first.reps) : 0,
    ...(varied ? { amounts } : {}),
    weightKg: first?.weightKg ?? 0,
  };
}

/** 카드·설정 행에 쓰는 한 줄 요약 — `3세트 · 10회 · 무게 운동 중 입력` */
export function summarizePlan(
  type: ExerciseType,
  measure: "reps" | "time" | null,
  plan: SetupPlan,
): string {
  if (isCardio(type)) return `${plan.sets}세트 · 거리·시간 운동 중 입력`;
  const timed = isTimeMeasured(type, measure);
  /*
    세트마다 목표가 다르면 **전부** 보여준다. 사다리가 `5·4·3·2·1`인데
    "5회"라고만 쓰면 5세트를 전부 5회 하는 운동으로 읽힌다.
    단위는 뒤에 한 번만 붙인다 — `5·4·3·2·1회`.
  */
  const amount = plan.amounts
    ? timed
      ? plan.amounts.map(formatDurationAmount).join("·")
      : `${plan.amounts.join("·")}회`
    : timed
      ? formatDurationAmount(plan.amount)
      : `${plan.amount}회`;
  if (type !== "weight") return `${plan.sets}세트 · ${amount}`;
  const weight = plan.weightKg > 0 ? `${plan.weightKg}kg` : "무게 운동 중 입력";
  return `${plan.sets}세트 · ${amount} · ${weight}`;
}
