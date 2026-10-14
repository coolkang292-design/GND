import { describe, expect, it } from "vitest";
import { summarizePublicCrewMonth } from "./crew-calendar";
import type { CompletedSession } from "./calendar";

function session(at: string, minutes: number, verification: CompletedSession["verification"] = "none"): CompletedSession {
  return { completedAt: new Date(at), durationSeconds: minutes * 60, verification };
}

describe("공개 크루 캘린더 집계", () => {
  it("동일 날짜 복수 완료를 날짜 도장 하나로 묶고 운동시간을 합산한다", () => {
    const month = summarizePublicCrewMonth([
      session("2026-10-05T00:00:00Z", 20),
      session("2026-10-05T11:00:00Z", 35, "camera_verified"),
      session("2026-10-07T04:00:00Z", 10),
    ], "Asia/Seoul", 2026, 10);
    expect(month.workoutDays).toBe(2);
    expect(month.sessionCount).toBe(3);
    expect(month.totalDurationSeconds).toBe(65 * 60);
    expect(month.stamps.find((s) => s.dateKey === "2026-10-05")).toMatchObject({
      count: 2,
      verification: "camera_verified",
      totalDurationSeconds: 55 * 60,
    });
  });

  it("한국 시간 자정·월말을 정확히 적용하며 미래 달 기록을 섞지 않는다", () => {
    const month = summarizePublicCrewMonth([
      session("2026-09-30T14:59:59Z", 10), // 한국 9월 30일
      session("2026-09-30T15:00:00Z", 20), // 한국 10월 1일
      session("2026-10-31T14:59:59Z", 30), // 한국 10월 31일
      session("2026-10-31T15:00:00Z", 40), // 한국 11월 1일
    ], "Asia/Seoul", 2026, 10);
    expect(month.stamps.map((s) => s.dateKey)).toEqual([
      "2026-10-01", "2026-10-31",
    ]);
    expect(month.totalDurationSeconds).toBe(50 * 60);
  });

  it("계획 없는 달은 0일·0분이며 임의의 완료율을 만들지 않는다", () => {
    expect(summarizePublicCrewMonth([], "Asia/Seoul", 2026, 10)).toEqual({
      stamps: [], workoutDays: 0, sessionCount: 0, totalDurationSeconds: 0,
    });
  });
});
