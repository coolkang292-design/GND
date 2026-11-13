import {
  actualForGoal, buildParticipantInput, EMPTY_STATS, foldPeriodStats,
  GOAL_TYPE_META, goalLabel,
  type FinishedDraftExercise, type MyChallenge, type PeriodSessionRow,
} from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { inclusiveDays } from "./challenge-time";
import { rankForChallenge, type RankedEntry } from "./challenge-ranking";
import type { GoalType } from "./goal-score";
import { tieKindLabel, toCents } from "./goal-score-v2";
import { withoutIntervalBlock } from "./tabata";
import { dayKey } from "./time";

export type ChallengeScoreSnapshot = {
  challenge: MyChallenge;
  goals: UserGoal[];
  participantIds: string[];
  /** Server-authorized rows only: excluded/missing photo proof is never synthesized here. */
  rows: PeriodSessionRow[];
  timeZone: string;
};
export type WorkoutImpact = {
  beforeScore: number;
  afterScore: number;
  delta: number;
  beforeRank: number;
  afterRank: number;
  goalChanges: { type: GoalType; label: string; unit: string; before: number; after: number; delta: number; target: number }[];
  reason: string | null;
  tieReason: string | null;
};
export type WorkoutForecast = Pick<WorkoutImpact, "beforeScore" | "afterScore" | "delta" | "reason">;
export type WorkoutSuggestion = {
  id: string;
  label: string;
  extraPoints: number;
  afterScore: number;
  /** Additional sets only. The caller merges them into the matching draft exercise. */
  exercise: FinishedDraftExercise;
};

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nonNegative = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
function goalsFor(snapshot: ChallengeScoreSnapshot, userId: string): UserGoal[] {
  return snapshot.goals.filter((g) => g.user_id === userId && g.challenge_id === snapshot.challenge.id);
}
function enabled(snapshot: ChallengeScoreSnapshot, userId: string): boolean {
  const ch = snapshot.challenge;
  return ch.status === "active" && ch.myStatus === "joined" && ch.live_ranking === true
    && snapshot.participantIds.includes(userId) && goalsFor(snapshot, userId).some((g) => Number(g.target_value) > 0);
}
function inPeriod(snapshot: ChallengeScoreSnapshot, row: PeriodSessionRow): boolean {
  if (!Number.isFinite(new Date(row.completedAt).getTime())) return false;
  const key = dayKey(new Date(row.completedAt), snapshot.timeZone);
  return key >= snapshot.challenge.start_date && key <= snapshot.challenge.end_date;
}

/** Ranking, base points, completion bonuses and same-day qualifiers all keep their existing owners. */
function evaluate(snapshot: ChallengeScoreSnapshot, rows: PeriodSessionRow[], userId: string) {
  const ch = snapshot.challenge;
  const stats = foldPeriodStats(rows, ch.start_date, ch.end_date, snapshot.timeZone);
  const ranking = rankForChallenge({
    scoringVersion: ch.scoring_version,
    inputs: [...new Set(snapshot.participantIds)].map((id) => buildParticipantInput({
      userId: id, goals: goalsFor(snapshot, id), stats: stats.get(id) ?? EMPTY_STATS,
      periodDays: inclusiveDays(ch.start_date, ch.end_date),
    })),
    rows, startDate: ch.start_date, endDate: ch.end_date, timeZone: snapshot.timeZone,
  });
  return { entry: ranking.find((r) => r.userId === userId)!, stats: stats.get(userId) ?? EMPTY_STATS };
}
function cents(entry: RankedEntry): number {
  return entry.v2?.breakdown.baseScoreCents ?? toCents(entry.overall);
}
function compareRows(snapshot: ChallengeScoreSnapshot, userId: string, beforeRows: PeriodSessionRow[], afterRows: PeriodSessionRow[]): WorkoutImpact {
  const before = evaluate(snapshot, beforeRows, userId);
  const after = evaluate(snapshot, afterRows, userId);
  const delta = (cents(after.entry) - cents(before.entry)) / 100;
  const goalChanges = goalsFor(snapshot, userId).map((g) => {
    const a = actualForGoal(before.stats, g.goal_type, g.qualifier);
    const b = actualForGoal(after.stats, g.goal_type, g.qualifier);
    return { type: g.goal_type, label: goalLabel(g.goal_type, g.qualifier), unit: GOAL_TYPE_META[g.goal_type].unit,
      before: a, after: b, delta: round(b - a), target: Number(g.target_value) };
  });
  let reason: string | null = null;
  if (delta === 0) {
    reason = goalChanges.every((g) => g.before >= g.target)
      ? "목표를 이미 채워 기본 점수는 더 오르지 않아요."
      : goalChanges.some((g) => g.delta > 0)
        ? "기록은 쌓였지만 목표 상한·소수 둘째 자리 반올림으로 기본 점수는 같아요."
        : "같은 날 운동일은 한 번만 세며, 설정 목표의 추가 실적은 없어요.";
  }
  const tieChanged = before.entry.rank !== after.entry.rank
    || before.entry.v2?.tieBonusUnits !== after.entry.v2?.tieBonusUnits;
  const tieReason = delta === 0 && tieChanged
    ? `${after.entry.v2 ? (tieKindLabel(after.entry.v2) ?? "동점 기준") : "동점 기준"}에 따라 순위를 다시 비교했어요.`
    : null;
  return { beforeScore: cents(before.entry) / 100, afterScore: cents(after.entry) / 100, delta,
    beforeRank: before.entry.rank, afterRank: after.entry.rank, goalChanges, reason, tieReason };
}

/** Current records with/without this workout, not a historical snapshot of the prior leaderboard. */
export function calculateWorkoutImpact(snapshot: ChallengeScoreSnapshot, userId: string, sessionId: string): WorkoutImpact | null {
  if (!enabled(snapshot, userId) || !sessionId) return null;
  const target = snapshot.rows.find((r) => r.sessionId === sessionId);
  if (!target || target.userId !== userId || !inPeriod(snapshot, target)) return null;
  return compareRows(snapshot, userId, snapshot.rows.filter((r) => r.sessionId !== sessionId), snapshot.rows);
}

function completeExercises(exercises: PeriodSessionRow["exercises"]): PeriodSessionRow["exercises"] {
  return exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({
    weightKg: nonNegative(s.weightKg), reps: nonNegative(s.reps), distanceMeters: nonNegative(s.distanceMeters),
    durationSeconds: nonNegative(s.durationSeconds), isCompleted: true,
  })).filter((s) => s.reps > 0 || s.distanceMeters > 0 || s.durationSeconds > 0) }))
    .filter((ex) => ex.sets.length > 0);
}
/** A plan is a new hypothetical workout even if its id matches a persisted session. */
function completedPlan(snapshot: ChallengeScoreSnapshot, userId: string, plan: PeriodSessionRow): PeriodSessionRow | null {
  if (!enabled(snapshot, userId) || plan.userId !== userId || !inPeriod(snapshot, plan)) return null;
  const exercises = completeExercises(plan.exercises);
  const tabataMinutes = nonNegative(plan.tabataMinutes);
  if (!exercises.length && !tabataMinutes) return null;
  return { ...plan, sessionId: undefined, exercises, tabataMinutes,
    durationMinutes: plan.durationMinutes == null ? null : nonNegative(plan.durationMinutes) };
}

export function forecastWorkout(snapshot: ChallengeScoreSnapshot, userId: string, plan: PeriodSessionRow): WorkoutForecast | null {
  const completed = completedPlan(snapshot, userId, plan);
  if (!completed) return null;
  const { beforeScore, afterScore, delta, reason } = compareRows(snapshot, userId, snapshot.rows, [...snapshot.rows, completed]);
  return { beforeScore, afterScore, delta, reason };
}

type ExerciseRow = PeriodSessionRow["exercises"][number];
type Dose = { field: "reps" | "durationMin" | "distanceKm"; max: number; step: number; weightKg: number; unit: string };
function doses(ex: ExerciseRow): Dose[] {
  const sets = ex.sets.filter((s) => s.isCompleted);
  const result: Dose[] = [];
  const repSet = sets.filter((s) => nonNegative(s.reps) > 0).sort((a, b) => nonNegative(b.reps) - nonNegative(a.reps))[0];
  if (repSet && ex.exerciseType !== "cardio") result.push({ field: "reps", max: Math.min(10, Math.floor(nonNegative(repSet.reps))), step: 1, weightKg: nonNegative(repSet.weightKg), unit: "회" });
  const minutes = sets.reduce((sum, s) => sum + nonNegative(s.durationSeconds) / 60, 0);
  if (minutes > 0) result.push({ field: "durationMin", max: Math.min(10, Math.max(1, minutes * 0.25)), step: 0.1, weightKg: 0, unit: "분" });
  const km = sets.reduce((sum, s) => sum + nonNegative(s.distanceMeters) / 1000, 0);
  if (km > 0 && ex.exerciseType === "cardio") result.push({ field: "distanceKm", max: Math.min(1, km * 0.25), step: 0.01, weightKg: 0, unit: "km" });
  return result;
}
function addition(ex: ExerciseRow, dose: Dose, amount: number): FinishedDraftExercise {
  return { name: ex.exerciseName, bodyPart: ex.bodyPart, exerciseType: ex.exerciseType,
    sets: [{ weightKg: dose.weightKg, reps: 0, durationMin: 0, distanceKm: 0, [dose.field]: amount, done: true }] };
}
function mergeAddition(plan: PeriodSessionRow, extra: FinishedDraftExercise): PeriodSessionRow {
  const added: ExerciseRow = { exerciseName: extra.name, bodyPart: extra.bodyPart, exerciseType: extra.exerciseType,
    sets: extra.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, durationSeconds: s.durationMin * 60, distanceMeters: s.distanceKm * 1000, isCompleted: true })) };
  const same = (ex: ExerciseRow) => ex.exerciseName === added.exerciseName && ex.exerciseType === added.exerciseType;
  const firstMatch = plan.exercises.findIndex(same);
  return { ...plan, exercises: firstMatch >= 0
    ? plan.exercises.map((ex, index) => index === firstMatch ? { ...ex, sets: [...ex.sets, ...added.sets] } : ex)
    : [...plan.exercises, added] };
}

/** Deterministic, bounded additions from exercises already planned or familiar to this user. */
export function recommendWorkoutAdditions(snapshot: ChallengeScoreSnapshot, userId: string, plan: PeriodSessionRow): WorkoutSuggestion[] {
  const completed = completedPlan(snapshot, userId, plan);
  if (!completed) return [];
  const base = cents(evaluate(snapshot, [...snapshot.rows, completed], userId).entry);
  const seen = new Set<string>();
  const recent = snapshot.rows.filter((r) => r.userId === userId && inPeriod(snapshot, r)
    && new Date(r.completedAt).getTime() <= new Date(plan.completedAt).getTime())
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  // Preserve original positions: filtering zero-value sets first can shift a follow-up into the interval block.
  const candidates = [
    ...completeExercises(withoutIntervalBlock(plan.tabataMinutes, plan.exercises)),
    ...recent.flatMap((r) => withoutIntervalBlock(r.tabataMinutes, r.exercises)),
  ];
  const suggestions: WorkoutSuggestion[] = [];
  for (const ex of candidates) {
    const key = `${ex.exerciseType}:${ex.exerciseName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let best: WorkoutSuggestion | null = null;
    for (const dose of doses(ex)) {
      const maxUnits = Math.floor((dose.max + 1e-9) / dose.step);
      if (maxUnits < 1) continue;
      const scoreAt = (units: number) => cents(evaluate(snapshot,
        [...snapshot.rows, mergeAddition(completed, addition(ex, dose, round(units * dose.step)))], userId).entry);
      const top = scoreAt(maxUnits);
      if (top <= base) continue;
      // Select the smallest dose reaching the same rounded score/goal bonus as the capped addition.
      let low = 1, high = maxUnits;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (scoreAt(middle) >= top) high = middle;
        else low = middle + 1;
      }
      const amount = round(low * dose.step);
      const candidate = { id: `${key}:${dose.field}`, label: `${ex.exerciseName} ${amount}${dose.unit} 추가`,
        extraPoints: (top - base) / 100, afterScore: top / 100, exercise: addition(ex, dose, amount) };
      if (!best || candidate.extraPoints > best.extraPoints) best = candidate;
    }
    if (best) suggestions.push(best);
    if (suggestions.length === 2) break;
  }
  return suggestions;
}
