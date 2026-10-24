import {
  foldPeriodStats,
  type ChallengeActivityItem,
  type ChallengeParticipantProfile,
  type PeriodSessionRow,
} from "@/lib/challenge";
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

const MEMBER_FILTERS = ["all", "attention", "no-proof", "no-goal", "new"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/** `?filter=` from the 운영 홈 to-do rows. Unknown values fall back to all. */
export function parseMemberFilter(raw: string | string[] | undefined): MemberFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (MEMBER_FILTERS as readonly string[]).includes(v ?? "") ? (v as MemberFilter) : "all";
}

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

export type CreatorActivity = {
  kind: "join" | "proof";
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  /** ISO timestamp. */
  at: string;
  hasPhoto: boolean;
  sessionId: string | null;
};

/**
 * 운영 홈 "최근 활동" (시안 4). Joins come from `challenge_participants`,
 * proofs from `get_challenge_activity` (active challenges only). The host's own
 * sessions and in-progress workouts are not shown. Link clicks are not measured
 * (P1), so there is no such row.
 */
export function buildRecentActivity(input: {
  participants: readonly CreatorParticipant[];
  profiles: readonly ChallengeParticipantProfile[];
  activity: readonly ChallengeActivityItem[];
  limit: number;
}): CreatorActivity[] {
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const members = input.participants.filter((p) => p.role !== "host" && p.status === "joined");
  const memberIds = new Set(members.map((p) => p.user_id));
  const joins: CreatorActivity[] = members
    .filter((p) => p.joined_at)
    .map((p) => ({
      kind: "join",
      userId: p.user_id,
      nickname: profileById.get(p.user_id)?.nickname ?? "참가자",
      avatarUrl: profileById.get(p.user_id)?.avatar_url ?? null,
      at: p.joined_at as string,
      hasPhoto: false,
      sessionId: null,
    }));
  const proofs: CreatorActivity[] = input.activity
    .filter((a) => a.status === "completed" && a.completed_at && memberIds.has(a.user_id))
    .map((a) => ({
      kind: "proof",
      userId: a.user_id,
      nickname: a.nickname ?? profileById.get(a.user_id)?.nickname ?? "참가자",
      avatarUrl: a.avatar_url ?? profileById.get(a.user_id)?.avatar_url ?? null,
      at: a.completed_at as string,
      hasPhoto: a.has_photo,
      sessionId: a.session_id,
    }));
  return [...joins, ...proofs]
    // Parse, don't string-compare: Postgres sends `+00:00`, JS sends `Z`.
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, input.limit);
}
