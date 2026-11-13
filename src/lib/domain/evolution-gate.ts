import { EVOLUTION_REQUIREMENTS } from "./evolution";

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
