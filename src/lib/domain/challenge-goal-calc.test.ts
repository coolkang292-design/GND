import { describe, expect, it } from "vitest";
import {
  perDayFromTotal,
  perWeekFromTotalDays,
  roundTarget,
  totalDaysFromPerWeek,
  totalFromPerDay,
} from "./challenge-goal-calc";

describe("roundTarget — 목표값 반올림", () => {
  it("km는 소수 첫째 자리를 남긴다", () => {
    expect(roundTarget(5.71, "km")).toBe(5.7);
  });

  it("회는 정수로 — `171.4회`는 사람이 읽을 수 없다", () => {
    expect(roundTarget(171.43, "회")).toBe(171);
  });

  it("분도 정수로", () => {
    expect(roundTarget(342.86, "분")).toBe(343);
  });

  it("일도 정수로", () => {
    expect(roundTarget(11.6, "일")).toBe(12);
  });
});

describe("totalFromPerDay — 하루 기준 → 기간 총량", () => {
  it("하루 30회 × 주 3일 × 28일(4주) = 360회", () => {
    expect(totalFromPerDay(30, 3, 28)).toBe(360);
  });

  it("소수 첫째 자리까지만 남긴다", () => {
    // 5km × 주 3일 × 25일 = 53.571… → 53.6
    expect(totalFromPerDay(5, 3, 25)).toBe(53.6);
  });

  it("하루 목표가 0이면 0", () => {
    expect(totalFromPerDay(0, 3, 28)).toBe(0);
  });

  it("주 며칠이 0이면 0 — 0으로 나눌 일을 애초에 안 만든다", () => {
    expect(totalFromPerDay(30, 0, 28)).toBe(0);
  });
});

describe("perDayFromTotal — 기간 총량 → 하루 기준", () => {
  it("360회 ÷ (주 3일 × 4주) = 30회", () => {
    expect(perDayFromTotal(360, 3, 28)).toBe(30);
  });

  it("totalFromPerDay의 역이다", () => {
    expect(perDayFromTotal(totalFromPerDay(30, 3, 28), 3, 28)).toBe(30);
  });

  it("총량이 0이면 0", () => {
    expect(perDayFromTotal(0, 3, 28)).toBe(0);
  });

  it("주 며칠이 0이면 0 (0 나눗셈 방지)", () => {
    expect(perDayFromTotal(360, 0, 28)).toBe(0);
  });

  it("기간이 0이면 0 (0 나눗셈 방지)", () => {
    expect(perDayFromTotal(360, 3, 0)).toBe(0);
  });
});

describe("totalDaysFromPerWeek — 일수형 목표: 주 N일 → 기간 총 운동일", () => {
  it("주 3일 × 28일 = 12일", () => {
    expect(totalDaysFromPerWeek(3, 28)).toBe(12);
  });

  it("반올림한다 — 주 5일 × 25일 = 17.86 → 18일", () => {
    expect(totalDaysFromPerWeek(5, 25)).toBe(18);
  });

  it("최소 1일 — 참여율 분모와 같은 규칙이라 0이 나오면 안 된다", () => {
    expect(totalDaysFromPerWeek(1, 1)).toBe(1);
  });
});

describe("perWeekFromTotalDays — 일수형 목표: 기간 총 운동일 → 주 N일", () => {
  it("12일 ÷ 4주 = 주 3일", () => {
    expect(perWeekFromTotalDays(12, 28)).toBe(3);
  });

  it("7일을 넘지 않는다", () => {
    expect(perWeekFromTotalDays(28, 28)).toBe(7);
  });

  it("1일 밑으로 안 내려간다", () => {
    expect(perWeekFromTotalDays(0, 28)).toBe(1);
  });

  it("기간이 0이면 1 (0 나눗셈 방지)", () => {
    expect(perWeekFromTotalDays(12, 0)).toBe(1);
  });
});
