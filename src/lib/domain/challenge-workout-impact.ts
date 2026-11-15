import {
  actualForGoal, buildParticipantInput, EMPTY_STATS, foldPeriodStats,
  GOAL_TYPE_META, goalLabel,
  type FinishedDraftExercise, type MyChallenge, type PeriodSessionRow,
} from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { inclusiveDays } from "./challenge-time";
import { isScoringV2, rankForChallenge, type RankedEntry } from "./challenge-ranking";
import type { GoalType } from "./goal-score";
import {
  ACTIVITY_MINUTES_PER_POINT, ACTIVITY_POINT_PER_DAY, ACTIVITY_POINT_PER_SESSION, ACTIVITY_RULE_TEXT,
  TIE_BREAK_RULE_TEXT, tieKindLabel, toCents, type RankedParticipantV2,
} from "./goal-score-v2";
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
  /** 활동 점수(운동한 날·횟수·시간 환산) 변화 — v2가 아니면 0 */
  activityDelta: number;
  /** 총점(기본 + 활동) 전후 — v2가 아니면 기본 점수와 같다 */
  beforeTotal: number;
  afterTotal: number;
  totalDelta: number;
};
export type WorkoutForecast = Pick<WorkoutImpact, "beforeScore" | "afterScore" | "delta" | "reason" | "activityDelta" | "beforeTotal" | "afterTotal" | "totalDelta">;
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
  return { entry: ranking.find((r) => r.userId === userId)!, ranking, stats: stats.get(userId) ?? EMPTY_STATS };
}
function cents(entry: RankedEntry): number {
  return entry.v2?.breakdown.baseScoreCents ?? toCents(entry.overall);
}
/** 총점(기본 + 활동) — 순위의 기준. v2가 아니면 기본 점수와 같다 */
function totalCents(entry: RankedEntry): number {
  return entry.v2?.breakdown.totalScoreCents ?? cents(entry);
}
function activityCents(entry: RankedEntry): number {
  return entry.v2?.breakdown.activity.cents ?? 0;
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
  const activityDelta = (activityCents(after.entry) - activityCents(before.entry)) / 100;
  const totalDelta = (totalCents(after.entry) - totalCents(before.entry)) / 100;
  let reason: string | null = null;
  if (delta === 0) {
    reason = goalChanges.every((g) => g.before >= g.target)
      ? `목표를 이미 채워 기본 점수는 더 오르지 않아요.${activityDelta > 0 ? ` 대신 활동 점수가 +${activityDelta.toFixed(2)}점 올라요.` : ""}`
      : goalChanges.some((g) => g.delta > 0)
        ? "기록은 쌓였지만 목표 상한·소수 둘째 자리 반올림으로 기본 점수는 같아요."
        : "같은 날 운동일은 한 번만 세며, 설정 목표의 추가 실적은 없어요.";
  }
  // 동점 사유는 **실제로 총점이 같은 사람이 있을 때**만 — 활동 점수로 순위가 바뀐 것을 동점 탓으로 말하지 않는다
  const tieChanged = before.entry.rank !== after.entry.rank
    || before.entry.v2?.tieBonusUnits !== after.entry.v2?.tieBonusUnits;
  const tieReason = delta === 0 && tieChanged && (after.entry.v2?.tieBreak.kind ?? "none") !== "none"
    ? `${after.entry.v2 ? (tieKindLabel(after.entry.v2) ?? "동점 기준") : "동점 기준"}에 따라 순위를 다시 비교했어요.`
    : null;
  return { beforeScore: cents(before.entry) / 100, afterScore: cents(after.entry) / 100, delta,
    beforeRank: before.entry.rank, afterRank: after.entry.rank, goalChanges, reason, tieReason,
    activityDelta, beforeTotal: totalCents(before.entry) / 100, afterTotal: totalCents(after.entry) / 100, totalDelta };
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
  const { beforeScore, afterScore, delta, reason, activityDelta, beforeTotal, afterTotal, totalDelta } = compareRows(snapshot, userId, snapshot.rows, [...snapshot.rows, completed]);
  return { beforeScore, afterScore, delta, reason, activityDelta, beforeTotal, afterTotal, totalDelta };
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

/** 목표를 모두 채운 사람에게 — 점수는 더 안 오르니 "어떻게 우승하는지"를 알린다 */
export type WinGuidance = {
  /** 동점 규칙 한 줄 — `TIE_BREAK_RULE_TEXT`에서 온다 */
  rule: string;
  /** 지금(또는 계획을 마친 뒤) 내 위치 */
  standing: string;
  /** 해야 할 일. 할 일이 없으면 null */
  action: string | null;
};

type TieCriterion = "days" | "sessions" | "minutes";
const CRITERION_LABEL: Record<TieCriterion, string> = { days: "운동한 날 수", sessions: "운동 횟수", minutes: "운동 시간" };
const metricOf = (v: RankedParticipantV2, c: TieCriterion) =>
  c === "days" ? v.breakdown.workoutDays : c === "sessions" ? v.breakdown.workoutSessions : v.breakdown.workoutMinutes;
const unitText = (c: TieCriterion, n: number) => (c === "days" ? `${n}일` : c === "sessions" ? `${n}회` : `${n}분`);

/** 동점 규칙 순서(`compareTieBreakMetrics`와 같다)대로 처음 갈리는 기준. 다 같으면 null */
function firstDifference(a: RankedParticipantV2, b: RankedParticipantV2, useMinutes: boolean): TieCriterion | null {
  for (const c of ["days", "sessions", "minutes"] as const) {
    if (c === "minutes" && !useMinutes) continue;
    if (Math.abs(metricOf(a, c) - metricOf(b, c)) > 1e-9) return c;
  }
  return null;
}

/**
 * 목표를 **모두** 채우고 참여율도 100%라 **기본 점수가 더 오르지 않을 때**의 우승 안내.
 * 이제는 활동 점수(1일·1회·60분당 1점)가 총점을 계속 올린다 — 안내는 그 총점 경쟁을 말한다.
 *
 * ⚠️ 문구는 동점 규칙(`TIE_BREAK_RULE_TEXT`·`compareTieBreakMetrics`)과 환산 비율(`ACTIVITY_*` 상수)에서
 *    읽는다 — 숫자를 따로 적으면 규칙을 바꿀 때 안내만 거짓이 된다.
 * ⚠️ 실시간 랭킹이 켜진 v2 방에서만 낸다. 꺼진 방은 진행 중 순위가 비공개라 비교가 새어 나간다.
 * ⚠️ `plan`이 있으면 그 계획을 **마친 뒤**의 순위로 말한다(계획 카드). 없으면 지금 기록 기준(결과 카드).
 */
export function winGuidance(snapshot: ChallengeScoreSnapshot, userId: string, plan?: PeriodSessionRow): WinGuidance | null {
  if (!enabled(snapshot, userId) || !isScoringV2(snapshot.challenge.scoring_version)) return null;
  const completed = plan ? completedPlan(snapshot, userId, plan) : null;
  if (plan && !completed) return null;
  const now = evaluate(snapshot, completed ? [...snapshot.rows, completed] : snapshot.rows, userId);
  const me = now.entry.v2;
  if (!me) return null;
  const allDone = goalsFor(snapshot, userId).every((g) => {
    const target = Number(g.target_value);
    return target > 0 && actualForGoal(now.stats, g.goal_type, g.qualifier) >= target - 1e-9;
  });
  // 참여율이 남았으면 운동일을 더해 기본 점수가 오른다 — 그건 추가 점수 안내가 맡는다
  if (!allDone || me.breakdown.participationRate < 100 - 1e-9) return null;

  const prefix = completed ? "이 계획을 마치면 " : "지금 ";
  const rule = `총점은 기본 점수에 활동 점수(${ACTIVITY_RULE_TEXT})를 더해요. 총점이 같으면 ${TIE_BREAK_RULE_TEXT} 순서로 가려요.`;
  // 새로운 날에 60분 운동하면 / 같은 날 한 번 더 하면 — 환산 비율에서 계산한다
  const perHour = 60 / ACTIVITY_MINUTES_PER_POINT;
  const newDay = round(ACTIVITY_POINT_PER_DAY + ACTIVITY_POINT_PER_SESSION + perHour);
  const sameDay = round(ACTIVITY_POINT_PER_SESSION + perHour);
  const perWorkout = `새로운 날에 60분 운동하면 약 ${newDay}점, 같은 날 한 번 더 하면 약 ${sameDay}점이 쌓여요.`;

  // ① 총점이 정확히 같은 사람이 있으면 — 동점 규칙으로 가른다
  const tied = me.tieBreak.groupUserIds
    .filter((id) => id !== userId)
    .map((id) => now.ranking.find((r) => r.userId === id)?.v2)
    .filter((v): v is RankedParticipantV2 => Boolean(v))
    .sort((a, b) => b.finalScoreUnits - a.finalScoreUnits);
  if (tied.length > 0) {
    const useMinutes = !me.tieBreak.minutesSkipped;
    const skipped = useMinutes ? "" : " 일부 시간 기록이 없어 운동 시간은 비교하지 않아요.";
    const lead = tied[0];
    const n = tied.length;
    const criterion = firstDifference(me, lead, useMinutes);
    if (!criterion) {
      return {
        rule,
        standing: `${prefix}총점이 같은 참가자 ${n}명과 모든 기준이 같아 공동 순위예요.${skipped}`,
        action: `운동 기록을 하나만 더 쌓아도 단독으로 앞설 수 있어요. ${perWorkout}`,
      };
    }
    const gap = Math.abs(metricOf(me, criterion) - metricOf(lead, criterion));
    const label = CRITERION_LABEL[criterion];
    if (me.finalScoreUnits > lead.finalScoreUnits) {
      return {
        rule,
        standing: `${prefix}총점이 같은 참가자 ${n}명 중 앞서 있어요 (${label} 기준).${skipped}`,
        action: `${label}에서 ${unitText(criterion, Math.round(gap * 10) / 10)} 앞서 있어요. 이 기록을 이어가면 우승을 지킬 수 있어요.`,
      };
    }
    // 정수 기록이 같아지면 다음 기준으로 넘어가므로, 확실히 앞서려면 차이보다 하나 더 필요하다
    const need = Math.floor(gap + 1e-9) + 1;
    const todo =
      criterion === "days"
        ? `${need}일 이상 더 운동하면`
        : criterion === "sessions"
          ? `운동을 ${need}회 이상 더 하면`
          : `운동 시간을 ${need}분 이상 더 기록하면`;
    return {
      rule,
      standing: `${prefix}총점이 같은 참가자 ${n}명이 ${label}에서 먼저 앞서요.${skipped}`,
      action: `${todo} 앞설 수 있어요.`,
    };
  }

  // ② 총점이 다르면 — 점수 차이와 필요한 만큼을 말한다
  const rivals = now.ranking
    .filter((r) => r.userId !== userId && r.v2)
    .map((r) => r.v2 as RankedParticipantV2)
    .sort((a, b) => b.finalScoreUnits - a.finalScoreUnits);
  if (rivals.length === 0) {
    return {
      rule,
      standing: `${prefix}비교할 참가자가 없어요.`,
      action: `운동할수록 활동 점수가 계속 올라요. ${perWorkout}`,
    };
  }
  const lead = rivals[0];
  const diffCents = Math.abs(lead.breakdown.totalScoreCents - me.breakdown.totalScoreCents);
  if (me.finalScoreUnits > lead.finalScoreUnits) {
    return {
      rule,
      standing: `${prefix}${me.rank}위예요. 다음 순위와 ${round(diffCents / 100).toFixed(2)}점 차이로 앞서 있어요.`,
      action: `이 차이를 지키려면 운동을 이어가세요. ${perWorkout}`,
    };
  }
  const needPoints = ((diffCents + 1) / 100).toFixed(2);
  return {
    rule,
    standing: `${prefix}${me.rank}위예요. 위 순위가 ${round(diffCents / 100).toFixed(2)}점 앞서요.`,
    action: `${needPoints}점 이상 더 쌓으면 앞설 수 있어요. ${perWorkout}`,
  };
}
