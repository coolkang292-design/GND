import { describe, expect, it } from "vitest";
import { formatSetAmount } from "./set-display";

/**
 * 지난 기록 상세(④)와 계획 상세(⑥)가 **같은 규칙**으로 세트를 그려야 한다.
 * 두 곳에 따로 쓰면 갈라진다.
 *
 * 형식은 공유 텍스트(`formatWorkoutLog`)의 "n세트: " 뒤 부분과 **같아야 한다** —
 * 화면과 공유 텍스트가 서로 다른 수치 표기를 쓰면 사용자가 둘을 대조할 수 없다.
 */
describe("formatSetAmount — 세트 하나의 수량 표기", () => {
  const amount = {
    weightKg: 0,
    reps: 0,
    distanceKm: 0,
    durationMin: 0,
  };

  it("웨이트: '{kg}kg {회}회'", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "weight",
        measure: null,
        weightKg: 35,
        reps: 12,
      }),
    ).toBe("35kg 12회");
  });

  it("맨몸 횟수형: '{회}회'", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "bodyweight",
        measure: "reps",
        reps: 20,
      }),
    ).toBe("20회");
  });

  it("맨몸 시간형: '{분}분'", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "bodyweight",
        measure: "time",
        durationMin: 3,
      }),
    ).toBe("3분");
  });

  it("맨몸 measure가 null이면 횟수형으로 본다", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "bodyweight",
        measure: null,
        reps: 15,
      }),
    ).toBe("15회");
  });

  it("유산소: 거리와 시간을 함께 '{km}km {분}분'", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "cardio",
        measure: null,
        distanceKm: 3.5,
        durationMin: 30,
      }),
    ).toBe("3.5km 30분");
  });

  it("유산소: 0인 항목은 생략한다 — 거리만", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "cardio",
        measure: null,
        distanceKm: 3.5,
      }),
    ).toBe("3.5km");
  });

  it("유산소: 0인 항목은 생략한다 — 시간만", () => {
    expect(
      formatSetAmount({
        ...amount,
        exerciseType: "cardio",
        measure: null,
        durationMin: 30,
      }),
    ).toBe("30분");
  });

  it("유산소: 둘 다 0이면 '0분' — 빈 문자열을 내지 않는다", () => {
    expect(
      formatSetAmount({ ...amount, exerciseType: "cardio", measure: null }),
    ).toBe("0분");
  });

  it("계획 세트(값이 전부 0인 웨이트)도 표기를 만든다 — 계획 상세가 쓴다", () => {
    expect(
      formatSetAmount({ ...amount, exerciseType: "weight", measure: null }),
    ).toBe("0kg 0회");
  });
});
