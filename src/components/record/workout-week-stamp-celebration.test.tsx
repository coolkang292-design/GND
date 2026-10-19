// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutWeekStampCelebration } from "./workout-week-stamp-celebration";
const mocks = vi.hoisted(() => ({
  getCompletedSessionMinutes: vi.fn(), getMyProfile: vi.fn(),
}));
vi.mock("@/lib/workout", () => ({getCompletedSessionMinutes: mocks.getCompletedSessionMinutes}));
vi.mock("@/lib/crew", () => ({getMyProfile: mocks.getMyProfile}));
afterEach(() => {cleanup();vi.resetAllMocks();});
const props={userId:"test-user",sessionId:"saved-session",completedAtMs:Date.parse("2026-10-20T07:52:00+09:00")};
const item=(s:string)=>({completedAt:new Date(s),durationMinutes:30});
describe("WorkoutWeekStampCelebration", () => {
  it("animates one stamp after a real first-day completion",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([
      item("2026-10-19T07:00:00+09:00"),item("2026-10-20T07:52:00+09:00"),
    ]);
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(screen.getByText("2일 완료")).toBeTruthy());
    expect(container.querySelectorAll(".gnd-stamp-impact")).toHaveLength(1);
    expect(screen.getByText("오늘의 도장, 찍었다!")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(7);
  });
  it("does not replay the stamp on a second workout the same day",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([
      item("2026-10-20T06:00:00+09:00"),item("2026-10-20T07:52:00+09:00"),
    ]);
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(screen.getByText("1일 완료")).toBeTruthy());
    expect(container.querySelector(".gnd-stamp-impact")).toBeNull();
    expect(screen.queryByText("오늘의 도장, 찍었다!")).toBeNull();
  });
  it("never invents a calendar on network failure",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockRejectedValue(new Error("network"));
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(mocks.getCompletedSessionMinutes).toHaveBeenCalledOnce());
    expect(container.querySelector("[data-testid=week-stamp-celebration]")).toBeNull();
  });
});
