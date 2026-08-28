import { newSet, type LocalSet } from "@/lib/workout";
import type { ExerciseType } from "@/lib/types";

/** 추천 흐름의 기본값 (사용자 지시 2026-08-06) */
export const RECOMMENDED_SET_COUNT = 3;
export const RECOMMENDED_REPS = 10;
/** 시간형(플랭크·월 싯 등)의 기본 — "10회 플랭크"는 뜻이 없다 */
export const RECOMMENDED_MINUTES = 1;

/**
 * 조절 화면이 종목에서 **실제로 읽는 것**만 (2026-08-28).
 *
 * `CatalogExercise`를 요구하지 않는다. 예정표를 편집할 때는 카탈로그에서
 * 종목을 되찾을 수 없는 경우가 있고(삭제된 커스텀 종목), 그렇다고 편집이
 * 막혀서는 안 된다. `CatalogExercise`는 이 모양을 이미 만족한다.
 */
export type SetupItem = {
  id: string;
  name: string;
  exercise_type: ExerciseType;
  measure: "reps" | "time" | null;
};

export type SetupPlan = {
  /** 세트 수 */
  sets: number;
  /**
   * 목표량. `reps`형이면 횟수, `time`형이면 분.
   * 유산소는 쓰지 않는다(거리·시간 모두 운동 중 입력).
   */
  amount: number;
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
      ? RECOMMENDED_MINUTES
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
    if (isTimeMeasured(type, measure)) return newSet({ durationMin: plan.amount });
    if (type === "weight") {
      return newSet({ reps: plan.amount, weightKg: plan.weightKg });
    }
    return newSet({ reps: plan.amount });
  });
}

/**
 * 이미 담긴 세트들 → 요약용 설정값 (2026-08-06).
 *
 * 첫 세트를 대표로 읽는다. 세트마다 값이 다를 수 있지만 이 줄은 **시작 전
 * 목록에서 "무엇을 얼마나 할 예정인가"** 를 한 줄로 보여주는 것이고, 세트별
 * 실제 값은 바로 아래 입력 행에 그대로 보인다.
 */
export function planFromSets(
  sets: readonly { weightKg: number; reps: number; durationMin: number }[],
  timed: boolean,
): SetupPlan {
  const first = sets[0];
  return {
    sets: sets.length,
    amount: first ? (timed ? first.durationMin : first.reps) : 0,
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
  const amount = isTimeMeasured(type, measure)
    ? `${plan.amount}분`
    : `${plan.amount}회`;
  if (type !== "weight") return `${plan.sets}세트 · ${amount}`;
  const weight = plan.weightKg > 0 ? `${plan.weightKg}kg` : "무게 운동 중 입력";
  return `${plan.sets}세트 · ${amount} · ${weight}`;
}
