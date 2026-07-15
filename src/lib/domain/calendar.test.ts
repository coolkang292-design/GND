import { describe, expect, it } from "vitest";
import {
  computeDayStamps,
  sessionsInMonth,
  sessionsOnDay,
  summarizeMonth,
  type CompletedSession,
} from "./calendar";

const TZ = "Asia/Seoul"; // UTC+9

function session(
  completedAtIso: string,
  verification: CompletedSession["verification"] = "none",
  durationSeconds = 0,
): CompletedSession {
  return { completedAt: new Date(completedAtIso), verification, durationSeconds };
}

describe("computeDayStamps — completed 세션 → tz 기준 날짜별 스탬프", () => {
  it("세션 없으면 빈 배열", () => {
    expect(computeDayStamps([], TZ)).toEqual([]);
  });

  it("하루 스탬프에 count·총시간·인증수준을 담는다", () => {
    const stamps = computeDayStamps(
      [session("2026-07-13T01:00:00Z", "camera_verified", 1800)],
      TZ,
    );
    expect(stamps).toEqual([
      {
        dateKey: "2026-07-13",
        count: 1,
        verification: "camera_verified",
        totalDurationSeconds: 1800,
      },
    ]);
  });

  it("같은 날 복수 운동은 count 누적·시간 합산", () => {
    const stamps = computeDayStamps(
      [
        session("2026-07-13T01:00:00Z", "none", 600), // KST 10:00
        session("2026-07-13T11:00:00Z", "photo_uploaded", 900), // KST 20:00
      ],
      TZ,
    );
    expect(stamps).toHaveLength(1);
    expect(stamps[0].count).toBe(2);
    expect(stamps[0].totalDurationSeconds).toBe(1500);
  });

  it("하루 인증수준은 가장 높은 등급으로 (camera > photo > none)", () => {
    const stamps = computeDayStamps(
      [
        session("2026-07-13T01:00:00Z", "none"),
        session("2026-07-13T02:00:00Z", "camera_verified"),
        session("2026-07-13T03:00:00Z", "photo_uploaded"),
      ],
      TZ,
    );
    expect(stamps[0].verification).toBe("camera_verified");
  });

  it("UTC 자정 경계는 사용자 tz 기준으로 날짜를 가른다", () => {
    // UTC 7/12 16:00 = KST 7/13 01:00 → 7/13
    const stamps = computeDayStamps([session("2026-07-12T16:00:00Z")], TZ);
    expect(stamps[0].dateKey).toBe("2026-07-13");
  });

  it("날짜 오름차순 정렬", () => {
    const stamps = computeDayStamps(
      [session("2026-07-13T03:00:00Z"), session("2026-07-10T03:00:00Z")],
      TZ,
    );
    expect(stamps.map((s) => s.dateKey)).toEqual(["2026-07-10", "2026-07-13"]);
  });
});

describe("sessionsInMonth — tz 기준 특정 월의 세션만 (경계 필수)", () => {
  const around = [
    session("2026-06-30T14:00:00Z"), // KST 6/30 23:00 → 6월
    session("2026-06-30T16:00:00Z"), // KST 7/1 01:00 → 7월
    session("2026-07-15T03:00:00Z"), // KST 7/15 → 7월
    session("2026-07-31T14:00:00Z"), // KST 7/31 23:00 → 7월
    session("2026-07-31T15:00:00Z"), // KST 8/1 00:00 → 8월
  ];

  it("월초 경계: KST 7/1 00:00 이상만 포함", () => {
    const july = sessionsInMonth(around, TZ, 2026, 7);
    expect(july).toHaveLength(3);
  });

  it("월말 경계: KST 8/1 00:00은 제외", () => {
    const july = sessionsInMonth(around, TZ, 2026, 7);
    expect(july).not.toContain(around[4]);
  });

  it("연 경계: 12월과 1월을 tz 기준으로 가른다", () => {
    const yearBoundary = [
      session("2025-12-31T14:00:00Z"), // KST 12/31 23:00 → 2025-12
      session("2025-12-31T15:00:00Z"), // KST 2026-1/1 00:00 → 2026-01
    ];
    expect(sessionsInMonth(yearBoundary, TZ, 2026, 1)).toHaveLength(1);
    expect(sessionsInMonth(yearBoundary, TZ, 2025, 12)).toHaveLength(1);
  });
});

describe("sessionsOnDay — tz 기준 특정 날짜의 세션 (상세 시트·복사용)", () => {
  it("dateKey에 해당하는 세션만 반환", () => {
    const sessions = [
      session("2026-07-13T01:00:00Z"),
      session("2026-07-13T11:00:00Z"),
      session("2026-07-14T03:00:00Z"),
    ];
    expect(sessionsOnDay(sessions, TZ, "2026-07-13")).toHaveLength(2);
    expect(sessionsOnDay(sessions, TZ, "2026-07-14")).toHaveLength(1);
    expect(sessionsOnDay(sessions, TZ, "2026-07-15")).toHaveLength(0);
  });
});

describe("summarizeMonth — 월간 요약 (횟수·총시간·달성률)", () => {
  const july = [
    session("2026-07-01T03:00:00Z", "none", 1200),
    session("2026-07-01T09:00:00Z", "camera_verified", 1800), // 같은 날 2회
    session("2026-07-05T03:00:00Z", "photo_uploaded", 600),
    session("2026-08-01T03:00:00Z", "none", 999), // 8월 → 제외
  ];

  it("운동일 수·세션 수·총시간을 tz·월 기준으로 집계", () => {
    const s = summarizeMonth(july, TZ, 2026, 7, 3);
    expect(s.workoutDayCount).toBe(2); // 7/1, 7/5
    expect(s.sessionCount).toBe(3); // 8월 제외
    expect(s.totalDurationSeconds).toBe(3600); // 1200+1800+600
  });

  it("월의 일수를 tz 기준으로 반영 (7월=31일)", () => {
    expect(summarizeMonth(july, TZ, 2026, 7, 3).daysInMonth).toBe(31);
    expect(summarizeMonth([], TZ, 2026, 2, 3).daysInMonth).toBe(28);
    expect(summarizeMonth([], TZ, 2024, 2, 3).daysInMonth).toBe(29); // 윤년
  });

  it("달성률 = 운동일 / (주간목표를 그 달 일수로 환산), 1.0 상한", () => {
    // weeklyGoal 3, 7월 31일 → 기대 운동일 = 3/7*31 ≈ 13.29
    const s = summarizeMonth(july, TZ, 2026, 7, 3);
    expect(s.achievementRate).toBeCloseTo(2 / (3 / 7 * 31), 5);
  });

  it("주간목표를 초과 달성해도 달성률은 1.0을 넘지 않는다", () => {
    const daily = Array.from({ length: 20 }, (_, i) =>
      session(`2026-07-${String(i + 1).padStart(2, "0")}T03:00:00Z`, "none", 60),
    );
    // weeklyGoal 1 → 기대 4.43일, 20일 운동 → 상한 1.0
    expect(summarizeMonth(daily, TZ, 2026, 7, 1).achievementRate).toBe(1);
  });

  it("주간목표 0이면 달성률 0 (0으로 나누지 않음)", () => {
    expect(summarizeMonth(july, TZ, 2026, 7, 0).achievementRate).toBe(0);
  });

  it("세션 없는 달은 전부 0", () => {
    const s = summarizeMonth([], TZ, 2026, 7, 3);
    expect(s.workoutDayCount).toBe(0);
    expect(s.sessionCount).toBe(0);
    expect(s.totalDurationSeconds).toBe(0);
    expect(s.achievementRate).toBe(0);
  });
});
