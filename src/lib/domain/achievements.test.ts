import { describe, expect, it } from "vitest";
import { RARITY_META, toDisplayUnit } from "./achievements";

describe("RARITY_META", () => {
  it("5단계 모두 라벨·순서를 갖는다", () => {
    expect(RARITY_META.common.label).toBe("COMMON");
    expect(RARITY_META.mythic.label).toBe("MYTHIC");
    expect(RARITY_META.epic.order).toBeGreaterThan(RARITY_META.rare.order);
  });
});

describe("toDisplayUnit", () => {
  it("분을 시간으로", () => {
    expect(toDisplayUnit("total_minutes", 2520)).toEqual({ amount: 42, unit: "시간" });
  });
  it("kg을 톤으로(소수1)", () => {
    expect(toDisplayUnit("weight_volume_kg", 18300)).toEqual({ amount: 18.3, unit: "톤" });
  });
  it("m를 km로(소수1)", () => {
    expect(toDisplayUnit("cardio_distance_m", 83000)).toEqual({ amount: 83, unit: "km" });
  });
  it("운동수·기록은 회, 불꽃은 일", () => {
    expect(toDisplayUnit("workout_count", 7)).toEqual({ amount: 7, unit: "회" });
    expect(toDisplayUnit("record_beaten", 3)).toEqual({ amount: 3, unit: "회" });
    expect(toDisplayUnit("streak_days", 4)).toEqual({ amount: 4, unit: "일" });
  });
});
