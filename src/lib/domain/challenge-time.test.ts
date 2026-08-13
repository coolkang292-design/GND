import { describe, expect, it } from "vitest";
import {
  challengeDaysLeft,
  challengeDday,
  inclusiveDays,
} from "./challenge-time";

describe("challengeDaysLeft — 오늘~종료일 남은 일수(오늘 포함)", () => {
  it("종료 당일이면 1", () => {
    expect(challengeDaysLeft("2026-08-28", "2026-08-28")).toBe(1);
  });
  it("종료 하루 전이면 2", () => {
    expect(challengeDaysLeft("2026-08-27", "2026-08-28")).toBe(2);
  });
  it("종료일이 지났으면 0", () => {
    expect(challengeDaysLeft("2026-08-29", "2026-08-28")).toBe(0);
  });
  it("월 경계를 넘어도 정확히 계산", () => {
    expect(challengeDaysLeft("2026-07-30", "2026-08-02")).toBe(4);
  });
});

/**
 * 2026-08-13에 추가. `challenge/page.tsx`가 같은 산수를 지역 함수 `periodDays`로
 * 다시 짜 놓고 있었고, 홈 챌린지 요약이 세 번째 구현을 만들 뻔했다.
 *
 * ⚠️ 세 함수가 **1씩 어긋난다.** 아래 표가 그 차이를 고정한다 —
 * 하나만 고치고 나머지를 안 보면 화면마다 D-day가 하루씩 달라진다.
 */
describe("inclusiveDays — 양끝을 포함한 기간 일수", () => {
  it("같은 날이면 1일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-08-13")).toBe(1);
  });
  it("하루 차이면 2일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-08-14")).toBe(2);
  });
  it("4주 챌린지(시작일 + 27일)는 28일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-09-09")).toBe(28);
  });
  it("월 경계를 넘어도 정확하다", () => {
    expect(inclusiveDays("2026-08-31", "2026-09-01")).toBe(2);
  });
  it("연 경계를 넘어도 정확하다", () => {
    expect(inclusiveDays("2026-12-31", "2027-01-01")).toBe(2);
  });
  it("윤년 2월 29일을 하루로 센다", () => {
    // 2028-02-28 · 02-29 · 03-01 = 3일. 윤년이 아니면 2일이 된다.
    expect(inclusiveDays("2028-02-28", "2028-03-01")).toBe(3);
  });
  it("끝이 시작보다 이르면 하한을 걸지 않고 0 이하를 돌려준다", () => {
    // ⚠️ 여기서 자르지 않는다. 자를지 말지는 부르는 쪽이 정한다 —
    //    challengeDaysLeft는 0으로 자르고, challengeDday는 음수를 그대로 쓴다.
    expect(inclusiveDays("2026-08-14", "2026-08-13")).toBe(0);
    expect(inclusiveDays("2026-08-15", "2026-08-13")).toBe(-1);
  });
});

describe("challengeDday — 화면에 적는 D-N", () => {
  it("종료 당일은 D-0이다", () => {
    expect(challengeDday("2026-08-28", "2026-08-28")).toBe(0);
  });
  it("종료 하루 전은 D-1이다", () => {
    expect(challengeDday("2026-08-27", "2026-08-28")).toBe(1);
  });
  it("종료일이 지나면 음수다 — 화면이 '종료'로 갈아탈 수 있어야 한다", () => {
    // ⚠️ 0으로 자르면 안 된다. 종료 당일과 지난 날이 똑같이 D-0으로 보인다.
    expect(challengeDday("2026-08-29", "2026-08-28")).toBe(-1);
  });
  it("월 경계를 넘어도 정확하다", () => {
    expect(challengeDday("2026-07-30", "2026-08-02")).toBe(3);
  });
});

describe("세 함수의 어긋남 — 한 곳에 고정한다", () => {
  it("challengeDaysLeft는 inclusiveDays를 0에서 자른 것이다", () => {
    for (const [today, end] of [
      ["2026-08-28", "2026-08-28"],
      ["2026-08-27", "2026-08-28"],
      ["2026-08-29", "2026-08-28"],
      ["2026-07-30", "2026-08-02"],
    ]) {
      expect(challengeDaysLeft(today, end)).toBe(
        Math.max(0, inclusiveDays(today, end)),
      );
    }
  });
  it("challengeDday는 inclusiveDays보다 정확히 1 작다", () => {
    for (const [today, end] of [
      ["2026-08-28", "2026-08-28"],
      ["2026-08-27", "2026-08-28"],
      ["2026-08-29", "2026-08-28"],
      ["2026-07-30", "2026-08-02"],
    ]) {
      expect(challengeDday(today, end)).toBe(inclusiveDays(today, end) - 1);
    }
  });
});
