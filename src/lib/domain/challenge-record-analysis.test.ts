import { describe, expect, it } from "vitest";
import type { PeriodSessionRow } from "@/lib/challenge";
import { buildMyRecordReport } from "./challenge-record-analysis";

const rows: PeriodSessionRow[] = [
  { userId: "me", completedAt: "2026-10-02T03:00:00Z", durationMinutes: null, exercises: [] },
  { userId: "me", completedAt: "2026-10-06T03:00:00Z", durationMinutes: 30, exercises: [] },
  { userId: "other", completedAt: "2026-10-02T03:00:00Z", durationMinutes: 40, exercises: [] },
];
const basic = {
  userId: "me",
  participant: { userId: "me", goals: [], workoutDays: 1, plannedDays: 5 },
  goals: [],
  rows,
  plans: [{ planDate: "2026-10-02", setCount: 4 }, { planDate: "2026-10-06", setCount: 6 }],
  startDate: "2026-10-01",
  timeZone: "Asia/Seoul",
};

describe("shared record analysis for live and ended challenges", () => {
  it("limits live bars and records to today, without exposing overall-score trend", () => {
    const live = buildMyRecordReport({
      ...basic, endDate: "2026-10-03", finalized: false,
    });
    expect(live.bars).toHaveLength(3);
    expect(live.bars.map((day) => day.actualCount)).toEqual([0, 1, 0]);
    expect(live.bars[1].planSets).toBe(4);
    expect(live.records.maxMinutes).toBeNull(); // unmeasured is not 0 minutes
    expect(live.trend).toEqual([]);
    expect(live.ranked).toBeNull();
    expect(live.total).toBe(0);
    expect(live.weeks).toHaveLength(1);
  });

  it("shares past day totals with the ended report without granting new rewards", () => {
    const live = buildMyRecordReport({
      ...basic, endDate: "2026-10-03", finalized: false,
    });
    const ended = buildMyRecordReport({
      ...basic, endDate: "2026-10-07", finalized: true,
    });
    expect(ended.bars.slice(0, 3)).toEqual(live.bars);
    expect(ended.bars[5].actualCount).toBe(1);
    expect(ended.records.maxMinutes?.value).toBe(30);
    expect(ended.goals).toEqual(live.goals);
  });

  // 진행 중에 이번 주 목표가 "지난 날 수"로 줄면 수요일엔 주 5회가 3/3으로 보인다.
  it("keeps the full weekly target for the current live week", () => {
    const live = buildMyRecordReport({
      ...basic, endDate: "2026-10-03", periodEndDate: "2026-10-14", finalized: false,
    });
    expect(live.weeks).toHaveLength(1);
    expect(live.weeks[0]).toMatchObject({ week: 1, target: 5, done: 1 });

    const secondWeek = buildMyRecordReport({
      ...basic, endDate: "2026-10-09", periodEndDate: "2026-10-14", finalized: false,
    });
    expect(secondWeek.weeks.map((w) => w.target)).toEqual([5, 5]);

    const ended = buildMyRecordReport({
      ...basic, endDate: "2026-10-14", finalized: true,
    });
    expect(ended.weeks.slice(0, 2).map((w) => w.target)).toEqual(secondWeek.weeks.map((w) => w.target));
  });
});
