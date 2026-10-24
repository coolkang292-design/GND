import {
  buildParticipantInput,
  foldPeriodStats,
  goalLabel,
  type ChallengeActivityItem,
  type ChallengeParticipantProfile,
  type PeriodSessionRow,
} from "@/lib/challenge";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import { buildCreatorSnapshot, type CreatorMember, type CreatorParticipant } from "@/lib/domain/creator-studio";
import { goalRate } from "@/lib/domain/goal-score";
import { currentStreak, daysSinceLastWorkout } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { Challenge, UserGoal } from "@/lib/types";

export type CreatorGoalProgress = {
  key: string;
  label: string;
  actual: number;
  target: number;
  unit: string;
  rate: number;
};

export type CreatorMemberDetail = {
  member: CreatorMember;
  /** Counted proof days, up to today (or the end date). */
  dayKeys: string[];
  totalProofDays: number;
  /** The app's own streak rule (`streak.ts`) — the member sees the same number. */
  streak: number;
  daysSinceLast: number | null;
  /** Challenge week the reference day falls in; null before the start. */
  week: number | null;
  goals: CreatorGoalProgress[];
  /** In-progress workout to cheer. `send_cheer` rejects completed sessions
   *  (`not_active`), so there is nothing to cheer otherwise. */
  liveSessionId: string | null;
  recent: { sessionId: string; at: string; title: string | null; hasPhoto: boolean; cheerCount: number }[];
};

function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/**
 * 참여자 상세 (시안 2). Returns null unless `userId` is a joined, non-host
 * participant of this challenge — the page turns that into 404, so a host can't
 * read another room's member through this screen.
 *
 * Goal actuals go through `buildParticipantInput` — the same numbers as the
 * member's own "내 목표 진행률". Do not add a second calculation.
 */
export function buildCreatorMemberDetail(input: {
  userId: string;
  participants: readonly CreatorParticipant[];
  profiles: readonly ChallengeParticipantProfile[];
  goals: readonly UserGoal[];
  sessions: readonly PeriodSessionRow[];
  activity: readonly ChallengeActivityItem[];
  startDate: string;
  endDate: string;
  todayKey: string;
  status: Challenge["status"];
}): CreatorMemberDetail | null {
  const snapshot = buildCreatorSnapshot({ ...input });
  const member = snapshot.members.find((m) => m.id === input.userId);
  if (!member) return null;

  const ref = input.todayKey < input.endDate ? input.todayKey : input.endDate;
  const stats = foldPeriodStats([...input.sessions], input.startDate, ref, DEFAULT_TIMEZONE);
  const mine = stats.get(input.userId);
  const dayKeys = (mine?.workoutDayKeys ?? []).filter((k) => k <= ref);
  const myGoals = input.goals.filter((g) => g.user_id === input.userId);
  const participant = mine
    ? buildParticipantInput({
        userId: input.userId,
        goals: myGoals,
        stats: mine,
        periodDays: inclusiveDays(input.startDate, input.endDate),
      })
    : null;

  return {
    member,
    dayKeys,
    totalProofDays: dayKeys.length,
    streak: input.status === "setup" ? 0 : currentStreak(dayKeys, ref),
    daysSinceLast: daysSinceLastWorkout(dayKeys, ref),
    week: ref >= input.startDate ? Math.floor(daysBetween(input.startDate, ref) / 7) + 1 : null,
    goals: myGoals.map((g) => {
      const actual = participant?.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
      const target = Number(g.target_value);
      return {
        key: g.id,
        label: goalLabel(g.goal_type, g.qualifier),
        actual,
        target,
        unit: g.unit ?? "",
        rate: goalRate(target, actual),
      };
    }),
    liveSessionId:
      input.status === "active"
        ? input.activity.find((a) => a.user_id === input.userId && a.status === "active")?.session_id ?? null
        : null,
    recent: input.activity
      .filter((a) => a.user_id === input.userId && a.status === "completed" && a.completed_at)
      .sort((a, b) => Date.parse(b.completed_at as string) - Date.parse(a.completed_at as string))
      .slice(0, 5)
      .map((a) => ({
        sessionId: a.session_id,
        at: a.completed_at as string,
        title: a.title,
        hasPhoto: a.has_photo,
        cheerCount: a.cheer_count,
      })),
  };
}

/** Sunday-first month grid: leading `null`s, then every day key, padded to full weeks. */
export function monthCells(monthKey: string): (string | null)[] {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
