import { describe, expect, it } from "vitest";
import { dailyTotals } from "./challenge-report";

const s = (startIso: string, endIso: string) => ({
  startedAt: startIso,
  completedAt: endIso,
  durationMinutes: 30,
  exercises: [] as never[],
});

describe("dailyTotals — 순위와 같은 쪼개기 규칙", () => {
  it("1시간 안에 이어 한 운동은 하루 횟수에서 빠지고 시간은 그대로 더한다", () => {
    const m = dailyTotals(
      [
        s("2026-11-22T01:00:00Z", "2026-11-22T01:30:00Z"),
        s("2026-11-22T02:00:00Z", "2026-11-22T02:30:00Z"),
      ],
      "2026-11-01",
      "2026-11-30",
      "Asia/Seoul",
    );
    const day = m.get("2026-11-22");
    expect(day?.sessions).toBe(1);
    expect(day?.minutes).toBe(60);
  });

  it("이전 기록은 그대로 센다", () => {
    const m = dailyTotals(
      [
        s("2026-11-10T01:00:00Z", "2026-11-10T01:30:00Z"),
        s("2026-11-10T01:40:00Z", "2026-11-10T02:10:00Z"),
      ],
      "2026-11-01",
      "2026-11-30",
      "Asia/Seoul",
    );
    expect(m.get("2026-11-10")?.sessions).toBe(2);
  });
});
