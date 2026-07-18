import { describe, expect, test } from "vitest";
import {
  DEFAULT_TIMEZONE,
  dayKey,
  dayRange,
  hourOfDay,
  isSameDay,
  startOfDay,
  weekRange,
  weekStart,
} from "@/lib/domain/time";

// Asia/Seoul = UTC+9, DST 없음
const SEOUL = "Asia/Seoul";

describe("DEFAULT_TIMEZONE", () => {
  test("Asia/Seoul이다", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Seoul");
  });
});

describe("dayKey — UTC 순간을 tz 기준 YYYY-MM-DD로", () => {
  test("UTC 20:00 = KST 다음날 05:00", () => {
    expect(dayKey(new Date("2026-07-14T20:00:00Z"), SEOUL)).toBe("2026-07-15");
  });

  test("KST 23:59:59는 같은 날", () => {
    expect(dayKey(new Date("2026-07-15T14:59:59Z"), SEOUL)).toBe("2026-07-15");
  });

  test("KST 자정 정각은 다음날", () => {
    expect(dayKey(new Date("2026-07-15T15:00:00Z"), SEOUL)).toBe("2026-07-16");
  });

  test("연 경계: UTC 12/31 15:00 = KST 1/1", () => {
    expect(dayKey(new Date("2025-12-31T15:00:00Z"), SEOUL)).toBe("2026-01-01");
  });

  test("한 자리 월/일은 0 패딩", () => {
    expect(dayKey(new Date("2026-03-04T03:00:00Z"), SEOUL)).toBe("2026-03-04");
  });
});

describe("startOfDay — tz 기준 그날 00:00의 UTC 순간", () => {
  test("KST 11:00 → 그날 KST 자정 = 전날 15:00Z", () => {
    expect(startOfDay(new Date("2026-07-15T02:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-14T15:00:00Z"),
    );
  });

  test("이미 자정이면 그대로", () => {
    expect(startOfDay(new Date("2026-07-14T15:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-14T15:00:00Z"),
    );
  });

  test("DST 있는 tz도 정확 (뉴욕 봄 전환일)", () => {
    // 2026-03-08 뉴욕은 02:00에 DST 시작. 그날 정오(EDT, UTC-4)의 자정은 EST(UTC-5) 기준.
    expect(
      startOfDay(new Date("2026-03-08T16:00:00Z"), "America/New_York"),
    ).toEqual(new Date("2026-03-08T05:00:00Z"));
  });
});

describe("dayRange — [그날 00:00, 다음날 00:00)", () => {
  test("서울은 정확히 24시간", () => {
    const { start, end } = dayRange(new Date("2026-07-15T02:00:00Z"), SEOUL);
    expect(start).toEqual(new Date("2026-07-14T15:00:00Z"));
    expect(end).toEqual(new Date("2026-07-15T15:00:00Z"));
  });

  test("end는 다음날의 startOfDay와 일치", () => {
    const instant = new Date("2026-07-15T02:00:00Z");
    const { end } = dayRange(instant, SEOUL);
    expect(dayKey(end, SEOUL)).toBe("2026-07-16");
  });
});

describe("weekStart — 월요일 00:00 (tz 기준)", () => {
  test("수요일 → 그 주 월요일", () => {
    // 2026-07-15는 KST 수요일 → 월요일 7/13 00:00 KST = 7/12 15:00Z
    expect(weekStart(new Date("2026-07-15T02:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-12T15:00:00Z"),
    );
  });

  test("일요일은 지나간 월요일에 속한다", () => {
    // 2026-07-19은 KST 일요일 → 월요일은 7/13
    expect(weekStart(new Date("2026-07-19T02:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-12T15:00:00Z"),
    );
  });

  test("월요일 당일은 그날 자정", () => {
    // 2026-07-13 KST 월요일 오전
    expect(weekStart(new Date("2026-07-13T01:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-12T15:00:00Z"),
    );
  });

  test("주가 월 경계를 넘는 경우", () => {
    // 2026-08-01은 KST 토요일 → 월요일은 7/27
    expect(weekStart(new Date("2026-08-01T02:00:00Z"), SEOUL)).toEqual(
      new Date("2026-07-26T15:00:00Z"),
    );
  });
});

describe("weekRange — [월 00:00, 다음주 월 00:00)", () => {
  test("서울은 정확히 7일", () => {
    const { start, end } = weekRange(new Date("2026-07-15T02:00:00Z"), SEOUL);
    expect(start).toEqual(new Date("2026-07-12T15:00:00Z"));
    expect(end).toEqual(new Date("2026-07-19T15:00:00Z"));
  });
});

describe("isSameDay — tz 기준 같은 달력 날짜인가", () => {
  test("UTC 날짜는 다르지만 KST 같은 날 → true", () => {
    expect(
      isSameDay(
        new Date("2026-07-14T20:00:00Z"), // KST 7/15 05:00
        new Date("2026-07-15T10:00:00Z"), // KST 7/15 19:00
        SEOUL,
      ),
    ).toBe(true);
  });

  test("KST 자정 경계를 넘으면 false", () => {
    expect(
      isSameDay(
        new Date("2026-07-15T14:59:00Z"), // KST 7/15 23:59
        new Date("2026-07-15T15:01:00Z"), // KST 7/16 00:01
        SEOUL,
      ),
    ).toBe(false);
  });
});

describe("hourOfDay — instant가 tz에서 가리키는 시(0~23)", () => {
  test("UTC 00:30 = KST 09시", () => {
    expect(hourOfDay(new Date("2026-07-18T00:30:00Z"), "Asia/Seoul")).toBe(9);
  });

  test("UTC 23:30 = KST 다음날 08시 (날짜 경계)", () => {
    expect(hourOfDay(new Date("2026-07-17T23:30:00Z"), "Asia/Seoul")).toBe(8);
  });
});
