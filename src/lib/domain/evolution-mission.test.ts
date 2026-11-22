import { describe, expect, it } from "vitest";
import type { GateCondition, StageGateStatus } from "./evolution-gate";
import { buildEvolutionMission, buildExerciseTarget, type BaselineEntry } from "./evolution-mission";

const cond = (
  key: GateCondition["key"],
  current: number | null,
  required: number | null,
  met: boolean,
  extra: Partial<GateCondition> = {},
): GateCondition => ({ key, current, required, met, ...extra });

const baseStatus: StageGateStatus = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 5, currentLevel: 21,
  stageEnteredAt: "2026-11-21T10:15:42Z", nextStage: 6, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 2.3, comparableCount: 6,
  requiredGrowthCount: 8, filledGrowthCount: 4,
  conditions: [
    cond("xp", 21, 26, false),
    cond("weeks", 0, 12, false),
    cond("recent", 2, 8, false, { windowDays: 28 }),
    cond("growth_count", 4, 8, false),
    cond("growth_average", 2.3, 8, false),
    cond("steady", 0, 2, false),
  ],
  alternate: null, growthSummary: null, selectedGrowths: [],
};

const best = (weight: number | null, reps: number | null, seconds: number | null, distanceMeters?: number) =>
  ({ weight, reps, seconds, ...(distanceMeters !== undefined ? { distanceMeters } : {}) });

const w = (key: string, weight: number, reps: number, at = 1_000): BaselineEntry => ({
  exerciseKey: key, kind: "w",
  points: [{ value: weight * (1 + reps / 30), day: "2026-11-01", completedAtMs: at, best: best(weight, reps, null) }],
});

describe("종목별 오늘 목표 — 과거의 나(기준선)에서 계산한다", () => {
  it("중량: 같은 횟수로 목표를 넘는 가장 가벼운 0.5kg 단위 무게", () => {
    // 55kg×12 → 지표 77. 8% 넘으려면 83.16 이상 → 59.5kg×12 (59.5×1.4=83.3)
    const t = buildExerciseTarget(w("페이스풀", 55, 12), 8)!;
    expect(t.fromText).toBe("55kg 12번");
    expect(t.toText).toBe("59.5kg 12번");
    expect(t.target).toEqual({ weightKg: 59.5, reps: 12, durationSec: null, distanceKm: null });
    // 목표를 실제로 넘는지(올림 방향이 맞는지)
    expect(59.5 * (1 + 12 / 30)).toBeGreaterThanOrEqual(77 * 1.08);
  });

  it("중량: 목표%가 작아 올림해도 같은 무게면 최소 0.5kg은 올린다", () => {
    const t = buildExerciseTarget(w("컬", 10, 1), 0.01)!;
    expect(t.target.weightKg).toBe(10.5);
  });

  it("맨몸 횟수: 올림, 그리고 최소 1번은 늘린다", () => {
    const r = (reps: number): BaselineEntry => ({
      exerciseKey: "푸시업", kind: "r",
      points: [{ value: reps, day: "2026-11-01", completedAtMs: 1, best: best(null, reps, null) }],
    });
    expect(buildExerciseTarget(r(10), 5)!.target.reps).toBe(11); // 10.5 → 11
    expect(buildExerciseTarget(r(3), 5)!.target.reps).toBe(4); // 3.15 → 4
    expect(buildExerciseTarget(r(2), 1)!.target.reps).toBe(3); // 2.02 → 3 (올림)
  });

  it("버티기 시간: 올림, 최소 1초", () => {
    const t: BaselineEntry = {
      exerciseKey: "플랭크", kind: "t",
      points: [{ value: 60, day: "2026-11-01", completedAtMs: 1, best: best(null, null, 60) }],
    };
    const got = buildExerciseTarget(t, 8)!;
    expect(got.toText).toBe("65초"); // 64.8 → 65
    expect(got.target.durationSec).toBe(65);
  });

  it("유산소: 같은 시간에 더 멀리 (10m 단위 올림)", () => {
    const c: BaselineEntry = {
      exerciseKey: "트레드밀", kind: "c",
      points: [{ value: 5000, day: "2026-11-01", completedAtMs: 1, best: best(null, null, 1800, 5000) }],
    };
    const got = buildExerciseTarget(c, 8)!;
    expect(got.fromText).toBe("30분 5km");
    expect(got.toText).toBe("30분 5.4km");
    expect(got.target).toEqual({ weightKg: null, reps: null, durationSec: 1800, distanceKm: 5.4 });
  });

  it("값이 비었거나 목표%가 0 이하이면 억지 숫자를 만들지 않는다", () => {
    expect(buildExerciseTarget({ exerciseKey: "x", kind: "w", points: [] }, 8)).toBeNull();
    expect(buildExerciseTarget(w("x", 50, 10), 0)).toBeNull();
    const noWeight: BaselineEntry = {
      exerciseKey: "x", kind: "w",
      points: [{ value: 0, day: "d", completedAtMs: 1, best: best(null, 10, null) }],
    };
    expect(buildExerciseTarget(noWeight, 8)).toBeNull();
  });
});

describe("오늘의 진화 미션", () => {
  const baselines = ["a", "b", "c", "d", "e", "f", "g"].map((k, i) => w(`운동${k}`, 40 + i * 5, 10, 1_000 + i));

  it("못 채운 조건을 서버 판정 그대로 보여 준다 (최근 운동은 진화 뒤 새로 센 값)", () => {
    const m = buildEvolutionMission({ status: baseStatus, baselines, todayKey: "2026-11-22" })!;
    expect(m.nextStageName).toBe("대장");
    expect(m.rows.map((r) => r.key)).toEqual(["xp", "weeks", "recent", "growth_count", "growth_average", "steady"]);
    expect(m.rows.find((r) => r.key === "recent")!.valueText).toBe("2일 → 8일");
    expect(m.growthRequired).toBe(8);
    expect(m.growthFilled).toBe(4);
    expect(m.goalPct).toBe(8);
    expect(m.ready).toBe(false);
  });

  it("오늘 제안은 최대 3종목이고 모두 목표%가 걸려 있다", () => {
    const m = buildEvolutionMission({ status: baseStatus, baselines, todayKey: "2026-11-22" })!;
    expect(m.exercises).toHaveLength(3);
    expect(m.exercises.every((e) => e.goalPct === 8)).toBe(true);
  });

  it("이미 목표 성장률을 넘긴 종목은 제안하지 않는다", () => {
    const status: StageGateStatus = {
      ...baseStatus,
      growthSummary: {
        growths: [{
          exerciseKey: "운동g", kind: "w", baseline: 1, baselineDay: "d", baselineBest: best(70, 10, null),
          current: 2, currentDay: "d", currentBest: best(80, 10, null), growthPct: 9,
        }],
        unchangedCount: 0, unmatched: [], comparableCount: 1, previousStageExerciseCount: 29,
      },
    };
    const names = buildEvolutionMission({ status, baselines, todayKey: "2026-11-22" })!.exercises.map((e) => e.exerciseKey);
    expect(names).not.toContain("운동g");
  });

  it("이미 조금 오른 종목을 먼저 권한다 (가장 쉽게 넘는 종목)", () => {
    const status: StageGateStatus = {
      ...baseStatus,
      growthSummary: {
        growths: [{
          exerciseKey: "운동b", kind: "w", baseline: 1, baselineDay: "d", baselineBest: best(45, 10, null),
          current: 2, currentDay: "d", currentBest: best(47, 10, null), growthPct: 4,
        }],
        unchangedCount: 0, unmatched: [], comparableCount: 1, previousStageExerciseCount: 29,
      },
    };
    // 후보가 7개 → 3개씩 3쪽. 어느 날이든 첫 쪽에는 '운동b'가 맨 앞이어야 하는 날이 있다
    const firstPage = [...Array(3)].map((_, i) =>
      buildEvolutionMission({ status, baselines, todayKey: `2026-11-${String(21 + i).padStart(2, "0")}` })!.exercises[0].exerciseKey,
    );
    expect(firstPage).toContain("운동b");
  });

  it("날이 바뀌면 다음 종목으로 돌아가고, 같은 날은 항상 같다", () => {
    const a1 = buildEvolutionMission({ status: baseStatus, baselines, todayKey: "2026-11-22" })!.exercises.map((e) => e.exerciseKey);
    const a2 = buildEvolutionMission({ status: baseStatus, baselines, todayKey: "2026-11-22" })!.exercises.map((e) => e.exerciseKey);
    const b = buildEvolutionMission({ status: baseStatus, baselines, todayKey: "2026-11-23" })!.exercises.map((e) => e.exerciseKey);
    expect(a2).toEqual(a1);
    expect(b).not.toEqual(a1);
  });

  it("조건을 모두 채웠으면 종목을 제안하지 않고 '채웠어요'라고 말한다", () => {
    const status: StageGateStatus = {
      ...baseStatus, state: "eligible",
      conditions: baseStatus.conditions.map((c) => ({ ...c, met: true })),
    };
    const m = buildEvolutionMission({ status, baselines, todayKey: "2026-11-22" })!;
    expect(m.ready).toBe(true);
    expect(m.exercises).toEqual([]);
    expect(m.headline).toContain("모두 채웠어요");
  });

  it("성장 비교 기준이 아직 없으면 종목을 지어내지 않는다", () => {
    const status: StageGateStatus = { ...baseStatus, state: "needs_baseline", requiredGrowthCount: null };
    const m = buildEvolutionMission({ status, baselines, todayKey: "2026-11-22" })!;
    expect(m.exercises).toEqual([]);
    expect(m.headline).toContain("기준을 모으는 중");
  });

  it("최고 단계·오류 상태에서는 미션이 없다(null)", () => {
    expect(buildEvolutionMission({ status: { ...baseStatus, state: "max_stage", nextStage: null, currentStage: 7 }, baselines, todayKey: "2026-11-22" })).toBeNull();
    expect(buildEvolutionMission({ status: { ...baseStatus, state: "error" }, baselines, todayKey: "2026-11-22" })).toBeNull();
  });

  it("경험치만 보는 단계(2·3단계 진화)는 종목을 제안하지 않는다", () => {
    const status: StageGateStatus = {
      ...baseStatus, mode: "xp_only", currentStage: 2, nextStage: 3, requiredGrowthCount: null,
      conditions: [cond("xp", 8, 11, false)],
    };
    const m = buildEvolutionMission({ status, baselines, todayKey: "2026-11-22" })!;
    expect(m.exercises).toEqual([]);
    expect(m.rows.map((r) => r.key)).toEqual(["xp"]);
  });
});
