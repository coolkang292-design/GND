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

describe("summarizeMonth — 선택 월의 운동일·총시간·계획 대비 완료율", () => {
  const july = [
    session("2026-07-01T03:00:00Z", "none", 1200),
    session("2026-07-01T09:00:00Z", "camera_verified", 1800),
    session("2026-07-05T03:00:00Z", "photo_uploaded", 600),
    session("2026-08-01T03:00:00Z", "none", 999),
  ];
  const plans = ["2026-07-01", "2026-07-06", "2026-07-06", "2026-07-31", "2026-06-30", "2026-08-01"].map(planDate => ({ planDate }));

  it("같은 날 여러 운동은 1일이며 시간은 선택 월의 모든 기록을 합산한다", () => {
    const s = summarizeMonth(july, TZ, 2026, 7, plans);
    expect(s.workoutDayCount).toBe(2);
    expect(s.sessionCount).toBe(3);
    expect(s.totalDurationSeconds).toBe(3600);
  });

  it("완료일과 계획일의 합집합으로 계산해 중복 계획·완료 후 삭제·다른 월을 처리한다", () => {
    const s = summarizeMonth(july, TZ, 2026, 7, plans);
    expect(s.monthlyTargetDayCount).toBe(4); // 1, 5, 6, 31일
    expect(s.remainingPlanDayCount).toBe(2);
    expect(s.achievementRate).toBe(0.5);
  });

  it("월 전체의 놓친 계획과 미래 계획을 모두 포함한다", () => {
    const s = summarizeMonth([session("2026-07-15T03:00:00Z")], TZ, 2026, 7,
      ["2026-07-01", "2026-07-15", "2026-07-31"].map(planDate => ({planDate})));
    expect(s.achievementRate).toBeCloseTo(1 / 3);
  });

  it("계획 없이 완료했거나 완료 계획이 삭제돼도 완료율은 100%로 유지된다", () => {
    expect(summarizeMonth(july, TZ, 2026, 7, []).achievementRate).toBe(1);
  });

  it("해당 월에 계획만 있으면 0%, 기록과 계획 모두 없으면 기준 없음", () => {
    expect(summarizeMonth([], TZ, 2026, 7, plans).achievementRate).toBe(0);
    const empty = summarizeMonth([], TZ, 2026, 9, plans);
    expect(empty.workoutDayCount).toBe(0);
    expect(empty.totalDurationSeconds).toBe(0);
    expect(empty.monthlyTargetDayCount).toBe(0);
    expect(empty.achievementRate).toBeNull();
  });

  it("월 이동과 연·KST 월 경계에서 세 지표 모두 해당 월만 본다", () => {
    const sessions = [session("2025-12-31T14:59:59Z", "none", 600), session("2025-12-31T15:00:00Z", "none", 900)];
    const plans = [{planDate:"2025-12-31"}, {planDate:"2026-01-02"}];
    const dec = summarizeMonth(sessions, TZ, 2025, 12, plans);
    const jan = summarizeMonth(sessions, TZ, 2026, 1, plans);
    expect([dec.workoutDayCount, dec.totalDurationSeconds, dec.achievementRate]).toEqual([1,600,1]);
    expect([jan.workoutDayCount, jan.totalDurationSeconds, jan.achievementRate]).toEqual([1,900,0.5]);
  });

  it("월의 일수와 윤년을 반영한다", () => {
    expect(summarizeMonth([], TZ, 2026, 7, []).daysInMonth).toBe(31);
    expect(summarizeMonth([], TZ, 2026, 2, []).daysInMonth).toBe(28);
    expect(summarizeMonth([], TZ, 2024, 2, []).daysInMonth).toBe(29);
  });
});
