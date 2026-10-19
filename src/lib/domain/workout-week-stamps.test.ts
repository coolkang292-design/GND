import { describe, expect, it } from "vitest";
import { workoutWeekStampSnapshot } from "./workout-week-stamps";
const d = (s: string) => new Date(s);
const tz = "Asia/Seoul";
describe("workoutWeekStampSnapshot", () => {
  it("marks only the first completed session of a local day as new", () => {
    const t = d("2026-10-20T07:52:00+09:00");
    const a = workoutWeekStampSnapshot({
      completedAt:t, completedSessions:[d("2026-10-19T07:00:00+09:00"),t],timeZone:tz,
    })!;
    expect(a.workoutDaysThisWeek).toBe(2);
    expect(a.days.map(x=>x.dateKey)).toEqual([
      "2026-10-19","2026-10-20","2026-10-21","2026-10-22",
      "2026-10-23","2026-10-24","2026-10-25",
    ]);
    expect(a.days.filter(x=>x.isNewStamp).map(x=>x.dateKey)).toEqual(["2026-10-20"]);
  });
  it("does not re-stamp two workouts on the same day", () => {
    const t=d("2026-10-20T19:00:00+09:00");
    const a=workoutWeekStampSnapshot({
      completedAt:t,completedSessions:[d("2026-10-20T07:00:00+09:00"),t],timeZone:tz,
    })!;
    expect(a.workoutDaysThisWeek).toBe(1);
    expect(a.newStamp).toBe(false);
    expect(a.days.some(x=>x.isNewStamp)).toBe(false);
  });
  it("omits unknown and stale history instead of inventing stamps", () => {
    const t=d("2026-10-20T12:00:00+09:00");
    expect(workoutWeekStampSnapshot({completedAt:t,completedSessions:null,timeZone:tz})).toBeNull();
    expect(workoutWeekStampSnapshot({
      completedAt:t,completedSessions:[d("2026-10-19T07:00:00+09:00")],timeZone:tz,
    })).toBeNull();
  });
  it("respects profile local time around midnight", () => {
    const t=d("2026-10-19T00:05:00+09:00");
    const a=workoutWeekStampSnapshot({completedAt:t,completedSessions:[t],timeZone:tz})!;
    expect(a.days[0].dateKey).toBe("2026-10-19");
    expect(a.days[0].isNewStamp).toBe(true);
  });
  it("keeps Monday boundaries through DST", () => {
    const t=d("2026-03-08T23:30:00-04:00");
    const a=workoutWeekStampSnapshot({
      completedAt:t,completedSessions:[t],timeZone:"America/New_York",
    })!;
    expect(a.days[0].dateKey).toBe("2026-03-02");
    expect(a.days[6].dateKey).toBe("2026-03-08");
  });
});
