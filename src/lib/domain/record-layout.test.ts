import { describe, expect, it } from "vitest";
import { shouldShowTodayCards } from "./record-layout";

const base = {
  workoutActive: false,
  subTab: "workout" as const,
  hasStatus: true,
  didWorkoutToday: true,
};

describe("shouldShowTodayCards — 상태·누적 카드는 운동 완료 후에만", () => {
  it("오늘 운동을 마쳤으면 보인다", () => {
    expect(shouldShowTodayCards(base)).toBe(true);
  });

  it("운동 전에는 계획이 있든 없든 안 보인다 (퀘스트 카드만)", () => {
    expect(shouldShowTodayCards({ ...base, didWorkoutToday: false })).toBe(false);
  });

  it("운동 중·달력 탭·상태 조회 전에는 안 보인다", () => {
    expect(shouldShowTodayCards({ ...base, workoutActive: true })).toBe(false);
    expect(shouldShowTodayCards({ ...base, subTab: "calendar" })).toBe(false);
    expect(shouldShowTodayCards({ ...base, hasStatus: false })).toBe(false);
  });
});
