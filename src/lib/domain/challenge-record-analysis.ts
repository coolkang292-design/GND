import {
  goalLabel,
  myScoreTrend,
  type PeriodSessionRow,
} from "@/lib/challenge";
import {
  bestRecords,
  dailyBars,
  dailyTotals,
  weeklyAchievement,
  type BestRecords,
  type DailyBar,
  type PlanInput,
  type WeekAchievement,
} from "@/lib/domain/challenge-report";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import { goalRate, type ParticipantInput, type RankedParticipant } from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";

/** Shared data assembly for the ended result and the live, personal-only analysis. */
export type MyGoalResult = {
  key: string;
  label: string;
  actual: number;
  target: number;
  unit: string;
  rate: number;
};

export type MyReport = {
  ranked: RankedParticipant | null;
  total: number;
  goals: MyGoalResult[];
  bars: DailyBar[];
  records: BestRecords;
  trend: { label: string; overall: number }[];
  weeks: WeekAchievement[];
};

/**
 * The caller owns access control. Live mode never produces overall-score trend
 * data and its end date MUST be capped at today. Both modes share identical
 * session/goal and week calculation functions.
 */
export function buildMyRecordReport(input: {
  userId: string;
  participant: ParticipantInput;
  goals: readonly UserGoal[];
  rows: readonly PeriodSessionRow[];
  plans: readonly PlanInput[];
  startDate: string;
  endDate: string;
  /** The challenge's real last day. Live callers cap `endDate` at today, but
   *  weekly targets must still come from full weeks (5/7, not 3/3 on day 3). */
  periodEndDate?: string;
  timeZone: string;
  finalized: boolean;
  ranked?: RankedParticipant | null;
  total?: number;
}): MyReport {
  const { userId, participant, goals, rows, plans, startDate, endDate, timeZone, finalized } = input;
  const periodEndDate = input.periodEndDate ?? endDate;
  const personalGoals = goals.filter((g) => g.user_id === userId);
  const personalRows = rows.filter((s) => s.userId === userId);
  const days = dailyTotals(personalRows, startDate, endDate, timeZone);

  return {
    ranked: finalized ? (input.ranked ?? null) : null,
    total: finalized ? (input.total ?? 0) : 0,
    goals: personalGoals.map((g) => {
      const actual = participant.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
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
    bars: dailyBars(days, plans, startDate, endDate),
    records: bestRecords(days),
    // During a live challenge, the final overall score is private even to its owner.
    trend: finalized
      ? myScoreTrend({
          rows, userId, goals: personalGoals,
          startDate, endDate, timeZone,
        })
      : [],
    // Weeks that have started by endDate, each with its full-period target.
    weeks: weeklyAchievement(
      [...days.keys()], startDate, periodEndDate, personalGoals[0]?.planned_days ?? 5,
    ).slice(0, Math.ceil(Math.max(0, inclusiveDays(startDate, endDate)) / 7)),
  };
}
