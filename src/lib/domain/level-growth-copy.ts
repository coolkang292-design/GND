/**
 * '내 성장' v3 표시 문구. 숫자를 올리라고 재촉하는 말은 쓰지 않는다 —
 * 성장 기록을 늘리려고 무리하게 중량을 올리게 만들면 안 된다 (작업지시서 §7.3).
 */
import type { BestSet, GrowthRecord, MetricKind } from "./level-growth";

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
  if (kind === "c") return `${fmtNum((best.distanceMeters ?? 0) / 1000)}km · ${fmtNum((best.seconds ?? 0) / 60)}분`;
  return `${best.seconds ?? 0}초`;
}

/** 성장 기록 한 줄: 기준 → 지금 */
export function growthLine(g: GrowthRecord): string {
  if (g.kind === "c") {
    const label = g.cardioComparison === "time_at_same_speed" ? "같은 속도 시간" : "같은 시간 거리";
    return `${label}: ${fmtSample(g.kind, g.baselineBest)} → ${fmtSample(g.kind, g.currentBest)}`;
  }
  return `이전 단계 최고 기록 ${fmtSample(g.kind, g.baselineBest)} → 지금 ${fmtSample(g.kind, g.currentBest)}`;
}

export const EMPTY_GROWTH_COPY =
  "아직 이번 단계에서 성장한 운동이 없어요. 지난 단계의 최고 기록을 넘기면 여기에 나타나요.";

export const UNMATCHED_COPY = "아직 비교할 이전 기록이 없어요. 다음 단계부터 비교해 드려요.";

export const JUMP_COPY =
  "기록 차이가 너무 커서(기구나 무게 입력이 달라졌을 수 있어요) 이번 단계에서는 비교하지 않아요. 다음 단계부터 지금 기록을 기준으로 비교해요.";

export const CARDIO_CONDITION_COPY =
  "같은 운동 시간이나 같은 평균속도의 이전 기록이 없어 아직 비교하지 않아요. 거리와 시간을 함께 기록해 주세요.";
