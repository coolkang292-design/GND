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

/**
 * ⚠️ **`step`은 0.1이다** (2026-08-09 사용자 지시 "유산소 거리는 보통 0.1 단위
 * 수정을 해야 하므로"). 0.5였을 때는 3.2km를 스테퍼로 만들 수 없어 카드의
 * 입력창까지 내려가야 했다.
 *
 * ⚠️ **빠른 칩의 ±1은 남긴다.** 0.1만 있으면 5km를 넣는 데 50번 눌러야 한다.
 * `±` 버튼이 미세 조절, 칩이 굵은 조절이라는 역할 분담이다.
 */
const DISTANCE: AmountField = {
  key: "distanceKm",
  label: "거리",
  unit: "km",
  step: 0.1,
  quickSteps: [-1, -0.1, 0.1, 1],
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

/**
 * 뒤에 남은 세트에 같은 값을 쓴다.
 *
 * ⚠️ **부르는 자리가 2026-08-24에 바뀌었다.** 예전에는 오버레이 스테퍼 콜백이
 * 이걸 **즉시** 불러 뒤 세트가 조용히 바뀌고 토스트가 떴다(2026-08-09 지시
 * "운동중 무게 수정하면 다음 세트부터 일괄 적용하게"). 지금은 `운동 완료` 때
 * `buildSpreadOffer()`가 제안을 만들고, 사용자가 **휴식 화면 배너에서
 * `적용하기`를 눌렀을 때만** 이 함수가 돈다. 스테퍼 콜백에 도로 붙이지 마라.
 *
 * 담기 단계(`updateSetFromCard`)는 **처방 있는 종목에 한해** 여전히 즉시 부른다 —
 * 거기는 전 세트가 한 화면에 보여서 값이 바뀌는 게 그대로 보인다.
 *
 * 담을 때 정한 무게는 예상치다. 실제 무게는 첫 세트를 들어 봐야 안다 — 60kg으로
 * 4세트를 담고 시작했다가 1세트에서 50kg으로 내리면, 예전에는 2·3·4세트가 60kg인
 * 채로 남아 세 번을 더 고쳐야 했다.
 *
 * 세 가지를 지킨다:
 * - **이미 `done`인 세트는 건드리지 않는다.** 그건 예상치가 아니라 **기록**이다.
 *   소급해 바꾸면 볼륨·기록 갱신이 거짓이 된다.
 * - **앞 세트도 건드리지 않는다.** "다음 세트부터"가 요구다.
 * - 무게만이 아니라 **네 칸 전부**에 적용한다 (사용자 결정 2026-08-09). 첫 세트를
 *   해 보고 12회 → 10회로 낮추는 상황이 무게와 똑같이 흔하다. `AmountFieldKey`
 *   하나로 일반화돼 있어 분기도 없다.
 *
 * `changed`를 함께 돌려주는 이유: 조용히 세 세트를 바꾸면 사용자가 모른다.
 * 담기 단계는 이 숫자를 쓰지 않고(값이 화면에 다 보인다), 운동 중 경로는
 * `buildSpreadOffer()`가 같은 규칙으로 센 `targetCount`를 배너에 띄운다 —
 * "남은 2세트도 이렇게 할까요?".
 *
 * ⚠️ `LocalSet`을 직접 import하지 않는다 — 그 타입은 `lib/workout.ts`에 있고
 * 그 파일은 Supabase 클라이언트를 끌어온다. 도메인 계층은 순수하게 둔다.
 */
export function propagateAmount<T extends { done: boolean }>(
  sets: T[],
  fromIndex: number,
  key: AmountFieldKey,
  value: number,
): { sets: T[]; changed: number } {
  let changed = 0;
  const next = sets.map((set, index) => {
    if (index <= fromIndex || set.done) return set;
    // 이미 같은 값이면 바꾼 것으로 세지 않는다 — 안 바뀐 세트를 세면 토스트가
    // 거짓말을 한다("3세트에 적용했어요"인데 실제로는 하나도 안 바뀜).
    if ((set as Record<string, unknown>)[key] === value) return set;
    changed++;
    return { ...set, [key]: value };
  });
  return { sets: changed > 0 ? next : sets, changed };
}

/** 목업의 휴식 프리셋 — 30초·45초·1분·1분 30초·2분 */
export const REST_PRESET_SECONDS = [30, 45, 60, 90, 120] as const;
