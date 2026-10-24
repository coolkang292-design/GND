import { describe, expect, it } from "vitest";
import { buildCreatorSnapshot, buildRecentActivity, type CreatorParticipant } from "./creator-studio";
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
  status: "active" as const,
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

  // 사용자 결정 2026-10-24: "3일 이상 연속 운동 기록 없음"이 확인 필요다.
  // 오늘은 세지 않는다(아직 운동할 수 있다). 기준점은 마지막 인증 다음 날, 없으면 max(시작, 합류).
  describe("3 consecutive days without a workout", () => {
    const people: CreatorParticipant[] = [
      { user_id: "host", role: "host", status: "joined", joined_at: "2026-10-01T00:00:00Z" },
      { user_id: "quiet", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
      { user_id: "twoDays", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
      { user_id: "today", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
      { user_id: "newbie", role: "member", status: "joined", joined_at: "2026-10-22T03:00:00Z" },
      { user_id: "noGoal", role: "member", status: "joined", joined_at: "2026-10-02T03:00:00Z" },
    ];
    const rows: PeriodSessionRow[] = [
      { userId: "quiet", completedAt: "2026-10-20T03:00:00Z", exercises: [] },
      { userId: "twoDays", completedAt: "2026-10-21T03:00:00Z", exercises: [] },
      { userId: "today", completedAt: "2026-10-18T03:00:00Z", exercises: [] },
      { userId: "today", completedAt: "2026-10-24T03:00:00Z", exercises: [] },
    ];
    const goals = ["quiet", "twoDays", "today", "newbie"].map((id) => ({ user_id: id }) as UserGoal);
    const snap = buildCreatorSnapshot({
      ...input, participants: people, sessions: rows, goals, profiles: [],
    });
    const by = (id: string) => snap.members.find((m) => m.id === id)!;

    it("counts whole days since the last proof, excluding today", () => {
      expect(by("quiet").inactiveDays).toBe(3); // 21·22·23
      expect(by("twoDays").inactiveDays).toBe(2); // 22·23
      expect(by("today").inactiveDays).toBe(0); // worked out today
      expect(by("newbie").inactiveDays).toBe(2); // joined 22 → 22·23, not since start
    });

    it("labels each member with one badge, most actionable first", () => {
      expect(by("noGoal").badge).toBe("needs-goal");
      expect(by("today").badge).toBe("done-today");
      expect(by("quiet").badge).toBe("attention");
      expect(by("newbie").badge).toBe("new");
      expect(by("twoDays").badge).toBe("active");
      expect(snap.attentionCount).toBe(1);
      expect(snap.recentJoinCount).toBe(1);
      expect(snap.yesterdayProofCount).toBe(0);
    });

    it("never flags inactivity outside an active period", () => {
      const ended = buildCreatorSnapshot({
        ...input, participants: people, sessions: rows, goals, profiles: [],
        status: "ended", endDate: "2026-10-23", todayKey: "2026-10-30",
      });
      expect(ended.attentionCount).toBe(0);
      expect(ended.members.every((m) => m.inactiveDays === 0 && m.badge === null)).toBe(true);
      expect(ended.yesterdayProofCount).toBeNull();

      const setup = buildCreatorSnapshot({
        ...input, participants: people, sessions: [], goals, profiles: [], status: "setup",
      });
      expect(setup.members.find((m) => m.id === "quiet")?.badge).toBe("ready");
      expect(setup.members.find((m) => m.id === "noGoal")?.badge).toBe("needs-goal");
    });
  });

  // 운영 홈 "최근 활동" (시안 4) — 합류와 완료된 인증만, 방장 제외, 최신순.
  it("merges joins and completed proofs into one recent feed", () => {
    const feed = buildRecentActivity({
      participants,
      profiles: input.profiles,
      activity: [
        { session_id: "s1", user_id: "first", nickname: "First", avatar_url: null, status: "completed",
          title: "하체", workout_type: null, started_at: null, completed_at: "2026-10-23T05:00:00Z",
          has_photo: true, cheer_count: 0, my_cheers: 0, is_mine: false },
        { session_id: "s2", user_id: "host", nickname: "Host", avatar_url: null, status: "completed",
          title: null, workout_type: null, started_at: null, completed_at: "2026-10-24T05:00:00Z",
          has_photo: false, cheer_count: 0, my_cheers: 0, is_mine: true },
        { session_id: "s3", user_id: "first", nickname: "First", avatar_url: null, status: "active",
          title: null, workout_type: null, started_at: "2026-10-24T06:00:00Z", completed_at: null,
          has_photo: false, cheer_count: 0, my_cheers: 0, is_mine: false },
      ],
      limit: 5,
    });
    expect(feed.map((f) => `${f.kind}:${f.userId}`)).toEqual(["proof:first", "join:first"]);
    expect(feed[0]).toMatchObject({ nickname: "First", hasPhoto: true, sessionId: "s1" });

    expect(buildRecentActivity({ participants, profiles: input.profiles, activity: [], limit: 1 }))
      .toHaveLength(1);
  });

  // 종료·모집 중에는 "오늘"이 기간 밖이라 전원이 "오늘 기록 없음"으로 잡혔다.
  it("does not track today's proof outside an active period", () => {
    const active = buildCreatorSnapshot({ ...input, status: "active" });
    expect(active.todayTracked).toBe(true);

    const setup = buildCreatorSnapshot({ ...input, sessions: [], status: "setup" });
    expect(setup.todayTracked).toBe(false);

    const ended = buildCreatorSnapshot({
      ...input, status: "ended", endDate: "2026-10-23", todayKey: "2026-10-30",
    });
    expect(ended.todayTracked).toBe(false);
    // 최근 7일은 오늘이 아니라 기간 마지막 날 기준이다 (10-17~10-23 안의 10-23)
    expect(ended.members.find((m) => m.id === "first")).toMatchObject({
      recentProofDays: 1,
      lastProofDay: "2026-10-23",
    });
  });
});
