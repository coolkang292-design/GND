import { describe, expect, it } from "vitest";
import { buildCreatorSnapshot, type CreatorParticipant } from "./creator-studio";
import type { PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";

const participants: CreatorParticipant[] = [
  { user_id: "host", role: "host", status: "joined", joined_at: "2026-10-01T00:00:00Z" },
  { user_id: "first", role: "member", status: "joined", joined_at: "2026-10-20T00:00:00Z" },
  { user_id: "second", role: "member", status: "joined", joined_at: null },
  { user_id: "invited", role: "member", status: "invited", joined_at: null },
  { user_id: "dropped", role: "member", status: "dropped", joined_at: null },
];
const sessions: PeriodSessionRow[] = [
  { userId: "host", completedAt: "2026-10-24T02:00:00Z", exercises: [] },
  { userId: "first", completedAt: "2026-10-23T02:00:00Z", exercises: [] },
  { userId: "first", completedAt: "2026-10-25T02:00:00Z", exercises: [] },
  { userId: "dropped", completedAt: "2026-10-23T02:00:00Z", exercises: [] },
];
const input = {
  participants,
  profiles: [
    { id: "first", nickname: "First", avatar_url: null },
    { id: "second", nickname: "Second", avatar_url: null },
  ],
  goals: [{ user_id: "first" } as UserGoal],
  sessions,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  todayKey: "2026-10-24",
};

describe("Creator Studio P0 snapshot", () => {
  it("excludes host, invited and dropped; never counts future proofs", () => {
    const result = buildCreatorSnapshot(input);
    expect(result.memberCount).toBe(2);
    expect(result.firstProofCount).toBe(1);
    expect(result.todayProofCount).toBe(0);
    expect(result.noGoalCount).toBe(1);
    expect(result.members.find((m) => m.id === "first")).toMatchObject({
      todayProof: false,
      totalProofDays: 1,
      recentProofDays: 1,
      lastProofDay: "2026-10-23",
      recentlyJoined: true,
    });
    expect(result.members.some((m) => m.id === "host" || m.id === "invited")).toBe(false);
  });

  it("keeps unrecorded membership and missing join timestamps explicit", () => {
    const result = buildCreatorSnapshot(input);
    const member = result.members.find((m) => m.id === "second");
    expect(member).toMatchObject({
      joinedAt: null,
      hasGoals: false,
      lastProofDay: null,
      recentProofDays: 0,
      recentlyJoined: false,
    });
  });
});
