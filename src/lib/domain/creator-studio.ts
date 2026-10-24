import { foldPeriodStats, type ChallengeParticipantProfile, type PeriodSessionRow } from "@/lib/challenge";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { Challenge, UserGoal } from "@/lib/types";

export type CreatorParticipant = {
  user_id: string;
  role: "host" | "member";
  status: string;
  joined_at: string | null;
};

/**
 * One badge per member, most actionable first. `null` after the challenge ends —
 * the result screen takes over there.
 * setup: needs-goal | ready. active: needs-goal > done-today > attention > new > active.
 */
export type CreatorBadge = "needs-goal" | "ready" | "done-today" | "attention" | "new" | "active";

/** 사용자 결정 2026-10-24 — "3일 이상 연속 운동 기록 없음"이 확인 필요다. */
export const ATTENTION_INACTIVE_DAYS = 3;

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
  /** Whole days without a proof, counted back from yesterday (today can still
   *  change). 0 outside an active period. Rest days are unknown to the host. */
  inactiveDays: number;
  badge: CreatorBadge | null;
};

export type CreatorSnapshot = {
  /** "Today" is inside an active period. Otherwise today's proof is not a
   *  meaningful question (setup: no sessions yet; ended: today is after the end). */
  todayTracked: boolean;
  memberCount: number;
  firstProofCount: number;
  todayProofCount: number;
  /** For the "vs yesterday" delta; null when yesterday was not a tracked day. */
  yesterdayProofCount: number | null;
  noGoalCount: number;
  attentionCount: number;
  recentJoinCount: number;
  members: CreatorMember[];
};

export function challengeStatusLabel(status: Challenge["status"]): string {
  return status === "setup" ? "모집 준비" : status === "active" ? "진행 중" : status === "ended" ? "종료" : "취소";
}

function dateOffset(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
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
  const yesterday = dateOffset(input.todayKey, -1);
  const stats = foldPeriodStats([...input.sessions], input.startDate, end, DEFAULT_TIMEZONE);
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const goalsSet = new Set(input.goals.map((g) => g.user_id));
  // Proof activity is measured back from the last counted day; joins from today.
  const recentProofStart = dateOffset(end, -6);
  const recentJoinStart = dateOffset(input.todayKey, -6);
  // `keys` rides along for the yesterday count and is dropped before returning.
  const members: (CreatorMember & { keys: string[] })[] = input.participants
    .filter((p) => p.role !== "host" && p.status === "joined")
    .map((p) => {
      const profile = profileById.get(p.user_id);
      const keys = (stats.get(p.user_id)?.workoutDayKeys ?? []).filter((key) => key <= input.todayKey);
      const joinedKey = p.joined_at ? dayKey(new Date(p.joined_at), DEFAULT_TIMEZONE) : null;
      const hasGoals = goalsSet.has(p.user_id);
      const todayProof = todayTracked && keys.includes(input.todayKey);
      const recentlyJoined = joinedKey !== null && joinedKey >= recentJoinStart && joinedKey <= input.todayKey;

      let inactiveDays = 0;
      if (todayTracked && !todayProof) {
        const lastBeforeToday = keys.filter((key) => key < input.todayKey).at(-1);
        const counted = joinedKey && joinedKey > input.startDate ? joinedKey : input.startDate;
        const gapStart = lastBeforeToday ? dateOffset(lastBeforeToday, 1) : counted;
        inactiveDays = Math.max(0, daysBetween(gapStart, yesterday) + 1);
      }

      let badge: CreatorBadge | null = null;
      if (input.status === "setup") badge = hasGoals ? "ready" : "needs-goal";
      else if (todayTracked) {
        badge = !hasGoals ? "needs-goal"
          : todayProof ? "done-today"
          : inactiveDays >= ATTENTION_INACTIVE_DAYS ? "attention"
          : recentlyJoined ? "new"
          : "active";
      }

      return {
        id: p.user_id,
        nickname: profile?.nickname ?? "참가자",
        avatarUrl: profile?.avatar_url ?? null,
        joinedAt: joinedKey,
        hasGoals,
        lastProofDay: keys.at(-1) ?? null,
        todayProof,
        recentProofDays: keys.filter((key) => key >= recentProofStart).length,
        totalProofDays: keys.length,
        recentlyJoined,
        inactiveDays,
        badge,
        keys,
      };
    })
    .sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));

  const yesterdayTracked = todayTracked && yesterday >= input.startDate;
  return {
    todayTracked,
    memberCount: members.length,
    firstProofCount: members.filter((m) => m.totalProofDays > 0).length,
    todayProofCount: members.filter((m) => m.todayProof).length,
    yesterdayProofCount: yesterdayTracked ? members.filter((m) => m.keys.includes(yesterday)).length : null,
    noGoalCount: members.filter((m) => !m.hasGoals).length,
    attentionCount: members.filter((m) => m.badge === "attention").length,
    recentJoinCount: members.filter((m) => m.recentlyJoined).length,
    members: members.map(({ keys: _keys, ...m }) => m),
  };
}
