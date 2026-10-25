import { describe, expect, it } from "vitest";
import type { PeriodSessionRow } from "@/lib/challenge";
import { buildDailyProofRates, summarizeRates } from "./creator-report";
import type { CreatorParticipant } from "./creator-studio";

const participants: CreatorParticipant[] = [
  { user_id: "host", role: "host", status: "joined", joined_at: "2026-09-25T00:00:00Z" },
  { user_id: "a", role: "member", status: "joined", joined_at: "2026-09-25T03:00:00Z" },
  { user_id: "b", role: "member", status: "joined", joined_at: "2026-10-03T03:00:00Z" }, // 기간 중 합류
  { user_id: "gone", role: "member", status: "dropped", joined_at: "2026-09-25T03:00:00Z" },
];
const sessions: PeriodSessionRow[] = [
  { userId: "host", completedAt: "2026-10-01T03:00:00Z", exercises: [] },
  { userId: "a", completedAt: "2026-10-01T03:00:00Z", exercises: [] },
  { userId: "a", completedAt: "2026-10-03T03:00:00Z", exercises: [] },
  { userId: "b", completedAt: "2026-10-03T05:00:00Z", exercises: [] },
  { userId: "gone", completedAt: "2026-10-02T03:00:00Z", exercises: [] },
  { userId: "a", completedAt: "2026-10-09T03:00:00Z", exercises: [] }, // 오늘 이후 — 그리지 않는다
];
const input = {
  participants, sessions, startDate: "2026-10-01", endDate: "2026-10-31",
  todayKey: "2026-10-04", status: "active" as const,
};

describe("daily proof rate (report mockup 1)", () => {
  it("divides proofs by members who had joined by that day, host and dropouts excluded", () => {
    const days = buildDailyProofRates(input);
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(days.map((d) => [d.members, d.proofs])).toEqual([[1, 1], [1, 0], [2, 2], [2, 0]]);
    expect(days.map((d) => d.rate)).toEqual([1, 0, 1, 0]);
  });

  it("leaves a gap (null) when nobody had joined yet, instead of a fake 0%", () => {
    const days = buildDailyProofRates({
      ...input,
      participants: participants.map((p) => (p.user_id === "a" ? { ...p, joined_at: "2026-10-02T03:00:00Z" } : p)),
    });
    expect(days[0]).toMatchObject({ members: 0, rate: null });
  });

  it("has nothing to draw before the start", () => {
    expect(buildDailyProofRates({ ...input, status: "setup", todayKey: "2026-09-28" })).toEqual([]);
  });

  it("stops at the end date after the challenge ends", () => {
    const days = buildDailyProofRates({ ...input, status: "ended", endDate: "2026-10-03", todayKey: "2026-10-20" });
    expect(days.at(-1)?.day).toBe("2026-10-03");
  });

  // 평균은 날짜별 비율의 평균이 아니라 (인증 합 ÷ 회원·일 합) — 회원이 적은 날이 과대 대표되지 않게.
  it("averages over member-days, skipping gap days", () => {
    const s = summarizeRates(buildDailyProofRates(input));
    expect(s).toEqual({ proofs: 3, memberDays: 6, rate: 0.5 });
    expect(summarizeRates([])).toEqual({ proofs: 0, memberDays: 0, rate: null });
  });
});
