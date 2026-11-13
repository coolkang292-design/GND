import type { GrowthRecord, StageGrowth } from "./level-growth";

export type GateCondition = {
  key: "xp" | "days" | "weeks" | "recent" | "growth_count" | "growth_average" | "steady";
  current: number | null;
  required: number | null;
  met: boolean;
  windowDays?: number;
};
export type GateAlternate = { kind: "days" | "steady"; current: number | null; required: number; met: boolean; exemptsSteady: boolean };
export type StageGateStatus = {
  mode: "legacy_xp" | "xp_only" | "gated";
  ruleVersion: string;
  currentStage: number;
  currentLevel: number;
  stageEnteredAt: string | null;
  nextStage: number | null;
  state: "max_stage" | "needs_baseline" | "blocked" | "eligible" | "error";
  /** 지금 가장 가까운 경로. 성장 경로(growth)를 못 채웠고 대체 경로를 채웠으면 alternate */
  path: "growth" | "alternate";
  /** 성장 대신 쓸 수 있는 대체 경로(4·5단계 운동일, 6·7단계 꾸준함 횟수). 없으면 null */
  alternate?: GateAlternate | null;
  growthMetric: "top_n_zero_padded_mean";
  averageGrowthPct: number | null;
  comparableCount: number;
  requiredGrowthCount: number | null;
  filledGrowthCount: number;
  conditions: GateCondition[];
  growthSummary: StageGrowth | null;
  selectedGrowths: GrowthRecord[];
  errorCode?: string | null;
  stageUp?: boolean;
  previousStage?: number;
};

/** API 장애·잘못된 계약을 0%/XP 모드로 감추지 않는다. 숫자는 서버 원본을 사용한다. */
export function parseStageGateStatus(value: unknown): StageGateStatus {
  const fail = (): never => { throw new Error("invalid stage evolution response"); };
  if (!value || typeof value !== "object") return fail();
  const v = value as StageGateStatus;
  const finiteOrNull = (n: unknown) => n === null || (typeof n === "number" && Number.isFinite(n));
  if (!["legacy_xp", "xp_only", "gated"].includes(v.mode) ||
    !["max_stage", "needs_baseline", "blocked", "eligible", "error"].includes(v.state) ||
    typeof v.ruleVersion !== "string" || !v.ruleVersion ||
    !Number.isInteger(v.currentStage) || v.currentStage < 1 || v.currentStage > 7 ||
    !Number.isInteger(v.currentLevel) || v.currentLevel < 1 || v.currentLevel > 35 ||
    v.nextStage !== (v.currentStage === 7 ? null : v.currentStage + 1) ||
    !(v.stageEnteredAt === null || (typeof v.stageEnteredAt === "string" && Number.isFinite(Date.parse(v.stageEnteredAt)))) ||
    !["growth", "alternate"].includes(v.path) || v.growthMetric !== "top_n_zero_padded_mean" ||
    !finiteOrNull(v.averageGrowthPct) ||
    !Number.isInteger(v.comparableCount) || v.comparableCount < 0 ||
    !Number.isInteger(v.filledGrowthCount) || v.filledGrowthCount < 0 ||
    !(v.requiredGrowthCount === null || (Number.isInteger(v.requiredGrowthCount) && v.requiredGrowthCount > 0)) ||
    !Array.isArray(v.conditions) || !Array.isArray(v.selectedGrowths)) return fail();
  for (const c of v.conditions) {
    if (!c || !["xp", "days", "weeks", "recent", "growth_count", "growth_average", "steady"].includes(c.key) ||
      !finiteOrNull(c.current) || !finiteOrNull(c.required) || typeof c.met !== "boolean") return fail();
  }
  if (v.alternate !== undefined && v.alternate !== null && (typeof v.alternate !== "object" ||
    !["days", "steady"].includes(v.alternate.kind) || typeof v.alternate.met !== "boolean" ||
    typeof v.alternate.exemptsSteady !== "boolean" || !finiteOrNull(v.alternate.current) ||
    !Number.isInteger(v.alternate.required) || v.alternate.required <= 0)) return fail();
  if (v.growthSummary !== null && (!v.growthSummary || !Array.isArray(v.growthSummary.growths) || !Array.isArray(v.growthSummary.unmatched))) return fail();
  return v;
}

/**
 * 목표 단계(2~7)별 진화 규칙 — 사용자 확정 2026-11-13.
 * 서버 규칙표(`stage_evolution_rules`, 0133)와 같은 값이어야 한다. 서버(SQL)가 판정하고 이 표는 미리보기·독립 대조용이다.
 * 수치 근거와 한계: docs/superpowers/plans/2026-11-13-evolution-rules-evidence-adjustment.md §1~2
 */
export type StageRule = {
  targetStage: number;
  minLevel: number;
  mode: "xp_only" | "gated";
  /** 4·5단계는 누적 운동일, 6·7단계는 첫 운동 후 경과 주. xp_only면 null */
  habit: { kind: "days" | "weeks"; required: number } | null;
  /** 6·7단계의 최근 활동: 최근 windowDays일 중 days일 */
  recent: { windowDays: number; days: number } | null;
  /** 상위 N개 평균 목표(%) */
  averagePct: number | null;
  /** N = max(1, ceil(M × growthRatio)) */
  growthRatio: number | null;
  /** 필요한 꾸준함(미션) 횟수. 성장 경로에서 요구한다 */
  steadyRequired: number;
  /** 성장 대신 쓸 수 있는 경로 */
  alternate:
    | { kind: "days"; required: number; exemptsSteady: boolean }
    | { kind: "steady"; required: number }
    | null;
};

export const STAGE_RULES: Record<number, StageRule> = {
  2: { targetStage: 2, minLevel: 6, mode: "xp_only", habit: null, recent: null, averagePct: null, growthRatio: null, steadyRequired: 0, alternate: null },
  3: { targetStage: 3, minLevel: 11, mode: "xp_only", habit: null, recent: null, averagePct: null, growthRatio: null, steadyRequired: 0, alternate: null },
  4: { targetStage: 4, minLevel: 16, mode: "gated", habit: { kind: "days", required: 36 }, recent: null,
    averagePct: 3, growthRatio: 0.15, steadyRequired: 0, alternate: { kind: "days", required: 54, exemptsSteady: false } },
  5: { targetStage: 5, minLevel: 21, mode: "gated", habit: { kind: "days", required: 60 }, recent: null,
    averagePct: 5, growthRatio: 0.2, steadyRequired: 1, alternate: { kind: "days", required: 90, exemptsSteady: true } },
  6: { targetStage: 6, minLevel: 26, mode: "gated", habit: { kind: "weeks", required: 40 }, recent: { windowDays: 28, days: 8 },
    averagePct: 8, growthRatio: 0.25, steadyRequired: 2, alternate: { kind: "steady", required: 4 } },
  7: { targetStage: 7, minLevel: 31, mode: "gated", habit: { kind: "weeks", required: 60 }, recent: { windowDays: 42, days: 12 },
    averagePct: 10, growthRatio: 0.3, steadyRequired: 3, alternate: { kind: "steady", required: 6 } },
};

export function getStageGrowthGoal(currentStage: number, previousStageExerciseCount: number | null) {
  if (!Number.isInteger(currentStage) || currentStage < 1 || currentStage > 7) throw new RangeError("invalid currentStage");
  if (currentStage === 7) return { mode: "complete" as const, nextStage: null };
  const nextStage = currentStage + 1;
  const rule = STAGE_RULES[nextStage];
  if (rule.mode === "xp_only") return { mode: "xp_only" as const, nextStage, minLevel: rule.minLevel };
  if (previousStageExerciseCount === null || !Number.isInteger(previousStageExerciseCount) || previousStageExerciseCount <= 0) {
    return { mode: "needs_baseline" as const, nextStage };
  }
  return { mode: "growth_preview" as const, nextStage,
    requiredCount: Math.max(1, Math.ceil(previousStageExerciseCount * (rule.growthRatio as number))),
    averageTargetPct: rule.averagePct as number,
  };
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
/** 1970-01-01(목)이 day 0. 월요일 = 0이 되도록 (n+3) % 7 */
const mondayOf = (n: number) => n - (((n + 3) % 7) + 7) % 7;

/**
 * 꾸준함 횟수 — 연속 4개 달력 주(월~일) 중 3주 이상에서 서로 다른 운동일이 2일 이상이면 1회.
 * 구간은 겹치지 않게 앞에서부터 센다. 구간의 마지막 주가 오늘이 속한 주를 넘으면(아직 시작 전) 세지 않는다.
 * `days`는 Asia/Seoul 날짜(YYYY-MM-DD), `since`는 현재 단계 진입 날짜. 진입 이전 날짜는 세지 않는다.
 * SQL `gnd_evolution.steady_count`와 독립 구현이다(같은 시험 벡터로 대조).
 */
export function countSteadyWindows(days: string[], since: string | null, today: string): number {
  if (since === null || days.length === 0) return 0;
  const sinceN = dayNumber(since), todayN = dayNumber(today);
  const set = [...new Set(days.map(dayNumber))].filter(n => n >= sinceN && n <= todayN);
  const lastWeek = mondayOf(todayN);
  const qualifies = (weekStart: number) => set.filter(n => n >= weekStart && n < weekStart + 7).length >= 2;
  let count = 0;
  let start = mondayOf(sinceN);
  while (start + 21 <= lastWeek) {
    const q = [0, 7, 14, 21].filter(o => qualifies(start + o)).length;
    if (q >= 3) { count += 1; start += 28; } else start += 7;
  }
  return count;
}

export type GateInput = {
  /** XP 레벨 */
  level: number;
  /** 유효 운동의 Asia/Seoul 날짜(가입 후 전체, 중복 허용) */
  workoutDays: string[];
  today: string;
  /** 현재 단계 진입 날짜(없으면 꾸준함 0회) */
  stageEnteredDay: string | null;
  /** 성장 기준: filled=실제 성장 종목 수, required=N(기준 없으면 null), averagePct=상위 N개 평균(부족분 0) */
  growth: { filled: number; required: number | null; averagePct: number | null };
};

export type GateEvaluation = {
  state: "needs_baseline" | "blocked" | "eligible";
  path: "growth" | "alternate";
  conditions: GateCondition[];
  steady: { count: number; required: number; met: boolean };
  alternate: GateAlternate | null;
};

/** 규칙 + 입력 → 진화 가능 여부. 서버 SQL 판정을 독립적으로 재현한다(반올림 전 값으로 비교). */
export function evaluateStageGate(targetStage: number, input: GateInput): GateEvaluation {
  const rule = STAGE_RULES[targetStage];
  if (!rule) throw new RangeError("invalid targetStage");
  const xp: GateCondition = { key: "xp", current: input.level, required: rule.minLevel, met: input.level >= rule.minLevel };
  if (rule.mode === "xp_only") {
    return { state: xp.met ? "eligible" : "blocked", path: "growth", conditions: [xp],
      steady: { count: 0, required: 0, met: true }, alternate: null };
  }
  const todayN = dayNumber(input.today);
  const days = [...new Set(input.workoutDays.map(dayNumber))].filter(n => n <= todayN);
  const nDays = days.length;
  const weeks = nDays === 0 ? 0 : Math.floor((todayN - Math.min(...days)) / 7);
  const habit = rule.habit as NonNullable<StageRule["habit"]>;
  const conditions: GateCondition[] = [xp, habit.kind === "days"
    ? { key: "days", current: nDays, required: habit.required, met: nDays >= habit.required }
    : { key: "weeks", current: weeks, required: habit.required, met: weeks >= habit.required }];
  if (rule.recent) {
    const recent = days.filter(n => todayN - n < (rule.recent as { windowDays: number }).windowDays).length;
    conditions.push({ key: "recent", current: recent, required: rule.recent.days, met: recent >= rule.recent.days, windowDays: rule.recent.windowDays });
  }
  const g = input.growth;
  const growthCountMet = g.required !== null && g.filled >= g.required;
  const growthAvgMet = g.averagePct !== null && g.averagePct >= (rule.averagePct as number);
  conditions.push(
    { key: "growth_count", current: g.filled, required: g.required, met: growthCountMet },
    { key: "growth_average", current: g.averagePct, required: rule.averagePct, met: growthAvgMet },
  );
  const steadyCount = countSteadyWindows(input.workoutDays, input.stageEnteredDay, input.today);
  const steady = { count: steadyCount, required: rule.steadyRequired, met: steadyCount >= rule.steadyRequired };
  if (rule.steadyRequired > 0) conditions.push({ key: "steady", current: steadyCount, required: rule.steadyRequired, met: steady.met });

  let alternate: GateAlternate | null = null;
  if (rule.alternate?.kind === "days") {
    alternate = { kind: "days", current: nDays, required: rule.alternate.required, exemptsSteady: rule.alternate.exemptsSteady,
      met: nDays >= rule.alternate.required && (rule.alternate.exemptsSteady || steady.met) };
  } else if (rule.alternate?.kind === "steady") {
    alternate = { kind: "steady", current: steadyCount, required: rule.alternate.required, exemptsSteady: false,
      met: steadyCount >= rule.alternate.required };
  }
  const base = conditions.filter(c => ["xp", "days", "weeks", "recent"].includes(c.key)).every(c => c.met);
  const growthPath = growthCountMet && growthAvgMet && steady.met;
  const eligible = base && (growthPath || alternate?.met === true);
  return { state: eligible ? "eligible" : g.required === null ? "needs_baseline" : "blocked",
    path: growthPath || !alternate?.met ? "growth" : "alternate", conditions, steady, alternate };
}
