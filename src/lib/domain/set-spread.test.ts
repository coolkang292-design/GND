import { describe, expect, it } from "vitest";

import { buildSpreadOffer } from "./set-spread";
import { amountFields } from "./set-input";

/**
 * 운동 중 바꾼 값을 뒤 세트에 적용할지 **묻기 위한 판정** (설계 2026-08-24 §2).
 *
 * 2026-08-09~2026-08-24 사이에는 스테퍼를 누르는 즉시 뒤 세트가 조용히 바뀌고
 * 토스트가 떴다. 이제 이 함수가 "물어볼 거리가 있는가"를 정하고, 실제 적용은
 * 사용자가 배너에서 `적용하기`를 눌렀을 때 `propagateAmount()`가 한다.
 */

const WEIGHT_FIELDS = amountFields("weight", null);
const CARDIO_FIELDS = amountFields("cardio", null);

function set(
  partial: Partial<{
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
    done: boolean;
  }> = {},
) {
  return {
    weightKg: 60,
    reps: 10,
    distanceKm: 0,
    durationMin: 0,
    done: false,
    ...partial,
  };
}

describe("buildSpreadOffer — 뒤 세트에 적용할지 물을 거리가 있는가", () => {
  it("아무것도 안 건드렸으면 null — 세트마다 값이 달라도", () => {
    // ⚠️ 이 저장소의 담기 단계는 세트마다 다른 값을 **일부러** 넣는다
    //    (피라미드·드롭세트). 값이 다르다는 것만으로 물으면 매 세트 붙잡는다.
    const sets = [
      set({ weightKg: 60 }),
      set({ weightKg: 70 }),
      set({ weightKg: 80 }),
    ];

    expect(
      buildSpreadOffer({
        sets,
        fromIndex: 0,
        touched: [],
        fields: WEIGHT_FIELDS,
      }),
    ).toBeNull();
  });

  it("무게만 건드렸으면 무게만 싣는다 — 횟수가 세트마다 달라도", () => {
    // ⚠️ 횟수를 **일부러 다르게** 둔다. 피라미드로 짠 횟수를 안 건드렸는데도
    //    배너가 "10회로 할까요?"라고 물으면 그 설계가 통째로 뭉개진다.
    //    (횟수를 같게 두면 `touched` 판정을 없애도 이 테스트가 통과해 버린다 —
    //     2026-08-24 변이 확인에서 실제로 그랬다.)
    const sets = [
      set({ weightKg: 50, reps: 12 }),
      set({ reps: 10 }),
      set({ reps: 8 }),
    ];

    const offer = buildSpreadOffer({
      sets,
      fromIndex: 0,
      touched: ["weightKg"],
      fields: WEIGHT_FIELDS,
    });

    expect(offer?.fields.map((f) => f.key)).toEqual(["weightKg"]);
    expect(offer?.fields[0]).toMatchObject({
      label: "무게",
      unit: "kg",
      value: 50,
    });
  });

  it("뒤 세트가 이미 같은 값이면 null — 아무것도 안 바뀌는 배너를 내지 않는다", () => {
    const sets = [set({ weightKg: 60 }), set({ weightKg: 60 })];

    expect(
      buildSpreadOffer({
        sets,
        fromIndex: 0,
        touched: ["weightKg"],
        fields: WEIGHT_FIELDS,
      }),
    ).toBeNull();
  });

  it("완료한 뒤 세트는 targetCount에서 빠진다", () => {
    // ⚠️ "0이 아니다"가 아니라 **정확히 2**여야 한다. 판정이 통째로 망가져도
    //    0은 통과하지만 2는 통과하지 않는다.
    const sets = [
      set({ weightKg: 50 }),
      set({ done: true }),
      set(),
      set(),
    ];

    const offer = buildSpreadOffer({
      sets,
      fromIndex: 0,
      touched: ["weightKg"],
      fields: WEIGHT_FIELDS,
    });

    expect(offer?.targetCount).toBe(2);
  });

  it("마지막 세트면 null — 전파할 곳이 없다", () => {
    const sets = [set(), set({ weightKg: 50 })];

    expect(
      buildSpreadOffer({
        sets,
        fromIndex: 1,
        touched: ["weightKg"],
        fields: WEIGHT_FIELDS,
      }),
    ).toBeNull();
  });

  it("남은 세트가 전부 완료면 null", () => {
    const sets = [set({ weightKg: 50 }), set({ done: true })];

    expect(
      buildSpreadOffer({
        sets,
        fromIndex: 0,
        touched: ["weightKg"],
        fields: WEIGHT_FIELDS,
      }),
    ).toBeNull();
  });

  it("그 종목이 안 쓰는 칸은 무시한다 — 유산소에 무게를 실으면 안 된다", () => {
    // `amountFields`가 유일한 원천이다. 유산소는 거리·시간만 쓴다.
    const sets = [
      set({ weightKg: 50, distanceKm: 3 }),
      set({ weightKg: 60, distanceKm: 5 }),
    ];

    const offer = buildSpreadOffer({
      sets,
      fromIndex: 0,
      touched: ["weightKg", "distanceKm"],
      fields: CARDIO_FIELDS,
    });

    expect(offer?.fields.map((f) => f.key)).toEqual(["distanceKm"]);
  });

  it("둘 다 건드리면 둘 다 싣고, targetCount는 바뀌는 세트의 합집합이다", () => {
    // ⚠️ **이미 값이 맞는 세트를 하나 끼운다.** 뒤 세트가 전부 다르면 합집합과
    //    전체가 같아져, targetCount를 `pending.length`로 바꿔도 통과해 버린다
    //    (2026-08-24 변이 확인에서 실제로 그랬다).
    const sets = [
      set({ weightKg: 50, reps: 12 }), // 방금 끝낸 세트
      set({ weightKg: 60, reps: 12 }), // 무게만 다름   → 바뀐다
      set({ weightKg: 50, reps: 10 }), // 횟수만 다름   → 바뀐다
      set({ weightKg: 50, reps: 12 }), // 둘 다 같음    → 안 바뀐다
    ];

    const offer = buildSpreadOffer({
      sets,
      fromIndex: 0,
      touched: ["weightKg", "reps"],
      fields: WEIGHT_FIELDS,
    });

    expect(offer?.fields.map((f) => f.key)).toEqual(["weightKg", "reps"]);
    expect(offer?.targetCount).toBe(2);
  });

  it("싣는 순서는 amountFields 순서다 — 화면 배치와 어긋나면 안 된다", () => {
    const sets = [set({ weightKg: 50, reps: 12 }), set()];

    const offer = buildSpreadOffer({
      sets,
      fromIndex: 0,
      // 일부러 뒤집어 넣는다
      touched: ["reps", "weightKg"],
      fields: WEIGHT_FIELDS,
    });

    expect(offer?.fields.map((f) => f.label)).toEqual(["무게", "횟수"]);
  });

  it("fromIndex가 범위를 벗어나면 null — 세트가 지워진 뒤에도 터지지 않는다", () => {
    expect(
      buildSpreadOffer({
        sets: [set()],
        fromIndex: 5,
        touched: ["weightKg"],
        fields: WEIGHT_FIELDS,
      }),
    ).toBeNull();
  });
});
