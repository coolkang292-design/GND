/**
 * 운동 직후 분석 엔진 — **AI 없이** 숫자와 판정을 계산한다 (설계 2026-09-28 §5).
 *
 * AI는 여기서 나온 판정을 문장으로 바꿀 뿐이다. 숫자·판정·다음 행동 후보는
 * 전부 이 파일이 정하고, AI가 다르게 말하면 `coach-feedback.ts`의 검증기가
 * 이 값으로 덮는다.
 *
 * ⚠️ I/O를 하지 않는다. 조회는 부르는 쪽(`ai-coach/feedback-service.ts`)이 한다.
 *
 * ⚠️ 다른 사용자와 비교하지 않는다. 비교 대상은 **본인의 같은 종목 직전 기록**뿐이다.
 *
 * ⚠️ 하나의 신호로 결론 내리지 않는다 (명령문 §2·§13·§14).
 *    반복이 줄었다 → 그것만으로는 `stable`이다. 체감이 힘들었거나 세트 간격이
 *    크게 늘었을 때만 `fatigue_signal`이 된다. 세트 간격은 **보조 신호**다.
 */

import type { ExerciseType } from "@/lib/types";
import {
  ALGORITHM_VERSION,
  CARDIO_DISTANCE_UP_RATIO,
  CARDIO_PACE_FASTER_RATIO,
  CARDIO_PACE_SLOWER_RATIO,
  GOAL_REP_RANGE,
  HOLD_DURATION_UP_RATIO,
  INTERVAL_SLOWER_RATIO,
  LOAD_UP_REP_DROP_TOLERANCE,
  SAME_LOAD_EPSILON_KG,
  SET_INTERVAL_MAX_SEC,
  SET_INTERVAL_MIN_SEC,
  TREND_SESSIONS_PER_EXERCISE,
} from "./coach-config";
import type { PrimaryGoal } from "./training-profile";

// ── 입력 ─────────────────────────────────────────────────────

/**
 * 체감 5단계 (0112). 0067의 세트 체감 3단계(`too_light`·`on_target`·`too_heavy`)는
 * 이 목록의 부분집합이라 그대로 들어온다.
 */
export type EffortLevel =
  | "too_light"
  | "light"
  | "on_target"
  | "heavy"
  | "too_heavy";

export const EFFORT_LEVELS: readonly EffortLevel[] = [
  "too_light",
  "light",
  "on_target",
  "heavy",
  "too_heavy",
];

export type SessionFlag =
  | "pain"
  | "low_condition"
  | "short_time"
  | "equipment_unavailable";

export const SESSION_FLAGS: readonly SessionFlag[] = [
  "pain",
  "low_condition",
  "short_time",
  "equipment_unavailable",
];

export type AnalysisSet = {
  weightKg: number;
  reps: number;
  durationSec: number;
  distanceM: number;
  done: boolean;
  /** 세트에 남긴 체감 (0067, 프로그램 첫·마지막 세트뿐). 없으면 null */
  effort: EffortLevel | null;
  /** 기기에서 완료를 누른 시각 (0112). 서버 completed_at이 아니다 */
  clientCompletedAtMs: number | null;
};

export type AnalysisExercise = {
  name: string;
  type: ExerciseType;
  measure: "reps" | "time" | null;
  /** `set_number` 순서여야 한다 — 간격 계산이 순서를 쓴다 */
  sets: AnalysisSet[];
};

export type AnalysisSession = {
  durationMinutes: number | null;
  exercises: AnalysisExercise[];
};

/** 과거 세션 — **최신순**으로 넘긴다 */
export type HistorySession = {
  completedAtMs: number;
  exercises: AnalysisExercise[];
};

// ── 출력 ─────────────────────────────────────────────────────

export type Reliability = "valid" | "suspect" | "missing";
export type Signal = "progress" | "stable" | "fatigue_signal" | "baseline";
export type NextAction =
  | "maintain"
  | "increase_candidate"
  | "decrease_candidate"
  | "recover"
  | "observe";

export type ReasonCode =
  | "baseline"
  | "load_up"
  | "load_down"
  | "reps_up"
  | "reps_down"
  | "reps_same"
  | "duration_up"
  | "duration_down"
  | "distance_up"
  | "pace_faster"
  | "pace_slower"
  | "interval_longer"
  | "interval_shorter"
  | "interval_unreliable"
  | "effort_hard"
  | "effort_easy"
  | "effort_unknown"
  | "target_reached"
  | "safety_blocked";

export type SetIntervalMetrics = {
  /** 믿을 만한 간격들의 평균(초). 하나도 없으면 null */
  avgSec: number | null;
  reliability: Reliability;
  validSamples: number;
  totalSamples: number;
};

export type ExerciseMetrics = {
  completedSets: number;
  /** 웨이트만. 완료 세트 중 가장 무거운 무게 */
  topWeightKg: number | null;
  /** 횟수형만. 완료 세트의 반복 목록 */
  reps: number[];
  totalReps: number;
  /** 웨이트만. 맨몸에 체중을 곱한 가짜 볼륨을 만들지 않는다 */
  volumeKg: number | null;
  /** 시간형·유산소만 */
  totalDurationSec: number | null;
  /** 유산소만 */
  distanceM: number | null;
  /** 유산소, 거리와 시간이 다 있을 때만 (초/km) */
  paceSecPerKm: number | null;
  setInterval: SetIntervalMetrics;
};

export type TrendPoint = Pick<
  ExerciseMetrics,
  "topWeightKg" | "totalReps" | "volumeKg" | "totalDurationSec" | "distanceM"
>;

export type ExerciseDeltas = {
  loadKg: number | null;
  reps: number | null;
  volumeKg: number | null;
  volumePct: number | null;
  intervalSec: number | null;
  intervalPct: number | null;
  durationPct: number | null;
  distancePct: number | null;
  pacePct: number | null;
};

export type ExerciseAnalysis = {
  name: string;
  key: string;
  type: ExerciseType;
  measure: "reps" | "time" | null;
  current: ExerciseMetrics;
  /** 이 종목이 있는 가장 최근 과거 세션. 없으면 기준선이다 */
  previous: ExerciseMetrics | null;
  /** 과거 회차 요약, 최신순 (직전 포함) */
  trend: TrendPoint[];
  deltas: ExerciseDeltas;
  effort: EffortLevel | null;
  /** 횟수형만. 모든 완료 세트가 목표 반복 상한을 넘었나 */
  targetReached: boolean | null;
  signal: Signal;
  action: NextAction;
  reasons: ReasonCode[];
};

export type SessionMetrics = {
  durationMinutes: number | null;
  completedSets: number;
  totalReps: number;
  weightVolumeKg: number;
  bodyweightReps: number;
  cardioDistanceM: number;
  cardioDurationSec: number;
  /**
   * **비교 가능한 웨이트 종목끼리만** 모은 볼륨 변화율(%).
   *
   * ⚠️ 지난 세션 전체와 비교하지 않는다. 하체 날과 팔 날을 견주면 숫자가 의미가 없다.
   */
  comparableVolumeDeltaPct: number | null;
};

export type WorkoutAnalysis = {
  algorithmVersion: string;
  goal: PrimaryGoal | null;
  session: SessionMetrics;
  exercises: ExerciseAnalysis[];
  primary: Signal;
  safety: {
    /** 통증·컨디션 신고 — 이 세션에서는 어떤 증량 후보도 내지 않는다 */
    progressionBlocked: boolean;
    reasons: ("pain" | "low_condition")[];
  };
  sessionEffort: EffortLevel | null;
  flags: SessionFlag[];
  dataQuality: { setInterval: Reliability };
};

// ── 도우미 ───────────────────────────────────────────────────

/**
 * 종목 비교 키 — 공백과 대소문자만 무시한다.
 *
 * ⚠️ `exercise_name`은 자유 텍스트다(카탈로그 FK 없음). "덤벨 숄더 프레스"와
 *    "덤벨숄더프레스"는 같은 종목으로 본다. 영문 별칭은 V1에서 합치지 않는다.
 */
export function normalizeExerciseName(name: string): string {
  return name.normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

function isTimed(ex: Pick<AnalysisExercise, "type" | "measure">): boolean {
  return ex.type === "bodyweight" && ex.measure === "time";
}

function isRepBased(ex: Pick<AnalysisExercise, "type" | "measure">): boolean {
  return ex.type === "weight" || (ex.type === "bodyweight" && !isTimed(ex));
}

/**
 * 세트 사이 간격(기기 완료 시각 차).
 *
 * ⚠️ 이 값은 **수행+휴식**이다. 세트 시작을 누르지 않으므로 둘을 가르지 못한다
 *    (사용자 결정 2026-09-28). 그래서 "템포"라고 부르지 않고 보조 신호로만 쓴다.
 */
export function setIntervalMetrics(sets: readonly AnalysisSet[]): SetIntervalMetrics {
  const times = sets.filter((s) => s.done).map((s) => s.clientCompletedAtMs);
  let valid: number[] = [];
  let totalSamples = 0;
  let anyTimed = false;
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1];
    const b = times[i];
    if (a === null || b === null) continue;
    anyTimed = true;
    totalSamples++;
    const seconds = (b - a) / 1000;
    if (seconds >= SET_INTERVAL_MIN_SEC && seconds <= SET_INTERVAL_MAX_SEC) {
      valid = [...valid, seconds];
    }
  }
  if (!anyTimed) {
    return { avgSec: null, reliability: "missing", validSamples: 0, totalSamples: 0 };
  }
  // 절반 넘게 이상하면 이 종목의 간격 전체를 믿지 않는다
  if (valid.length === 0 || valid.length * 2 < totalSamples) {
    return {
      avgSec: null,
      reliability: "suspect",
      validSamples: valid.length,
      totalSamples,
    };
  }
  const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  return {
    avgSec: Math.round(avg),
    reliability: "valid",
    validSamples: valid.length,
    totalSamples,
  };
}

export function exerciseMetrics(ex: AnalysisExercise): ExerciseMetrics {
  const done = ex.sets.filter((s) => s.done);
  const repBased = isRepBased(ex);
  const reps = repBased ? done.map((s) => s.reps) : [];
  const totalReps = reps.reduce((sum, r) => sum + r, 0);
  const isWeight = ex.type === "weight";
  const topWeightKg = isWeight
    ? done.reduce((max, s) => Math.max(max, s.weightKg), 0)
    : null;
  const volumeKg = isWeight
    ? round1(done.reduce((sum, s) => sum + s.weightKg * s.reps, 0))
    : null;
  const usesDuration = ex.type === "cardio" || isTimed(ex);
  const totalDurationSec = usesDuration
    ? done.reduce((sum, s) => sum + s.durationSec, 0)
    : null;
  const distanceM =
    ex.type === "cardio" ? done.reduce((sum, s) => sum + s.distanceM, 0) : null;
  const paceSecPerKm =
    distanceM !== null && distanceM > 0 && totalDurationSec
      ? Math.round(totalDurationSec / (distanceM / 1000))
      : null;
  return {
    completedSets: done.length,
    topWeightKg,
    reps,
    totalReps,
    volumeKg,
    totalDurationSec,
    distanceM,
    paceSecPerKm,
    setInterval: setIntervalMetrics(ex.sets),
  };
}

/** 같은 세션에 같은 종목이 두 번 있으면 세트를 이어 붙인다 */
function mergeByKey(exercises: readonly AnalysisExercise[]) {
  const merged = new Map<string, AnalysisExercise>();
  for (const ex of exercises) {
    const key = normalizeExerciseName(ex.name);
    const existing = merged.get(key);
    merged.set(
      key,
      existing ? { ...existing, sets: [...existing.sets, ...ex.sets] } : ex,
    );
  }
  return merged;
}

/** 세트에 남긴 마지막 체감이 세션 체감보다 구체적이다 */
function exerciseEffort(
  ex: AnalysisExercise,
  sessionEffort: EffortLevel | null,
): EffortLevel | null {
  const answered = ex.sets.filter((s) => s.done && s.effort !== null);
  return answered.length > 0
    ? answered[answered.length - 1].effort
    : sessionEffort;
}

function deltasOf(
  current: ExerciseMetrics,
  previous: ExerciseMetrics | null,
): ExerciseDeltas {
  if (!previous) {
    return {
      loadKg: null,
      reps: null,
      volumeKg: null,
      volumePct: null,
      intervalSec: null,
      intervalPct: null,
      durationPct: null,
      distancePct: null,
      pacePct: null,
    };
  }
  const bothIntervals =
    current.setInterval.reliability === "valid" &&
    previous.setInterval.reliability === "valid" &&
    current.setInterval.avgSec !== null &&
    previous.setInterval.avgSec !== null;
  const both = (a: number | null, b: number | null) =>
    a !== null && b !== null ? ([a, b] as const) : null;
  const load = both(current.topWeightKg, previous.topWeightKg);
  const volume = both(current.volumeKg, previous.volumeKg);
  const duration = both(current.totalDurationSec, previous.totalDurationSec);
  const distance = both(current.distanceM, previous.distanceM);
  const pace = both(current.paceSecPerKm, previous.paceSecPerKm);
  return {
    loadKg: load ? round1(load[0] - load[1]) : null,
    reps: current.reps.length > 0 || previous.reps.length > 0
      ? current.totalReps - previous.totalReps
      : null,
    volumeKg: volume ? round1(volume[0] - volume[1]) : null,
    volumePct: volume ? pct(volume[0], volume[1]) : null,
    intervalSec: bothIntervals
      ? current.setInterval.avgSec! - previous.setInterval.avgSec!
      : null,
    intervalPct: bothIntervals
      ? pct(current.setInterval.avgSec!, previous.setInterval.avgSec!)
      : null,
    durationPct: duration ? pct(duration[0], duration[1]) : null,
    distancePct: distance ? pct(distance[0], distance[1]) : null,
    pacePct: pace ? pct(pace[0], pace[1]) : null,
  };
}

type Direction = "up" | "down" | "flat";

/** 수행 방향 — 종목 유형마다 "나아졌다"의 뜻이 다르다 */
function performanceDirection(
  ex: Pick<AnalysisExercise, "type" | "measure">,
  current: ExerciseMetrics,
  previous: ExerciseMetrics,
  deltas: ExerciseDeltas,
  reasons: ReasonCode[],
): Direction {
  if (ex.type === "cardio") {
    const pace = deltas.pacePct;
    const distance = deltas.distancePct;
    if (distance !== null && distance >= CARDIO_DISTANCE_UP_RATIO * 100) {
      if (pace === null || pace <= CARDIO_PACE_SLOWER_RATIO * 100) {
        reasons.push("distance_up");
        return "up";
      }
    }
    if (
      pace !== null &&
      pace <= -CARDIO_PACE_FASTER_RATIO * 100 &&
      (distance === null || distance >= -10)
    ) {
      reasons.push("pace_faster");
      return "up";
    }
    if (pace !== null && pace >= CARDIO_PACE_SLOWER_RATIO * 100) {
      reasons.push("pace_slower");
      return "down";
    }
    return "flat";
  }

  if (isTimed(ex)) {
    const d = deltas.durationPct;
    if (d !== null && d >= HOLD_DURATION_UP_RATIO * 100) {
      reasons.push("duration_up");
      return "up";
    }
    if (d !== null && d <= -HOLD_DURATION_UP_RATIO * 100) {
      reasons.push("duration_down");
      return "down";
    }
    return "flat";
  }

  const repDelta = current.totalReps - previous.totalReps;
  const repReason = (): ReasonCode =>
    repDelta > 0 ? "reps_up" : repDelta < 0 ? "reps_down" : "reps_same";

  if (ex.type === "weight") {
    const loadDelta = (current.topWeightKg ?? 0) - (previous.topWeightKg ?? 0);
    if (loadDelta > SAME_LOAD_EPSILON_KG) {
      reasons.push("load_up", repReason());
      return current.totalReps >=
        previous.totalReps * (1 - LOAD_UP_REP_DROP_TOLERANCE)
        ? "up"
        : "flat";
    }
    if (loadDelta < -SAME_LOAD_EPSILON_KG) {
      reasons.push("load_down", repReason());
      return "flat";
    }
  }

  reasons.push(repReason());
  return repDelta > 0 ? "up" : repDelta < 0 ? "down" : "flat";
}

function targetReachedOf(
  ex: Pick<AnalysisExercise, "type" | "measure">,
  current: ExerciseMetrics,
  goal: PrimaryGoal | null,
): boolean | null {
  if (!isRepBased(ex) || current.reps.length === 0) return null;
  const range = GOAL_REP_RANGE[goal ?? "general_fitness"];
  return current.reps.every((r) => r >= range.max);
}

function decideAction(input: {
  ex: Pick<AnalysisExercise, "type" | "measure">;
  signal: Signal;
  effort: EffortLevel | null;
  targetReached: boolean | null;
  blocked: boolean;
  reasons: ReasonCode[];
}): NextAction {
  const { ex, signal, effort, targetReached, blocked, reasons } = input;
  if (signal === "baseline") return "observe";
  if (blocked) {
    reasons.push("safety_blocked");
    return signal === "fatigue_signal" ? "recover" : "maintain";
  }
  if (signal === "fatigue_signal") {
    return effort === "too_heavy" ? "decrease_candidate" : "recover";
  }
  const easy = effort === "too_light" || effort === "light";
  if (isRepBased(ex)) {
    if (!targetReached) return "maintain";
    reasons.push("target_reached");
    if (effort === null) {
      reasons.push("effort_unknown");
      return "maintain";
    }
    return easy || effort === "on_target" ? "increase_candidate" : "maintain";
  }
  // 시간형·유산소는 V1에서 "너무 쉬웠다"일 때만 올릴 후보를 낸다
  return effort === "too_light" ? "increase_candidate" : "maintain";
}

function analyzeExercise(
  ex: AnalysisExercise,
  key: string,
  history: readonly HistorySession[],
  ctx: {
    goal: PrimaryGoal | null;
    sessionEffort: EffortLevel | null;
    blocked: boolean;
  },
): ExerciseAnalysis {
  const current = exerciseMetrics(ex);
  const past: ExerciseMetrics[] = [];
  for (const session of history) {
    const match = mergeByKey(session.exercises).get(key);
    if (!match) continue;
    const metrics = exerciseMetrics(match);
    if (metrics.completedSets === 0) continue;
    past.push(metrics);
    if (past.length >= TREND_SESSIONS_PER_EXERCISE) break;
  }
  const previous = past[0] ?? null;
  const deltas = deltasOf(current, previous);
  const effort = exerciseEffort(ex, ctx.sessionEffort);
  const targetReached = targetReachedOf(ex, current, ctx.goal);
  const reasons: ReasonCode[] = [];

  let signal: Signal;
  if (!previous) {
    reasons.push("baseline");
    signal = "baseline";
  } else {
    const direction = performanceDirection(ex, current, previous, deltas, reasons);
    const effortHard = effort === "heavy" || effort === "too_heavy";
    if (effortHard) reasons.push("effort_hard");
    if (effort === "too_light" || effort === "light") reasons.push("effort_easy");

    const intervalLonger =
      deltas.intervalPct !== null &&
      deltas.intervalPct >= INTERVAL_SLOWER_RATIO * 100;
    if (deltas.intervalSec !== null) {
      if (deltas.intervalSec > 0 && intervalLonger) reasons.push("interval_longer");
      if (deltas.intervalSec < 0) reasons.push("interval_shorter");
    } else if (
      current.setInterval.reliability === "suspect" ||
      previous.setInterval.reliability === "suspect"
    ) {
      reasons.push("interval_unreliable");
    }

    if (direction === "up") signal = "progress";
    else if (direction === "down" && (effortHard || intervalLonger)) {
      signal = "fatigue_signal";
    } else if (direction === "flat" && effort === "too_heavy") {
      signal = "fatigue_signal";
    } else signal = "stable";
  }

  const action = decideAction({
    ex,
    signal,
    effort,
    targetReached,
    blocked: ctx.blocked,
    reasons,
  });

  return {
    name: ex.name,
    key,
    type: ex.type,
    measure: ex.measure,
    current,
    previous,
    trend: past.map((m) => ({
      topWeightKg: m.topWeightKg,
      totalReps: m.totalReps,
      volumeKg: m.volumeKg,
      totalDurationSec: m.totalDurationSec,
      distanceM: m.distanceM,
    })),
    deltas,
    effort,
    targetReached,
    signal,
    action,
    reasons,
  };
}

function primarySignal(exercises: readonly ExerciseAnalysis[]): Signal {
  if (exercises.every((ex) => ex.signal === "baseline")) return "baseline";
  if (exercises.some((ex) => ex.signal === "fatigue_signal")) {
    return "fatigue_signal";
  }
  if (exercises.some((ex) => ex.signal === "progress")) return "progress";
  return "stable";
}

function overallIntervalReliability(
  exercises: readonly ExerciseAnalysis[],
): Reliability {
  const values = exercises
    .map((ex) => ex.current.setInterval.reliability)
    .filter((r) => r !== "missing");
  if (values.length === 0) return "missing";
  return values.filter((r) => r === "valid").length * 2 >= values.length
    ? "valid"
    : "suspect";
}

/**
 * 오늘 운동을 본인의 과거와 비교한다.
 *
 * @param history 오늘 세션을 **뺀** 과거 완료 세션, 최신순
 */
export function analyzeWorkout(input: {
  session: AnalysisSession;
  history: readonly HistorySession[];
  goal: PrimaryGoal | null;
  sessionEffort: EffortLevel | null;
  flags: readonly SessionFlag[];
}): WorkoutAnalysis {
  const safetyReasons = input.flags.filter(
    (f): f is "pain" | "low_condition" => f === "pain" || f === "low_condition",
  );
  const blocked = safetyReasons.length > 0;

  const exercises: ExerciseAnalysis[] = [];
  for (const [key, ex] of mergeByKey(input.session.exercises)) {
    if (!ex.sets.some((s) => s.done)) continue;
    exercises.push(
      analyzeExercise(ex, key, input.history, {
        goal: input.goal,
        sessionEffort: input.sessionEffort,
        blocked,
      }),
    );
  }

  let comparableNow = 0;
  let comparableBefore = 0;
  for (const ex of exercises) {
    if (ex.current.volumeKg !== null && ex.previous?.volumeKg) {
      comparableNow += ex.current.volumeKg;
      comparableBefore += ex.previous.volumeKg;
    }
  }

  const session: SessionMetrics = {
    durationMinutes: input.session.durationMinutes,
    completedSets: exercises.reduce((n, ex) => n + ex.current.completedSets, 0),
    totalReps: exercises.reduce((n, ex) => n + ex.current.totalReps, 0),
    weightVolumeKg: round1(
      exercises.reduce((n, ex) => n + (ex.current.volumeKg ?? 0), 0),
    ),
    bodyweightReps: exercises
      .filter((ex) => ex.type === "bodyweight")
      .reduce((n, ex) => n + ex.current.totalReps, 0),
    cardioDistanceM: exercises.reduce(
      (n, ex) => n + (ex.current.distanceM ?? 0),
      0,
    ),
    cardioDurationSec: exercises
      .filter((ex) => ex.type === "cardio")
      .reduce((n, ex) => n + (ex.current.totalDurationSec ?? 0), 0),
    comparableVolumeDeltaPct:
      comparableBefore > 0 ? pct(comparableNow, comparableBefore) : null,
  };

  return {
    algorithmVersion: ALGORITHM_VERSION,
    goal: input.goal,
    session,
    exercises,
    primary: primarySignal(exercises),
    safety: { progressionBlocked: blocked, reasons: safetyReasons },
    sessionEffort: input.sessionEffort,
    flags: [...input.flags],
    dataQuality: { setInterval: overallIntervalReliability(exercises) },
  };
}
