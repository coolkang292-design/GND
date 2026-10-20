// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutWeekStampCelebration } from "./workout-week-stamp-celebration";
const mocks = vi.hoisted(() => ({
  getCompletedSessionMinutes: vi.fn(), getMyProfile: vi.fn(), getMyStampColors: vi.fn(),
}));
vi.mock("@/lib/workout", () => ({getCompletedSessionMinutes: mocks.getCompletedSessionMinutes}));
vi.mock("@/lib/crew", () => ({getMyProfile: mocks.getMyProfile}));
vi.mock("@/lib/stamps", () => ({getMyStampColors: mocks.getMyStampColors}));
afterEach(() => {cleanup();vi.resetAllMocks();});
import { beforeEach } from "vitest";
beforeEach(() => { mocks.getMyStampColors.mockResolvedValue({}); });
const props={userId:"test-user",sessionId:"saved-session",completedAtMs:Date.parse("2026-10-20T07:52:00+09:00")};
const item=(s:string)=>({completedAt:new Date(s),durationMinutes:30});
describe("WorkoutWeekStampCelebration", () => {
  it("shows a static calendar after the saved stamp moment",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([
      item("2026-10-19T07:00:00+09:00"),item("2026-10-20T07:52:00+09:00"),
    ]);
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(screen.getByText("2일 완료")).toBeTruthy());
    expect(container.querySelectorAll(".gnd-stamp-impact")).toHaveLength(0);
    expect(screen.queryByText("오늘도 해냈다.")).toBeNull();
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
    expect(screen.queryByTestId("workout-stamp-reveal")).toBeNull();
  });
  it("shows guaranteed first-day orange without gold effects",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([item("2026-10-20T07:52:00+09:00")]);
    mocks.getMyStampColors.mockResolvedValue({"2026-10-20":"orange"});
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(screen.getByText("1일 완료")).toBeTruthy());
    expect(container.querySelector(".gnd-stamp-gold-burst")).toBeNull();
    expect(screen.queryByText("오늘은 느낌이 좀 좋은데?")).toBeNull();
  });
  it("only flashes gold on a fresh stamp",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([item("2026-10-20T07:52:00+09:00")]);
    mocks.getMyStampColors.mockResolvedValue({"2026-10-20":"gold"});
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(screen.getByText("1일 완료")).toBeTruthy());
    expect(screen.queryByText("오늘, 뭔가 좋은 일 생기려나?")).toBeNull();
    expect(container.querySelectorAll(".gnd-stamp-gold-burst")).toHaveLength(0);
  });
  it("preserves the server-awarded color when the read-only colors query fails",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockResolvedValue([item("2026-10-20T07:52:00+09:00")]);
    mocks.getMyStampColors.mockRejectedValue(new Error("temporary network failure"));
    const {container}=render(<WorkoutWeekStampCelebration {...props}
      awardedStamp={{dateKey:"2026-10-20",variant:"gold",newlyAwarded:true}}/>);
    await waitFor(()=>expect(screen.getByText("1일 완료")).toBeTruthy());
    expect(container.querySelector('svg[class*="text-[#C39420]"]')).not.toBeNull();
    expect(container.querySelector(".gnd-stamp-gold-burst")).toBeNull();
  });
  it("never invents a calendar on network failure",async()=>{
    mocks.getMyProfile.mockResolvedValue({timezone:"Asia/Seoul"});
    mocks.getCompletedSessionMinutes.mockRejectedValue(new Error("network"));
    const {container}=render(<WorkoutWeekStampCelebration {...props}/>);
    await waitFor(()=>expect(mocks.getCompletedSessionMinutes).toHaveBeenCalledOnce());
    expect(container.querySelector("[data-testid=week-stamp-celebration]")).toBeNull();
  });
});
