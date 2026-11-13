import { describe, expect, it } from "vitest";
import { computeStageGrowth, toMetricPoints, type RawSession } from "./level-growth";

const ENTRY = Date.parse("2026-11-01T00:00:00Z");
function session(day: string, meters: number | null, seconds: number, name = "트레드밀"): RawSession {
  return {
    completed_at: `${day}T00:00:00Z`, tabata_minutes: null,
    workout_exercises: [{ exercise_name: name, exercise_type: "cardio", sort_order: 0,
      workout_sets: [{ weight_kg: null, reps: null, distance_meters: meters, duration_seconds: seconds, is_completed: true }],
    }],
  };
}
function grow(sessions: RawSession[]) {
  return computeStageGrowth({ points: toMetricPoints(sessions), stageEnteredAtMs: ENTRY,
    previousStageEnteredAtMs: Date.parse("2026-10-01T00:00:00Z") });
}

describe("유산소 성장 — 같은 조건의 성과", () => {
  it("한 세션에 같은 유산소 종목이 두 줄이면 분할 여부와 관계없이 합산한다", () => {
    const s = session("2026-11-10", 1500, 900);
    s.workout_exercises!.push({ ...s.workout_exercises![0], sort_order: 1 });
    const points = toMetricPoints([s]);
    expect(points).toHaveLength(1);
    expect(points[0].best).toMatchObject({ distanceMeters: 3000, seconds: 1800 });
  });
  it("30분3km→같은30분3.3km는 거리10% 성장", () => {
    const result = grow([session("2026-10-10", 3000, 1800), session("2026-11-10", 3300, 1800)]);
    expect(result.growths).toHaveLength(1);
    expect(result.growths[0]).toMatchObject({ exerciseKey: "트레드밀", kind: "c", cardioComparison: "distance_at_same_time" });
    expect(result.growths[0].growthPct).toBeCloseTo(10, 9);
  });
  it("사이클30분9km→33분9.9km는 같은 속도로 시간10% 성장", () => {
    const result = grow([session("2026-10-10", 9000, 1800, "사이클"), session("2026-11-10", 9900, 1980, "사이클")]);
    expect(result.growths).toHaveLength(1);
    expect(result.growths[0]).toMatchObject({ kind: "c", cardioComparison: "time_at_same_speed" });
    expect(result.growths[0].growthPct).toBeCloseTo(10, 9);
  });
  it("느리게 오래 한 기록은 조건을 비교할 수 없으며 시간유지 운동으로도 세지 않는다", () => {
    const result = grow([session("2026-10-10", 3000, 1800), session("2026-11-10", 3300, 2400)]);
    expect(result.growths).toEqual([]);
    expect(result.unmatched).toContainEqual({ exerciseKey: "트레드밀", kind: "c", reason: "cardio_condition" });
  });
  it("같은 시간의 옛 약한 기록 대신 그 조건 최고 기록과 비교한다", () => {
    const result = grow([session("2026-10-10", 3000, 1800), session("2026-10-20", 3600, 1800), session("2026-11-10", 3300, 1800)]);
    expect(result.growths).toEqual([]);
    expect(result.unchangedCount).toBe(1);
  });
  it("거리가 없는 시간 기록은 속도 확인이 불가능해 성장에 쓰지 않는다", () => {
    expect(toMetricPoints([session("2026-10-10", null, 1800)])).toEqual([]);
  });
  it("같은 사이클의 여러 수행은 한 성장 종목으로만 센다", () => {
    const result = grow([session("2026-10-10", 9000, 1800, "사이클"),
      session("2026-11-10", 9900, 1800, "사이클"), session("2026-11-11", 10800, 1800, "사이클")]);
    expect(result.growths).toHaveLength(1);
    expect(result.growths[0].growthPct).toBeCloseTo(20, 9);
    expect(result.previousStageExerciseCount).toBe(1);
  });
  it("미완료 세트의 거리는 합산하지 않는다", () => {
    const s = session("2026-11-10", 3000, 1800);
    s.workout_exercises![0].workout_sets!.push({ weight_kg: null, reps: null, distance_meters: 10000,
      duration_seconds: 100, is_completed: false });
    const points = toMetricPoints([s]);
    expect(points).toHaveLength(1);
    expect(points[0].best).toMatchObject({ distanceMeters: 3000, seconds: 1800 });
  });
  it("같은 유산소에 완료됐지만 거리누락 세트가 있으면 부분 집계하지 않는다", () => {
    const s = session("2026-11-10", 3000, 1800);
    s.workout_exercises![0].workout_sets!.push({ weight_kg: null, reps: null, distance_meters: null,
      duration_seconds: 100, is_completed: true });
    expect(toMetricPoints([s])).toEqual([]);
  });
});
