import { describe, expect, it } from "vitest";
import { exerciseLine, fmtGrowthPct, fmtSample, statusLabel } from "./level-growth-copy";
import type { ExerciseLevelGrowth } from "./level-growth";

const base: ExerciseLevelGrowth = {
  exerciseKey: "덤벨 숄더 프레스",
  kind: "w",
  baseline: 20,
  baselineSamples: [],
  current: 20,
  currentSamples: [],
  currentDayCount: 3,
  growthPct: 0,
  status: "confirmed",
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

  it("기록이 모자라면 며칠 더 필요한지 말한다", () => {
    expect(exerciseLine({ ...base, status: "provisional", currentDayCount: 1 })).toBe(
      "2일 더 기록하면 성장률을 확정할 수 있어요.",
    );
    expect(exerciseLine({ ...base, status: "waiting", currentDayCount: 0, growthPct: null, current: null })).toBe(
      "3일 더 기록하면 성장률을 확정할 수 있어요.",
    );
  });

  it("확정이면 같음·향상·하락을 말한다 — 중량을 올리라고 재촉하지 않는다", () => {
    expect(exerciseLine(base)).toBe("이전 레벨과 같은 수준을 유지하고 있어요.");
    expect(exerciseLine({ ...base, growthPct: 5 })).toBe("이전 레벨보다 더 무거운 중량을 들어 올렸어요.");
    expect(exerciseLine({ ...base, kind: "r", growthPct: 5 })).toBe("이전 레벨보다 더 많이 반복했어요.");
    expect(exerciseLine({ ...base, kind: "t", growthPct: 5 })).toBe("이전 레벨보다 더 오래 버텼어요.");
    expect(exerciseLine({ ...base, growthPct: -5 })).toBe(
      "최근 기록이 기준보다 낮아요. 다음 운동에서 다시 비교해 보세요.",
    );
  });

  it("상태 이름", () => {
    expect(statusLabel("confirmed")).toBe("확정");
    expect(statusLabel("provisional")).toBe("잠정");
    expect(statusLabel("waiting")).toBe("기록 대기");
  });
});
