import type { ExerciseType } from "@/lib/types";

/**
 * 큰 팝업의 세트 입력 정의 (2026-08-04, 설계 ② · 사용자 목업).
 *
 * 목업은 웨이트(무게×횟수)만 보여주지만 **같은 틀에 필드만 바꿔** 유산소·맨몸도
 * 담는다(사용자 결정). 이 파일이 "어떤 칸을 그릴지"의 단일 원천이다 —
 * 화면이 유형별 분기를 직접 갖고 있으면 저장 구조(`LocalSet`)와 어긋난다.
 *
 * ⚠️ `key`는 `LocalSet`의 필드명 그대로다. 여기에 없는 이름을 만들면 입력한 값이
 * 저장되지 않는다. 지시서: "입력 항목을 임의로 추가하거나 삭제하지 마라".
 */
export type AmountFieldKey =
  | "weightKg"
  | "reps"
  | "distanceKm"
  | "durationMin";

export type AmountField = {
  key: AmountFieldKey;
  label: string;
  unit: string;
  /** `–`/`+` 버튼 한 번의 증감 */
  step: number;
  /** 목업의 빠른 조절 칩 */
  quickSteps: number[];
};

const WEIGHT: AmountField = {
  key: "weightKg",
  label: "무게",
  unit: "kg",
  step: 2.5,
  quickSteps: [-2.5, -1, 1, 2.5],
};

const REPS: AmountField = {
  key: "reps",
  label: "횟수",
  unit: "회",
  step: 1,
  quickSteps: [-2, -1, 1, 2],
};

const DISTANCE: AmountField = {
  key: "distanceKm",
  label: "거리",
  unit: "km",
  step: 0.5,
  quickSteps: [-1, -0.5, 0.5, 1],
};

const DURATION: AmountField = {
  key: "durationMin",
  label: "시간",
  unit: "분",
  step: 1,
  quickSteps: [-5, -1, 1, 5],
};

/** 이 종목이 어떤 칸을 쓰는가. 저장 구조와 같은 규칙(`saveSessionExercises`)이다. */
export function amountFields(
  exerciseType: ExerciseType,
  measure: "reps" | "time" | null,
): AmountField[] {
  if (exerciseType === "weight") return [WEIGHT, REPS];
  if (exerciseType === "cardio") return [DISTANCE, DURATION];
  return measure === "time" ? [DURATION] : [REPS];
}

/**
 * 스테퍼·빠른 칩 공용 증감.
 *
 * 0 아래로는 내리지 않는다 — `parsePlanExercises`도 음수를 거부하고, 음수 중량은
 * 볼륨을 깎는다. 소수점은 셋째 자리에서 반올림한다: 2.5 증감을 반복하면
 * `0.30000000000000004` 같은 값이 그대로 화면에 뜬다.
 */
export function adjustAmount(value: number, delta: number): number {
  return Math.max(0, Math.round((value + delta) * 1000) / 1000);
}

/** 목업의 휴식 프리셋 — 30초·45초·1분·1분 30초·2분 */
export const REST_PRESET_SECONDS = [30, 45, 60, 90, 120] as const;
