import { EVOLUTION_REQUIREMENTS } from "./evolution";
import type { GrowthRecord, StageGrowth } from "./level-growth";

export type GateCondition = {
  key: "xp" | "days" | "weeks" | "recent" | "growth_count" | "growth_average";
  current: number | null;
  required: number | null;
  met: boolean;
  windowDays?: number;
};
export type StageGateStatus = {
  mode: "legacy_xp" | "xp_only" | "gated";
  ruleVersion: string;
  currentStage: number;
  currentLevel: number;
  stageEnteredAt: string | null;
  nextStage: number | null;
  state: "max_stage" | "needs_baseline" | "blocked" | "eligible" | "error";
  path: "growth";
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
    v.path !== "growth" || v.growthMetric !== "top_n_zero_padded_mean" ||
    !finiteOrNull(v.averageGrowthPct) ||
    !Number.isInteger(v.comparableCount) || v.comparableCount < 0 ||
    !Number.isInteger(v.filledGrowthCount) || v.filledGrowthCount < 0 ||
    !(v.requiredGrowthCount === null || (Number.isInteger(v.requiredGrowthCount) && v.requiredGrowthCount > 0)) ||
    !Array.isArray(v.conditions) || !Array.isArray(v.selectedGrowths)) return fail();
  for (const c of v.conditions) {
    if (!c || !["xp", "days", "weeks", "recent", "growth_count", "growth_average"].includes(c.key) ||
      !finiteOrNull(c.current) || !finiteOrNull(c.required) || typeof c.met !== "boolean") return fail();
  }
  if (v.growthSummary !== null && (!v.growthSummary || !Array.isArray(v.growthSummary.growths) || !Array.isArray(v.growthSummary.unmatched))) return fail();
  return v;
}

/** 분석·미리보기용 초안. 운영 서버 규칙 활성화 승인을 대신하지 않는다. */
export const DRAFT_GROWTH_RATIOS: Record<number, number> = { 4: 0.15, 5: 0.20, 6: 0.25, 7: 0.30 };

export function getStageGrowthGoal(currentStage: number, previousStageExerciseCount: number | null) {
  if (!Number.isInteger(currentStage) || currentStage < 1 || currentStage > 7) throw new RangeError("invalid currentStage");
  if (currentStage === 7) return { mode: "complete" as const, nextStage: null };
  const nextStage = currentStage + 1;
  const requirement = EVOLUTION_REQUIREMENTS[nextStage];
  if (nextStage <= 3) return { mode: "xp_only" as const, nextStage, minLevel: requirement.minLevel };
  if (previousStageExerciseCount === null || !Number.isInteger(previousStageExerciseCount) || previousStageExerciseCount <= 0) {
    return { mode: "needs_baseline" as const, nextStage };
  }
  return { mode: "growth_preview" as const, nextStage,
    requiredCount: Math.max(1, Math.ceil(previousStageExerciseCount * DRAFT_GROWTH_RATIOS[nextStage])),
    averageTargetPct: requirement.growthPct as number,
  };
}
