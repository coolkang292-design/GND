import { describe, expect, it } from "vitest";
import {
  analyzeWorkout,
  normalizeExerciseName,
  setIntervalMetrics,
  type AnalysisExercise,
  type AnalysisSet,
  type HistorySession,
} from "./workout-analysis";

const T0 = Date.parse("2026-09-28T10:00:00Z");

/** 무게·반복 세트. 간격을 주면 기기 완료 시각을 그 간격으로 찍는다 */
function sets(
  weightKg: number,
  reps: number[],
  opts: { intervalSec?: number; effort?: AnalysisSet["effort"] } = {},
): AnalysisSet[] {
  return reps.map((r, i) => ({
    weightKg,
    reps: r,
    durationSec: 0,
    distanceM: 0,
    done: true,
    effort: i === reps.length - 1 ? (opts.effort ?? null) : null,
    clientCompletedAtMs:
      opts.intervalSec === undefined ? null : T0 + i * opts.intervalSec * 1000,
  }));
}

function weightEx(name: string, s: AnalysisSet[]): AnalysisExercise {
  return { name, type: "weight", measure: null, sets: s };
}

function history(...exercises: AnalysisExercise[][]): HistorySession[] {
  return exercises.map((ex, i) => ({
    completedAtMs: T0 - (i + 1) * 86_400_000 * 2,
    exercises: ex,
  }));
}

function run(opts: {
  current: AnalysisExercise[];
  history?: HistorySession[];
  goal?: Parameters<typeof analyzeWorkout>[0]["goal"];
  effort?: Parameters<typeof analyzeWorkout>[0]["sessionEffort"];
  flags?: Parameters<typeof analyzeWorkout>[0]["flags"];
}) {
  return analyzeWorkout({
    session: { durationMinutes: 60, exercises: opts.current },
    history: opts.history ?? [],
    goal: opts.goal ?? "hypertrophy",
    sessionEffort: opts.effort ?? null,
    flags: opts.flags ?? [],
  });
}

describe("normalizeExerciseName", () => {
  it("공백과 대소문자만 무시한다 — 같은 종목이 띄어쓰기로 갈리지 않게", () => {
    expect(normalizeExerciseName("덤벨 숄더 프레스")).toBe(
      normalizeExerciseName("덤벨숄더프레스"),
    );
    expect(normalizeExerciseName(" Lat  Pulldown ")).toBe("latpulldown");
  });

  it("별칭까지 합치지는 않는다 (V1 범위 밖)", () => {
    expect(normalizeExerciseName("DB Shoulder Press")).not.toBe(
      normalizeExerciseName("덤벨 숄더 프레스"),
    );
  });
});

describe("A. 과거 기록이 없는 사용자", () => {
  it("기준선만 만들고 향상·하락을 주장하지 않는다", () => {
    const result = run({ current: [weightEx("벤치프레스", sets(60, [10, 10, 10]))] });
    expect(result.primary).toBe("baseline");
    expect(result.exercises[0].signal).toBe("baseline");
    expect(result.exercises[0].previous).toBeNull();
    expect(result.exercises[0].action).toBe("observe");
    expect(result.exercises[0].deltas.reps).toBeNull();
    expect(result.session.comparableVolumeDeltaPct).toBeNull();
  });
});

describe("B. 같은 무게에서 반복이 늘었다", () => {
  it("14kg 10/10/8/8 → 10/10/9/9 는 총 +2회 진전이다", () => {
    const result = run({
      current: [weightEx("덤벨 숄더 프레스", sets(14, [10, 10, 9, 9]))],
      history: history([weightEx("덤벨숄더프레스", sets(14, [10, 10, 8, 8]))]),
      effort: "on_target",
    });
    const ex = result.exercises[0];
    expect(ex.signal).toBe("progress");
    expect(ex.deltas.reps).toBe(2);
    expect(ex.deltas.loadKg).toBe(0);
    expect(ex.reasons).toContain("reps_up");
    expect(result.primary).toBe("progress");
    // 목표 반복(근비대 12회)을 못 채웠으니 무게는 유지한다
    expect(ex.action).toBe("maintain");
  });

  it("볼륨 변화율을 계산한다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 10, 10]))],
      history: history([weightEx("벤치프레스", sets(60, [10, 10, 5]))]),
    });
    // 1800 vs 1500 → +20%
    expect(result.exercises[0].deltas.volumePct).toBeCloseTo(20);
    expect(result.session.comparableVolumeDeltaPct).toBeCloseTo(20);
  });
});

describe("C. 반복은 같고 세트 간격이 짧아졌다 (V1의 템포 대체 신호)", () => {
  it("보조 신호로만 남기고 그것만으로 증량하지 않는다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 10, 10], { intervalSec: 90 }))],
      history: history([
        weightEx("벤치프레스", sets(60, [10, 10, 10], { intervalSec: 120 })),
      ]),
      effort: "on_target",
    });
    const ex = result.exercises[0];
    expect(ex.signal).toBe("stable");
    expect(ex.reasons).toContain("interval_shorter");
    expect(ex.deltas.intervalSec).toBe(-30);
    expect(ex.action).not.toBe("increase_candidate");
  });
});

describe("D. 피로 신호", () => {
  it("같은 무게·같은 반복인데 체감이 '너무 힘듦'이면 피로 신호, 증량 금지", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 10, 10]))],
      history: history([weightEx("벤치프레스", sets(60, [10, 10, 10]))]),
      effort: "too_heavy",
    });
    const ex = result.exercises[0];
    expect(ex.signal).toBe("fatigue_signal");
    expect(ex.action).toBe("decrease_candidate");
    expect(result.primary).toBe("fatigue_signal");
  });

  it("반복이 줄고 세트 간격이 크게 늘었으면 체감 없이도 피로 신호다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 8, 6], { intervalSec: 180 }))],
      history: history([
        weightEx("벤치프레스", sets(60, [10, 10, 10], { intervalSec: 100 })),
      ]),
    });
    const ex = result.exercises[0];
    expect(ex.signal).toBe("fatigue_signal");
    expect(ex.action).toBe("recover");
  });

  it("반복만 줄고 다른 근거가 없으면 단정하지 않는다 (stable)", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 9, 8]))],
      history: history([weightEx("벤치프레스", sets(60, [10, 10, 10]))]),
    });
    expect(result.exercises[0].signal).toBe("stable");
    expect(result.exercises[0].reasons).toContain("reps_down");
  });
});

describe("H. 의심스러운 타이머", () => {
  it("운동 끝에 몰아서 체크(1초 간격)한 세트는 suspect — 판단에 쓰지 않는다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 10, 10], { intervalSec: 1 }))],
      history: history([
        weightEx("벤치프레스", sets(60, [10, 10, 10], { intervalSec: 120 })),
      ]),
    });
    const ex = result.exercises[0];
    expect(ex.current.setInterval.reliability).toBe("suspect");
    expect(ex.current.setInterval.avgSec).toBeNull();
    expect(ex.deltas.intervalSec).toBeNull();
    expect(ex.reasons).not.toContain("interval_shorter");
  });

  it("15분 넘게 방치한 간격도 suspect다", () => {
    const metrics = setIntervalMetrics(sets(60, [10, 10], { intervalSec: 1200 }));
    expect(metrics.reliability).toBe("suspect");
  });

  it("시각이 없으면 missing", () => {
    expect(setIntervalMetrics(sets(60, [10, 10])).reliability).toBe("missing");
  });

  it("일부만 이상하면 정상 간격만 평균낸다", () => {
    const s = sets(60, [10, 10, 10, 10], { intervalSec: 100 });
    s[3].clientCompletedAtMs = s[2].clientCompletedAtMs! + 2_000; // 마지막만 몰아 체크
    const metrics = setIntervalMetrics(s);
    expect(metrics.reliability).toBe("valid");
    expect(metrics.avgSec).toBe(100);
    expect(metrics.validSamples).toBe(2);
  });
});

describe("다음 행동 후보", () => {
  it("목표 반복을 모두 채우고 체감이 적당 이하면 증량 후보", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [12, 12, 12]))],
      history: history([weightEx("벤치프레스", sets(60, [12, 11, 10]))]),
      effort: "light",
    });
    expect(result.exercises[0].targetReached).toBe(true);
    expect(result.exercises[0].action).toBe("increase_candidate");
  });

  it("체감을 모르면 증량 후보를 내지 않는다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [12, 12, 12]))],
      history: history([weightEx("벤치프레스", sets(60, [12, 11, 10]))]),
    });
    expect(result.exercises[0].action).toBe("maintain");
    expect(result.exercises[0].reasons).toContain("effort_unknown");
  });

  it("세트에 남긴 체감이 세션 체감보다 우선한다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [12, 12, 12], { effort: "too_heavy" }))],
      history: history([weightEx("벤치프레스", sets(60, [12, 12, 12]))]),
      effort: "light",
    });
    expect(result.exercises[0].effort).toBe("too_heavy");
    expect(result.exercises[0].action).not.toBe("increase_candidate");
  });
});

describe("목표에 따라 같은 기록을 다르게 읽는다", () => {
  const current = [weightEx("스쿼트", sets(100, [6, 6, 6]))];
  const past = history([weightEx("스쿼트", sets(100, [6, 6, 5]))]);

  it("근력 목표에서 6회는 목표 달성이다", () => {
    const result = run({ current, history: past, goal: "strength", effort: "on_target" });
    expect(result.exercises[0].targetReached).toBe(true);
    expect(result.exercises[0].action).toBe("increase_candidate");
  });

  it("근비대 목표에서 6회는 아직 반복을 늘릴 때다", () => {
    const result = run({ current, history: past, goal: "hypertrophy", effort: "on_target" });
    expect(result.exercises[0].targetReached).toBe(false);
    expect(result.exercises[0].action).toBe("maintain");
  });
});

describe("안전 — 통증·컨디션 신고", () => {
  it("통증이 있으면 어떤 종목도 증량 후보가 되지 않는다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [12, 12, 12]))],
      history: history([weightEx("벤치프레스", sets(60, [12, 11, 10]))]),
      effort: "light",
      flags: ["pain"],
    });
    expect(result.safety.progressionBlocked).toBe(true);
    expect(result.safety.reasons).toEqual(["pain"]);
    expect(result.exercises[0].action).not.toBe("increase_candidate");
    expect(result.exercises[0].reasons).toContain("safety_blocked");
  });

  it("시간 부족·기구 문제는 안전 차단 사유가 아니다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10]))],
      flags: ["short_time", "equipment_unavailable"],
    });
    expect(result.safety.progressionBlocked).toBe(false);
  });
});

describe("무게 변화", () => {
  it("무게를 올리고 반복이 조금 줄었으면 진전이다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(62.5, [10, 9, 8]))],
      history: history([weightEx("벤치프레스", sets(60, [10, 10, 10]))]),
    });
    expect(result.exercises[0].signal).toBe("progress");
    expect(result.exercises[0].reasons).toContain("load_up");
    expect(result.exercises[0].deltas.loadKg).toBe(2.5);
  });

  it("무게를 올렸지만 반복이 크게 무너졌으면 진전이라 하지 않는다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(70, [5, 4, 3]))],
      history: history([weightEx("벤치프레스", sets(60, [10, 10, 10]))]),
    });
    expect(result.exercises[0].signal).not.toBe("progress");
  });
});

describe("맨몸·시간형·유산소", () => {
  it("맨몸 운동에는 체중을 곱한 가짜 볼륨을 만들지 않는다", () => {
    const result = run({
      current: [
        {
          name: "푸시업",
          type: "bodyweight",
          measure: "reps",
          sets: sets(0, [20, 20]),
        },
      ],
      history: history([
        { name: "푸시업", type: "bodyweight", measure: "reps", sets: sets(0, [15, 15]) },
      ]),
    });
    const ex = result.exercises[0];
    expect(ex.current.volumeKg).toBeNull();
    expect(ex.signal).toBe("progress");
    expect(result.session.bodyweightReps).toBe(40);
    expect(result.session.weightVolumeKg).toBe(0);
  });

  it("플랭크는 총 시간으로 비교한다", () => {
    const hold = (sec: number[]): AnalysisSet[] =>
      sec.map((s) => ({
        weightKg: 0,
        reps: 0,
        durationSec: s,
        distanceM: 0,
        done: true,
        effort: null,
        clientCompletedAtMs: null,
      }));
    const result = run({
      current: [{ name: "플랭크", type: "bodyweight", measure: "time", sets: hold([60, 60]) }],
      history: history([
        { name: "플랭크", type: "bodyweight", measure: "time", sets: hold([45, 45]) },
      ]),
    });
    expect(result.exercises[0].signal).toBe("progress");
    expect(result.exercises[0].reasons).toContain("duration_up");
  });

  it("러닝은 페이스가 빨라지면 진전이다", () => {
    const run5k = (sec: number): AnalysisSet[] => [
      {
        weightKg: 0,
        reps: 0,
        durationSec: sec,
        distanceM: 5000,
        done: true,
        effort: null,
        clientCompletedAtMs: null,
      },
    ];
    const result = run({
      current: [{ name: "러닝", type: "cardio", measure: null, sets: run5k(1500) }],
      history: history([{ name: "러닝", type: "cardio", measure: null, sets: run5k(1650) }]),
    });
    const ex = result.exercises[0];
    expect(ex.current.paceSecPerKm).toBe(300);
    expect(ex.signal).toBe("progress");
    expect(ex.reasons).toContain("pace_faster");
  });
});

describe("집계 규칙", () => {
  it("완료하지 않은 세트는 아무 지표에도 들어가지 않는다", () => {
    const s = sets(60, [10, 10, 10]);
    s[2].done = false;
    const result = run({ current: [weightEx("벤치프레스", s)] });
    expect(result.exercises[0].current.completedSets).toBe(2);
    expect(result.exercises[0].current.volumeKg).toBe(1200);
  });

  it("완료 세트가 하나도 없는 종목은 분석에서 뺀다", () => {
    const s = sets(60, [10]);
    s[0].done = false;
    const result = run({ current: [weightEx("벤치프레스", s)] });
    expect(result.exercises).toHaveLength(0);
    expect(result.primary).toBe("baseline");
  });

  it("직전 기록은 그 종목이 **있는** 가장 최근 세션이다", () => {
    const result = run({
      current: [weightEx("벤치프레스", sets(60, [10, 10]))],
      history: history(
        [weightEx("스쿼트", sets(100, [5]))],
        [weightEx("벤치프레스", sets(55, [10, 10]))],
        [weightEx("벤치프레스", sets(50, [10, 10]))],
      ),
    });
    const ex = result.exercises[0];
    expect(ex.previous?.topWeightKg).toBe(55);
    expect(ex.trend.map((t) => t.topWeightKg)).toEqual([55, 50]);
  });
});
