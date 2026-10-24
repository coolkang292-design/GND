import { foldPeriodStats, type ChallengeParticipantProfile, type PeriodSessionRow } from "@/lib/challenge";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { Challenge, UserGoal } from "@/lib/types";

export type CreatorParticipant = {
  user_id: string;
  role: "host" | "member";
  status: string;
  joined_at: string | null;
};

export type CreatorMember = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  hasGoals: boolean;
  lastProofDay: string | null;
  todayProof: boolean;
  recentProofDays: number;
  totalProofDays: number;
  recentlyJoined: boolean;
};

export type CreatorSnapshot = {
  /** "Today" is inside an active period. Otherwise today's proof is not a
   *  meaningful question (setup: no sessions yet; ended: today is after the end). */
  todayTracked: boolean;
  memberCount: number;
  firstProofCount: number;
  todayProofCount: number;
  noGoalCount: number;
  members: CreatorMember[];
};

function dateOffset(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Never count the host as a recruited member. Use the same canonical period
 * session fold as the challenge screen, not a second definition of proof.
 * "No record today" is NOT a claim of missed obligations (rest days vary).
 */
export function buildCreatorSnapshot(input: {
  participants: readonly CreatorParticipant[];
  profiles: readonly ChallengeParticipantProfile[];
  goals: readonly UserGoal[];
  sessions: readonly PeriodSessionRow[];
  startDate: string;
  endDate: string;
  todayKey: string;
  status: Challenge["status"];
}): CreatorSnapshot {
  const end = input.todayKey < input.endDate ? input.todayKey : input.endDate;
  const todayTracked =
    input.status === "active" && input.startDate <= input.todayKey && input.todayKey <= input.endDate;
  const stats = foldPeriodStats([...input.sessions], input.startDate, end, DEFAULT_TIMEZONE);
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const goalsSet = new Set(input.goals.map((g) => g.user_id));
  // Proof activity is measured back from the last counted day; joins from today.
  const recentProofStart = dateOffset(end, -6);
  const recentJoinStart = dateOffset(input.todayKey, -6);
  const members: CreatorMember[] = input.participants
    .filter((p) => p.role !== "host" && p.status === "joined")
    .map((p) => {
      const profile = profileById.get(p.user_id);
      const keys = (stats.get(p.user_id)?.workoutDayKeys ?? []).filter((key) => key <= input.todayKey);
      const joinedKey = p.joined_at ? dayKey(new Date(p.joined_at), DEFAULT_TIMEZONE) : null;
      return {
        id: p.user_id,
        nickname: profile?.nickname ?? "참가자",
        avatarUrl: profile?.avatar_url ?? null,
        joinedAt: joinedKey,
        hasGoals: goalsSet.has(p.user_id),
        lastProofDay: keys.at(-1) ?? null,
        todayProof: todayTracked && keys.includes(input.todayKey),
        recentProofDays: keys.filter((key) => key >= recentProofStart).length,
        totalProofDays: keys.length,
        recentlyJoined: joinedKey !== null && joinedKey >= recentJoinStart && joinedKey <= input.todayKey,
      };
    })
    .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));
  return {
    todayTracked,
    memberCount: members.length,
    firstProofCount: members.filter((m) => m.totalProofDays > 0).length,
    todayProofCount: members.filter((m) => m.todayProof).length,
    noGoalCount: members.filter((m) => !m.hasGoals).length,
    members,
  };
}
