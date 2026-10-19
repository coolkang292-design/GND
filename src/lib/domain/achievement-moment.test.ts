import { describe, expect, it } from "vitest";
import { achievementMomentLine, completedWorkoutFeedPath } from "./achievement-moment";

const kst = "Asia/Seoul";
const at = (iso: string) => new Date(iso);

describe("achievementMomentLine", () => {
  it("compares unique workout days, not sessions, across weeks", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [
        at("2026-10-12T07:00:00+09:00"),
        at("2026-10-19T07:00:00+09:00"),
        at("2026-10-19T08:00:00+09:00"),
      ],
      completedAt: at("2026-10-20T08:00:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("지난주보다 1일 더 운동했어요.");
  });

  it("never describes current performance as worse if prior week was larger", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [
        at("2026-10-12T07:00:00+09:00"),
        at("2026-10-13T07:00:00+09:00"),
        at("2026-10-14T07:00:00+09:00"),
      ],
      completedAt: at("2026-10-19T08:00:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("이번 주 1일째, 오늘도 해냈어요.");
  });

  it("does not invent achievement data when history fails", () => {
    expect(achievementMomentLine({ previousCompletedAts: null, completedAt: at("2026-10-19T08:00:00+09:00"), timeZone: kst })).toBeNull();
  });

  it("celebrates the first confirmed workout without artificial comparisons", () => {
    expect(achievementMomentLine({ previousCompletedAts: [], completedAt: at("2026-10-19T08:00:00+09:00"), timeZone: kst })).toContain("첫 운동");
  });

  it("respects local Monday boundaries", () => {
    const line = achievementMomentLine({
      previousCompletedAts: [at("2026-10-18T23:55:00+09:00")],
      completedAt: at("2026-10-19T00:05:00+09:00"),
      timeZone: kst,
    });
    expect(line).toBe("이번 주 1일째, 오늘도 해냈어요.");
  });
});

describe("completedWorkoutFeedPath", () => {
  it("deep-links only group-visible sessions", () => {
    expect(completedWorkoutFeedPath("workout-id", "group")).toBe("/feed?session=workout-id");
    expect(completedWorkoutFeedPath("workout-id", "private")).toBeNull();
    expect(completedWorkoutFeedPath("workout-id", null)).toBeNull();
  });
  it("escapes the link parameter", () => {
    expect(completedWorkoutFeedPath("a&b", "group")).toBe("/feed?session=a%26b");
  });
});
