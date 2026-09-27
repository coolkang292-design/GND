import { describe, expect, it } from "vitest";
import { exerciseHighlight, pickHighlights } from "./coach-highlights";
import {
  analyzeWorkout,
  type AnalysisExercise,
  type AnalysisSet,
} from "./workout-analysis";

function s(partial: Partial<AnalysisSet>): AnalysisSet {
  return {
    weightKg: 0,
    reps: 0,
    durationSec: 0,
    distanceM: 0,
    done: true,
    effort: null,
    clientCompletedAtMs: null,
    ...partial,
  };
}

function analyze(current: AnalysisExercise[], previous: AnalysisExercise[] = []) {
  return analyzeWorkout({
    session: { durationMinutes: 40, exercises: current },
    history: previous.length ? [{ completedAtMs: 1, exercises: previous }] : [],
    goal: null,
    sessionEffort: null,
    flags: [],
  }).exercises;
}

const w = (name: string, kg: number, reps: number[]): AnalysisExercise => ({
  name,
  type: "weight",
  measure: null,
  sets: reps.map((r) => s({ weightKg: kg, reps: r })),
});

describe("exerciseHighlight", () => {
  it("첫 기록은 비교하지 않고 '첫 기록'이라고만 한다", () => {
    const [ex] = analyze([w("벤치프레스", 60, [10, 10])]);
    expect(exerciseHighlight(ex)).toEqual({
      name: "벤치프레스",
      detail: "60kg · 총 20회 · 첫 기록",
      tone: "new",
    });
  });

  it("같은 무게면 반복 변화를 말한다", () => {
    const [ex] = analyze([w("벤치프레스", 60, [10, 10, 9])], [w("벤치프레스", 60, [10, 9, 8])]);
    expect(exerciseHighlight(ex).detail).toBe("60kg · 총 29회 · 지난번 +2회");
    expect(exerciseHighlight(ex).tone).toBe("up");
  });

  it("무게가 바뀌면 무게 변화를 말한다 (소수점 유지)", () => {
    const [ex] = analyze([w("벤치프레스", 62.5, [8])], [w("벤치프레스", 60, [10])]);
    expect(exerciseHighlight(ex).detail).toBe("62.5kg · 총 8회 · 무게 +2.5kg");
  });

  it("맨몸 횟수형", () => {
    const [ex] = analyze(
      [{ name: "푸시업", type: "bodyweight", measure: "reps", sets: [s({ reps: 15 })] }],
      [{ name: "푸시업", type: "bodyweight", measure: "reps", sets: [s({ reps: 20 })] }],
    );
    expect(exerciseHighlight(ex)).toMatchObject({ detail: "총 15회 · 지난번 -5회", tone: "down" });
  });

  it("시간형은 분:초", () => {
    const [ex] = analyze(
      [{ name: "플랭크", type: "bodyweight", measure: "time", sets: [s({ durationSec: 90 })] }],
      [{ name: "플랭크", type: "bodyweight", measure: "time", sets: [s({ durationSec: 60 })] }],
    );
    expect(exerciseHighlight(ex).detail).toBe("총 1:30 · 지난번 +30초");
  });

  it("러닝은 거리와 페이스", () => {
    const [ex] = analyze(
      [{ name: "러닝", type: "cardio", measure: null, sets: [s({ distanceM: 5000, durationSec: 1500 })] }],
      [{ name: "러닝", type: "cardio", measure: null, sets: [s({ distanceM: 5000, durationSec: 1650 })] }],
    );
    expect(exerciseHighlight(ex).detail).toBe("5km · 5'00\"/km · 지난번보다 30초 빠름");
    expect(exerciseHighlight(ex).tone).toBe("up");
  });
});

describe("pickHighlights", () => {
  it("비교 가능한 종목을 먼저, 최대 3개", () => {
    const exercises = analyze(
      [w("A", 10, [10]), w("B", 10, [10]), w("C", 10, [10]), w("D", 10, [10])],
      [w("D", 10, [8])],
    );
    const picked = pickHighlights(exercises);
    expect(picked).toHaveLength(3);
    expect(picked[0].name).toBe("D");
  });
});
