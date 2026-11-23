import { describe, expect, it } from "vitest";
import { estimatePlanMinutes } from "./plan-minutes";

const weight = (name = "풀업") => ({ exerciseType: "bodyweight" as const, name, sets: [{ durationSeconds: 0 }] });
const cardio = (min: number) => ({ exerciseType: "cardio" as const, sets: [{ durationSeconds: min * 60 }] });

describe("estimatePlanMinutes: 확실히 아는 시간만 센다", () => {
  it("인터벌 8분만", () => {
    expect(estimatePlanMinutes(8, [])).toEqual({ minutes: 8, hasUnknownTime: false, sourceLabel: "인터벌 8분" });
  });
  it("인터벌 8분 + 풀업: 시간은 8분, 풀업은 '모름'으로 알린다", () => {
    const block = [weight("a"), weight("b"), weight("c"), weight("d")];
    const r = estimatePlanMinutes(8, [...block, weight("풀업")]);
    expect(r).toMatchObject({ minutes: 8, hasUnknownTime: true, sourceLabel: "인터벌 8분" });
  });
  it("인터벌 블록 안의 종목은 시간에 더하지 않는다 (이중 계산 방지)", () => {
    const block = [cardio(3), cardio(3), cardio(3), cardio(3)]; // 블록 자리 0~3
    expect(estimatePlanMinutes(8, block).minutes).toBe(8);
  });
  it("유산소만: 입력한 시간 합", () => {
    expect(estimatePlanMinutes(null, [cardio(30), cardio(10)])).toEqual({ minutes: 40, hasUnknownTime: false, sourceLabel: "유산소 40분" });
  });
  it("웨이트만: 시간 0, 모름, 문구 없음", () => {
    expect(estimatePlanMinutes(null, [weight()])).toEqual({ minutes: 0, hasUnknownTime: true, sourceLabel: null });
  });
  it("인터벌 + 유산소는 합산해 문구에 둘 다 쓴다", () => {
    const block = [weight("a"), weight("b"), weight("c"), weight("d")];
    const r = estimatePlanMinutes(8, [...block, cardio(20)]);
    expect(r).toMatchObject({ minutes: 28, hasUnknownTime: false, sourceLabel: "인터벌 8분 + 유산소 20분" });
  });
  it("빈 세트·음수·NaN은 0으로", () => {
    expect(estimatePlanMinutes(null, [{ exerciseType: "cardio", sets: [{ durationSeconds: -5 }, { durationSeconds: null }] }]).minutes).toBe(0);
  });
});
