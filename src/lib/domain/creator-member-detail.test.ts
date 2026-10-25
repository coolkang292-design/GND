import { describe, expect, it } from "vitest";
import type { ChallengeActivityItem, PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { buildCreatorMemberDetail } from "./creator-member-detail";
import type { CreatorParticipant } from "./creator-studio";

const participants: CreatorParticipant[] = [
  { user_id: "host", role: "host", status: "joined", joined_at: "2026-10-01T00:00:00Z" },
  { user_id: "m", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
  { user_id: "gone", role: "member", status: "dropped", joined_at: "2026-10-02T03:00:00Z" },
];
const sessions: PeriodSessionRow[] = [
  { userId: "m", completedAt: "2026-10-06T03:00:00Z", exercises: [] },
  { userId: "m", completedAt: "2026-10-08T03:00:00Z", exercises: [] },
  { userId: "m", completedAt: "2026-10-10T03:00:00Z", exercises: [] },
  { userId: "m", completedAt: "2026-10-30T03:00:00Z", exercises: [] }, // 미래 — 세지 않는다
];
const goals = [
  { id: "g1", user_id: "m", goal_type: "workout_days", target_value: 12, unit: "일", planned_days: 3, qualifier: null },
  { id: "g2", user_id: "other", goal_type: "workout_days", target_value: 5, unit: "일", planned_days: 3, qualifier: null },
] as UserGoal[];
const item = (over: Partial<ChallengeActivityItem>): ChallengeActivityItem => ({
  session_id: "s", user_id: "m", nickname: "M", avatar_url: null, status: "completed", title: null,
  workout_type: null, started_at: null, completed_at: "2026-10-10T03:00:00Z", has_photo: false,
  cheer_count: 0, my_cheers: 0, is_mine: false, ...over,
});
const input = {
  userId: "m",
  participants,
  profiles: [{ id: "m", nickname: "민수", avatar_url: null }],
  goals,
  sessions,
  activity: [
    item({ session_id: "done", completed_at: "2026-10-10T03:00:00Z", has_photo: true, title: "하체" }),
    item({ session_id: "live", status: "active", completed_at: null, started_at: "2026-10-12T03:00:00Z" }),
    item({ session_id: "theirs", user_id: "other" }),
  ],
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  todayKey: "2026-10-12",
  status: "active" as const,
};

describe("Creator Studio member detail (mockup 2)", () => {
  it("is only for joined, non-host participants of this challenge", () => {
    expect(buildCreatorMemberDetail({ ...input, userId: "host" })).toBeNull();
    expect(buildCreatorMemberDetail({ ...input, userId: "gone" })).toBeNull();
    expect(buildCreatorMemberDetail({ ...input, userId: "stranger" })).toBeNull();
  });

  it("summarizes proofs up to today with the app's streak rule", () => {
    const d = buildCreatorMemberDetail(input)!;
    expect(d.dayKeys).toEqual(["2026-10-06", "2026-10-08", "2026-10-10"]);
    expect(d.totalProofDays).toBe(3);
    expect(d.streak).toBe(3); // 간격 5일 미만이면 사슬이 이어진다 (streak.ts)
    expect(d.daysSinceLast).toBe(2);
    expect(d.week).toBe(2); // 10/1 시작 → 10/12는 2주차
    // 달력 도장(운동 내용)과 운동일 수가 같은 날들을 가리킨다 — 미래 10/30은 없다
    expect(d.workoutDays.map((w) => w.dayKey)).toEqual(d.dayKeys);
    expect(d.workoutSummary.days).toBe(3);
  });

  it("uses the member's own goals and the shared actual calculation", () => {
    const d = buildCreatorMemberDetail(input)!;
    expect(d.goals).toHaveLength(1);
    expect(d.goals[0]).toMatchObject({ key: "g1", actual: 3, target: 12 });
    expect(d.goals[0].rate).toBeCloseTo(0.25);
  });

  // send_cheer는 진행 중(운동 중) 세션만 받는다 — 완료 세션은 not_active.
  it("offers a cheer only for a workout in progress", () => {
    expect(buildCreatorMemberDetail(input)!.liveSessionId).toBe("live");
    const noLive = buildCreatorMemberDetail({ ...input, activity: input.activity.filter((a) => a.status !== "active") })!;
    expect(noLive.liveSessionId).toBeNull();
    const ended = buildCreatorMemberDetail({ ...input, status: "ended" })!;
    expect(ended.liveSessionId).toBeNull();
  });

  it("lists only this member's completed proofs", () => {
    const d = buildCreatorMemberDetail(input)!;
    expect(d.recent.map((r) => r.sessionId)).toEqual(["done"]);
    expect(d.recent[0]).toMatchObject({ title: "하체", hasPhoto: true });
  });
});
