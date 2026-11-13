/**
 * '내 성장' v2.1 표시 문구. 숫자를 올리라고 재촉하는 말은 쓰지 않는다 —
 * 성장률을 높이려고 무리하게 중량을 올리게 만들면 안 된다 (작업지시서 §7.3).
 */
import {
  CONFIRM_DAYS,
  type BestSet,
  type ExerciseLevelGrowth,
  type GrowthStatus,
  type MetricKind,
} from "./level-growth";

/** 화면에서 0.0%로 보이는 범위는 "같다"로 친다 */
const SAME_BAND_PCT = 0.05;

export function fmtGrowthPct(pct: number): string {
  if (Math.abs(pct) < SAME_BAND_PCT) return "0.0%";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function fmtSample(kind: MetricKind, best: BestSet): string {
  if (kind === "w") return `${fmtNum(best.weight ?? 0)}kg × ${best.reps ?? 0}회`;
  if (kind === "r") return `${best.reps ?? 0}회`;
  return `${best.seconds ?? 0}초`;
}

export function statusLabel(status: GrowthStatus): string {
  return status === "confirmed" ? "확정" : status === "provisional" ? "잠정" : "기록 대기";
}

const UP: Record<MetricKind, string> = {
  w: "이전 레벨보다 더 무거운 중량을 들어 올렸어요.",
  r: "이전 레벨보다 더 많이 반복했어요.",
  t: "이전 레벨보다 더 오래 버텼어요.",
};

export function exerciseLine(e: ExerciseLevelGrowth): string {
  if (e.status !== "confirmed" || e.growthPct === null) {
    return `${CONFIRM_DAYS - e.currentDayCount}일 더 기록하면 성장률을 확정할 수 있어요.`;
  }
  if (Math.abs(e.growthPct) < SAME_BAND_PCT) return "이전 레벨과 같은 수준을 유지하고 있어요.";
  if (e.growthPct > 0) return UP[e.kind];
  return "최근 기록이 기준보다 낮아요. 다음 운동에서 다시 비교해 보세요.";
}
