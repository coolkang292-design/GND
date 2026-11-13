import { describe, expect, it } from "vitest";
import {
  EMPTY_GROWTH_COPY,
  JUMP_COPY,
  UNMATCHED_COPY,
  fmtGrowthPct,
  fmtSample,
  growthLine,
} from "./level-growth-copy";
import type { GrowthRecord } from "./level-growth";

const rec: GrowthRecord = {
  exerciseKey: "벤치",
  kind: "w",
  baseline: 80,
  baselineDay: "2026-10-20",
  baselineBest: { weight: 60, reps: 10, seconds: null },
  current: 88,
  currentDay: "2026-11-05",
  currentBest: { weight: 66, reps: 10, seconds: null },
  growthPct: 10,
};

describe("level-growth-copy", () => {
  it("성장률은 부호와 소수 첫째 자리까지", () => {
    expect(fmtGrowthPct(7.44)).toBe("+7.4%");
    expect(fmtGrowthPct(0)).toBe("0.0%");
    expect(fmtGrowthPct(-10)).toBe("-10.0%");
    expect(fmtGrowthPct(-0.04)).toBe("0.0%");
  });

  it("세트는 사람이 아는 단위로", () => {
    expect(fmtSample("w", { weight: 16, reps: 17, seconds: null })).toBe("16kg × 17회");
    expect(fmtSample("w", { weight: 12.5, reps: 8, seconds: null })).toBe("12.5kg × 8회");
    expect(fmtSample("r", { weight: null, reps: 18, seconds: null })).toBe("18회");
    expect(fmtSample("t", { weight: null, reps: null, seconds: 75 })).toBe("75초");
  });

  it("성장 기록 한 줄은 기준 → 지금", () => {
    expect(growthLine(rec)).toBe("이전 단계 최고 기록 60kg × 10회 → 지금 66kg × 10회");
    expect(growthLine({ ...rec, kind: "r", baselineBest: { weight: null, reps: 20, seconds: null }, currentBest: { weight: null, reps: 25, seconds: null } })).toBe(
      "이전 단계 최고 기록 20회 → 지금 25회",
    );
  });

  it("빈 상태·비교 불가 문구 — 더 세게 들라고 재촉하지 않는다", () => {
    expect(EMPTY_GROWTH_COPY).toBe(
      "아직 이번 단계에서 성장한 운동이 없어요. 지난 단계의 최고 기록을 넘기면 여기에 나타나요.",
    );
    expect(UNMATCHED_COPY).toBe("아직 비교할 이전 기록이 없어요. 다음 단계부터 비교해 드려요.");
    expect(JUMP_COPY).toBe("기록 차이가 너무 커서(기구나 무게 입력이 달라졌을 수 있어요) 이번 단계에서는 비교하지 않아요. 다음 단계부터 지금 기록을 기준으로 비교해요.");
    for (const t of [EMPTY_GROWTH_COPY, UNMATCHED_COPY, JUMP_COPY, growthLine(rec)]) {
      expect(t).not.toMatch(/더 무겁|힘내|도전해|올려 보/);
    }
  });
});
