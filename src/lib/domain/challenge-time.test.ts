import { describe, expect, it } from "vitest";
import { formatMonthDay } from "./challenge-time";

describe("formatMonthDay — 시작일 표시", () => {
  it("앞의 0을 떼고 한국어로 적는다", () => {
    expect(formatMonthDay("2026-08-01")).toBe("8월 1일");
    expect(formatMonthDay("2026-12-25")).toBe("12월 25일");
  });

  /**
   * ⚠️ 이 파일의 다른 함수와 같은 이유로 `Date`를 쓰지 않는다.
   * `new Date("2026-08-20")`은 UTC 자정으로 읽히고, KST보다 뒤인 기기에서는
   * `8월 19일`이 된다. 문자열을 그대로 쪼개면 그 문제가 아예 없다.
   */
  it("연도가 달라도 월·일만 적는다", () => {
    expect(formatMonthDay("2099-01-09")).toBe("1월 9일");
  });
});
