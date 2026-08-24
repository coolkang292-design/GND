import type { AmountField, AmountFieldKey } from "./set-input";

/**
 * 운동 중 바꾼 값을 **뒤 세트에도 적용할지 물을 거리가 있는가** (설계 2026-08-24 §2).
 *
 * 2026-08-09~2026-08-24 사이에는 오버레이 스테퍼를 누르는 **즉시** 뒤 세트가
 * 조용히 바뀌고 토스트가 떴다. 사용자 지시로 **묻고 나서** 적용하도록 바꿨다.
 * 이 파일은 "물어볼 거리"만 정한다 — 실제 적용은 배너에서 `적용하기`를 눌렀을 때
 * `propagateAmount()`(`set-input.ts`)가 한다. 전파 규칙을 여기 다시 짜지 마라.
 *
 * ⚠️ **값이 다르다는 것만으로 묻지 않는다.** 담기 단계(`ExerciseCard`)는 세트마다
 * 다른 값을 **일부러** 넣는 자리다(피라미드·드롭세트). 그걸 "다르네요?"로 붙잡으면
 * 매 세트 거짓 알림이 된다. 그래서 **사용자가 실제로 건드린 항목**(`touched`)만
 * 후보로 받는다. `fillProgramLoads()`가 넣는 자동 무게는 여기 들어오지 않는다.
 *
 * ⚠️ **어떤 칸이 있는지는 `fields`가 정한다** — `amountFields()` 결과를 그대로
 * 받는다. 여기서 종목 유형을 분기하면 저장 구조(`LocalSet`)와 어긋나고, 유산소
 * 종목의 배너에 `무게`가 실린다.
 */

/** `LocalSet`과 구조가 같다 — `workout.ts`를 끌어오지 않으려고 여기 적는다 */
export type SpreadCandidateSet = {
  done: boolean;
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
};

export type SpreadOfferField = {
  key: AmountFieldKey;
  /** "무게" — 배너 문구를 화면이 짓지 않게 라벨까지 실어 보낸다 */
  label: string;
  /** "kg" */
  unit: string;
  value: number;
};

export type SpreadOffer = {
  /** 건드렸고 **또한** 뒤 세트와 값이 다른 항목만. `fields` 순서를 지킨다 */
  fields: SpreadOfferField[];
  /**
   * `적용하기`를 누르면 실제로 바뀔 세트 수 — "남은 N세트도 이렇게 할까요?"의 근거.
   *
   * 항목별 개수의 합이 아니라 **바뀌는 세트의 합집합**이다. 무게가 2세트에서,
   * 횟수가 그중 1세트에서 다르면 바뀌는 세트는 3이 아니라 2다.
   */
  targetCount: number;
};

export function buildSpreadOffer({
  sets,
  fromIndex,
  touched,
  fields,
}: {
  sets: SpreadCandidateSet[];
  /** 방금 완료한 세트의 위치 — 여기 값을 뒤로 퍼뜨린다 */
  fromIndex: number;
  /** 사용자가 오버레이에서 실제로 바꾼 항목 (스테퍼·빠른칩·'한 번 더') */
  touched: AmountFieldKey[];
  /** `amountFields()` 결과 그대로 */
  fields: AmountField[];
}): SpreadOffer | null {
  if (touched.length === 0) return null;

  const source = sets[fromIndex];
  if (!source) return null;

  // `propagateAmount()`와 같은 대상 규칙 — 뒤에 있고, 아직 완료하지 않은 세트.
  // 완료한 세트는 예상치가 아니라 기록이라 덮으면 안 된다.
  const pending = sets.slice(fromIndex + 1).filter((set) => !set.done);
  if (pending.length === 0) return null;

  const offerFields: SpreadOfferField[] = [];
  for (const field of fields) {
    if (!touched.includes(field.key)) continue;
    const value = source[field.key];
    // 뒤 세트가 이미 같은 값이면 실을 이유가 없다 — 실으면 배너가
    // "적용할까요?"라고 묻고 눌러도 아무것도 안 바뀐다
    if (!pending.some((set) => set[field.key] !== value)) continue;
    offerFields.push({
      key: field.key,
      label: field.label,
      unit: field.unit,
      value,
    });
  }
  if (offerFields.length === 0) return null;

  const targetCount = pending.filter((set) =>
    offerFields.some((field) => set[field.key] !== field.value),
  ).length;

  return { fields: offerFields, targetCount };
}
