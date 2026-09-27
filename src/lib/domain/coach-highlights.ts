/**
 * "오늘의 성과"의 종목 한 줄 — **AI 없이** 계산값으로 만든다 (명령문 §27·§28).
 *
 * AI가 실패해도 이 줄은 보인다. 그래서 문장은 사실만 말한다 — 좋다·나쁘다를
 * 판정하지 않고 숫자 변화만 적는다. 판정은 AI 코치 칸의 몫이다.
 */

import type { ExerciseAnalysis } from "./workout-analysis";

export type Highlight = {
  name: string;
  detail: string;
  /** 색만 정한다 — up=강조, down=주의, same=기본, new=첫 기록 */
  tone: "up" | "down" | "same" | "new";
};

function kg(value: number): string {
  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}kg`;
}

function signed(value: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function pace(secPerKm: number): string {
  const safe = Math.round(secPerKm);
  return `${Math.floor(safe / 60)}'${String(safe % 60).padStart(2, "0")}"`;
}

function km(meters: number): string {
  const value = meters / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}km`;
}

function durationDelta(seconds: number): string {
  const abs = Math.abs(Math.round(seconds));
  const body = abs >= 60 ? clock(abs) : `${abs}초`;
  return `${seconds > 0 ? "+" : "-"}${body}`;
}

export function exerciseHighlight(ex: ExerciseAnalysis): Highlight {
  const cur = ex.current;
  const prev = ex.previous;
  const parts: string[] = [];
  let tone: Highlight["tone"] = prev ? "same" : "new";
  const toneOf = (delta: number, betterIsLower = false) => {
    if (delta === 0) return "same" as const;
    return (delta > 0) !== betterIsLower ? ("up" as const) : ("down" as const);
  };

  if (ex.type === "cardio") {
    if (cur.distanceM) parts.push(km(cur.distanceM));
    if (cur.paceSecPerKm !== null) parts.push(`${pace(cur.paceSecPerKm)}/km`);
    else if (cur.totalDurationSec) parts.push(clock(cur.totalDurationSec));
    if (prev?.paceSecPerKm && cur.paceSecPerKm !== null) {
      const diff = cur.paceSecPerKm - prev.paceSecPerKm;
      if (diff !== 0) {
        parts.push(`지난번보다 ${Math.abs(diff)}초 ${diff < 0 ? "빠름" : "느림"}`);
      }
      tone = toneOf(diff, true);
    } else if (prev?.distanceM && cur.distanceM !== null) {
      const diff = Math.round(cur.distanceM - prev.distanceM);
      if (diff !== 0) parts.push(`지난번 ${signed(diff, "m")}`);
      tone = toneOf(diff);
    }
  } else if (ex.type === "bodyweight" && ex.measure === "time") {
    parts.push(`총 ${clock(cur.totalDurationSec ?? 0)}`);
    if (prev) {
      const diff = (cur.totalDurationSec ?? 0) - (prev.totalDurationSec ?? 0);
      if (diff !== 0) parts.push(`지난번 ${durationDelta(diff)}`);
      tone = toneOf(diff);
    }
  } else {
    if (ex.type === "weight" && cur.topWeightKg) parts.push(kg(cur.topWeightKg));
    parts.push(`총 ${cur.totalReps}회`);
    const load = ex.deltas.loadKg;
    if (prev && load !== null && load !== 0) {
      parts.push(`무게 ${load > 0 ? "+" : "-"}${kg(Math.abs(load))}`);
      tone = toneOf(load);
    } else if (prev) {
      const reps = cur.totalReps - prev.totalReps;
      parts.push(reps === 0 ? "지난번과 같음" : `지난번 ${signed(reps, "회")}`);
      tone = toneOf(reps);
    }
  }

  if (!prev) parts.push("첫 기록");
  return { name: ex.name, detail: parts.join(" · "), tone };
}

/** 성과 칸에 올릴 종목 — 비교 가능한 것 먼저, 세트가 많은 것 순, 최대 3개 */
export function pickHighlights(
  exercises: readonly ExerciseAnalysis[],
  max = 3,
): Highlight[] {
  return [...exercises]
    .sort((a, b) => {
      const aNew = a.previous ? 0 : 1;
      const bNew = b.previous ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return b.current.completedSets - a.current.completedSets;
    })
    .slice(0, max)
    .map(exerciseHighlight);
}
