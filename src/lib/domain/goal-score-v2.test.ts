import { describe, expect, it } from "vitest";
import { rankParticipants, type GoalType } from "./goal-score";
import {
  allocateCents,
  buildScoreBreakdown,
  buildTieBreakExplanation,
  calculateTieBonusUnits,
  compareTieBreakMetrics,
  formatScoreV2,
  getConfiguredGoalCount,
  rankParticipantsV2,
  toCents,
  type ParticipantInputV2,
} from "./goal-score-v2";

/** 기본 점수를 원하는 값으로 만들기 쉽게: 목표 1개(workout_days) 달성률 = rate, 참여율 100% */
function p(
  userId: string,
  o: {
    types?: GoalType[];
    /** 달성률(%) — 모든 목표에 같은 값 */
    ratePct?: number;
    minutes?: number;
    sessions?: number;
    minutesComplete?: boolean;
    workoutDays?: number;
  } = {},
): ParticipantInputV2 {
  const types = o.types ?? ["workout_days", "weight_days", "bodyweight_days"];
  return {
    userId,
    goals: types.map((type) => ({ type, target: 100, actual: o.ratePct ?? 100 })),
    workoutDays: o.workoutDays ?? 10,
    plannedDays: 10,
    workoutMinutes: o.minutes ?? 0,
    workoutSessions: o.sessions ?? 0,
    minutesComplete: o.minutesComplete ?? true,
  };
}

const ranks = (list: ParticipantInputV2[]) =>
  Object.fromEntries(rankParticipantsV2(list).map((r) => [r.userId, r.rank]));

describe("정수화", () => {
  it("toCents: .5는 올리고 부동소수 오차에 안 흔들린다", () => {
    expect(toCents(95.254)).toBe(9525);
    expect(toCents(95.256)).toBe(9526);
    expect(toCents(95.255)).toBe(9526);
    expect(toCents(0.1 + 0.2 + 95)).toBe(9530);
  });
  it("allocateCents: 항목 합이 항상 총합과 같다", () => {
    const parts = [40.974, 7.691, 0];
    const total = toCents(parts.reduce((a, b) => a + b, 0));
    const out = allocateCents(parts, total);
    expect(out.reduce((a, b) => a + b, 0)).toBe(total);
  });
});

describe("설정 목표 수", () => {
  it("cardio_days는 안 세고 중복 종류는 한 번만 센다", () => {
    expect(
      getConfiguredGoalCount([
        { type: "workout_days" },
        { type: "cardio_time" },
        { type: "cardio_days" },
        { type: "weight_days" },
        { type: "weight_days" },
      ]),
    ).toBe(3);
  });
  it("DB 행 5개(cardio_days 포함) = 설정 4개", () => {
    expect(
      getConfiguredGoalCount(
        (["cardio_days", "cardio_time", "tabata_count", "weight_days", "workout_days"] as GoalType[]).map(
          (type) => ({ type }),
        ),
      ),
    ).toBe(4);
  });
});

describe("가산점 단위", () => {
  it("K=1이면 0, K=2면 9000/0, K=3이면 9000/4500/0", () => {
    expect(calculateTieBonusUnits(1, 0)).toBe(0);
    expect([0, 1].map((i) => calculateTieBonusUnits(2, i))).toEqual([9000, 0]);
    expect([0, 1, 2].map((i) => calculateTieBonusUnits(3, i))).toEqual([9000, 4500, 0]);
  });
  it("어떤 K에서도 9000을 넘지 않는다 (0.01점=10000단위를 못 뒤집는다)", () => {
    for (let k = 1; k <= 50; k++) {
      for (let i = 0; i < k; i++) {
        expect(calculateTieBonusUnits(k, i)).toBeLessThanOrEqual(9000);
        expect(calculateTieBonusUnits(k, i)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("비교 키: 목표 수 > 시간 > 횟수", () => {
  const m = (goals: number, minutes: number, sessions: number) => ({ goals, minutes, sessions });
  it("목표 수가 시간보다 우선", () => {
    expect(compareTieBreakMetrics(m(4, 500, 1), m(3, 800, 99), true)).toBeLessThan(0);
  });
  it("시간이 횟수보다 우선", () => {
    expect(compareTieBreakMetrics(m(4, 800, 1), m(4, 700, 99), true)).toBeLessThan(0);
  });
  it("시간을 못 쓰면 횟수로 넘어간다", () => {
    expect(compareTieBreakMetrics(m(4, 100, 20), m(4, 900, 10), false)).toBeLessThan(0);
  });
});

describe("지시서 §3.7 사례", () => {
  // 기본 점수를 같게 만들기 위해 모든 사례에서 달성률·참여율을 동일하게 둔다.
  const same = { ratePct: 80 };

  it("A: 기본 점수가 다르면 목표를 더 많이 걸어도 진다 — 가산점 0", () => {
    const hi = p("A", { types: ["workout_days", "weight_days"], ratePct: 100 }); // 목표 2개, 높은 점수
    const lo = p("B", { types: ["workout_days", "weight_days", "cardio_time", "volume"], ratePct: 99, minutes: 9999, sessions: 99 });
    const r = rankParticipantsV2([lo, hi]);
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r.every((x) => x.tieBonusUnits === 0 && x.tieGroupSize === 1)).toBe(true);
    expect(r.every((x) => x.tieBreak.kind === "none")).toBe(true);
  });

  it("0.01점 차이는 가산점으로 못 뒤집는다 (경계)", () => {
    // 한 목표를 0.05%p 올리면 평균 +0.0167 → ×0.8 = +0.0133점 → 센트로 딱 한 칸(84.00 → 84.01) 차이
    const a = p("A", { types: ["workout_days", "weight_days", "cardio_time"], ratePct: 80, minutes: 1, sessions: 1 });
    const b = { ...p("B", { types: ["workout_days", "weight_days", "cardio_time"], ratePct: 80, minutes: 9999, sessions: 99 }) };
    b.goals = b.goals.map((g, i) => (i === 0 ? { ...g, actual: 80.05 } : g));
    const r = rankParticipantsV2([a, b]);
    const ra = r.find((x) => x.userId === "A")!;
    const rb = r.find((x) => x.userId === "B")!;
    expect(rb.baseScore).toBeGreaterThan(ra.baseScore);
    expect(rb.rank).toBe(1);
    expect(ra.tieBonusUnits).toBe(0);
  });

  it("B: 점수 같고 목표 4 vs 3 → 목표 많은 쪽(시간이 적어도)", () => {
    const r = rankParticipantsV2([
      p("A", { ...same, types: ["workout_days", "weight_days", "bodyweight_days", "cardio_time"], minutes: 500 }),
      p("B", { ...same, types: ["workout_days", "weight_days", "bodyweight_days"], minutes: 800 }),
    ]);
    // 기본 점수가 같아야 이 사례가 성립한다
    expect(r[0].baseScore).toBe(r[1].baseScore);
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r.find((x) => x.userId === "B")!.rank).toBe(2);
    expect(r[0].tieBreak.kind).toBe("goals");
  });

  it("C: 목표 수 같으면 시간 (700 < 800)", () => {
    const t = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as GoalType[];
    const rk = ranks([
      p("A", { ...same, types: t, minutes: 700, sessions: 99 }),
      p("B", { ...same, types: t, minutes: 800, sessions: 1 }),
    ]);
    expect(rk).toEqual({ B: 1, A: 2 });
  });

  it("D: 목표 수·시간 같으면 횟수 (15 < 18)", () => {
    const t = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as GoalType[];
    const rk = ranks([
      p("A", { ...same, types: t, minutes: 800, sessions: 15 }),
      p("B", { ...same, types: t, minutes: 800, sessions: 18 }),
    ]);
    expect(rk).toEqual({ B: 1, A: 2 });
  });

  it("E: 전부 같으면 공동 순위, 다음은 3위", () => {
    const t = ["workout_days", "weight_days", "bodyweight_days"] as GoalType[];
    const rk = ranks([
      p("A", { ...same, types: t, minutes: 10, sessions: 3 }),
      p("B", { ...same, types: t, minutes: 10, sessions: 3 }),
      p("C", { ratePct: 10, types: t }),
    ]);
    expect(rk).toEqual({ A: 1, B: 1, C: 3 });
  });
});

describe("동점 그룹 처리", () => {
  const t4 = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as GoalType[];
  const t3 = ["workout_days", "weight_days", "bodyweight_days"] as GoalType[];

  it("3명 동점이면 가산점 9000 / 4500 / 0", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, minutes: 1 }),
      p("B", { ratePct: 80, types: t4, minutes: 1 }),
      p("C", { ratePct: 80, types: t3, minutes: 5 }),
    ]);
    const u = Object.fromEntries(r.map((x) => [x.userId, x.tieBonusUnits]));
    expect(u).toEqual({ B: 9000, C: 4500, A: 0 });
  });

  it("동점 그룹 밖 사람은 가산점 0", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t4 }),
      p("B", { ratePct: 80, types: t3 }),
      p("C", { ratePct: 30, types: t4, minutes: 9999 }),
    ]);
    expect(r.find((x) => x.userId === "C")!.tieBonusUnits).toBe(0);
    expect(r.find((x) => x.userId === "C")!.tieGroupSize).toBe(1);
  });

  it("입력 순서가 달라도 결과가 같다", () => {
    const list = [
      p("A", { ratePct: 80, types: t3, minutes: 1, sessions: 2 }),
      p("B", { ratePct: 80, types: t4, minutes: 1, sessions: 1 }),
      p("C", { ratePct: 80, types: t3, minutes: 1, sessions: 2 }),
      p("D", { ratePct: 20, types: t3 }),
    ];
    const a = JSON.stringify(rankParticipantsV2(list).map((r) => [r.userId, r.rank, r.finalScoreUnits]));
    const b = JSON.stringify(rankParticipantsV2([...list].reverse()).map((r) => [r.userId, r.rank, r.finalScoreUnits]));
    expect(a).toBe(b);
  });

  it("한 명이라도 시간 기록이 비면 그룹은 시간을 건너뛰고 횟수로 정한다", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, minutes: 900, sessions: 5, minutesComplete: false }),
      p("B", { ratePct: 80, types: t3, minutes: 100, sessions: 9, minutesComplete: true }),
    ]);
    expect(r.find((x) => x.userId === "B")!.rank).toBe(1);
    expect(r[0].tieBreak.kind).toBe("sessions");
    expect(r[0].tieBreak.minutesSkipped).toBe(true);
  });

  it("목표 수가 이미 갈리면 시간 누락은 영향 없다(시간 건너뜀 표시만 켜진다)", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t4, minutesComplete: false }),
      p("B", { ratePct: 80, types: t3 }),
    ]);
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r[0].tieBreak.kind).toBe("goals");
  });
});

describe("점수 구성", () => {
  it("항목 합 = 기본 점수 (반올림 배분)", () => {
    for (const rate of [51.21, 33.333, 77.77, 99.999, 100, 0]) {
      const b = buildScoreBreakdown(p("A", { ratePct: rate, workoutDays: 5 }));
      const sum = b.achievementPoints + b.participationPoints + b.completionBonus;
      expect(Math.round(sum * 100)).toBe(b.baseScoreCents);
    }
  });
  it("cardio_days는 점수 평균에는 들어가고 auto 표시가 붙는다", () => {
    const b = buildScoreBreakdown(p("A", { types: ["workout_days", "cardio_time", "cardio_days"], ratePct: 50 }));
    expect(b.goals).toHaveLength(3);
    expect(b.goals.filter((g) => g.auto)).toHaveLength(1);
    expect(b.configuredGoalCount).toBe(2);
  });
});

describe("v1과의 관계", () => {
  it("동점이 없으면 v2의 순서는 v1과 같다 (기본 점수 순)", () => {
    const list = [
      p("A", { ratePct: 90 }),
      p("B", { ratePct: 60 }),
      p("C", { ratePct: 75 }),
    ];
    const v2 = rankParticipantsV2(list).map((r) => r.userId);
    const v1 = rankParticipants(list).map((r) => r.userId);
    expect(v2).toEqual(v1);
  });
});

describe("표시·설명", () => {
  const t4 = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as GoalType[];
  const t3 = ["workout_days", "weight_days", "bodyweight_days"] as GoalType[];
  const name = (id: string) => (id === "A" ? "나" : id);

  it("동점이 아니면 설명이 없다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 90 }), p("B", { ratePct: 10 })]);
    expect(buildTieBreakExplanation(r[0], r, name)).toBeNull();
  });
  it("목표 수로 갈리면 실제 개수가 문구에 들어간다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80, types: t4 }), p("B", { ratePct: 80, types: t3 })]);
    const e = buildTieBreakExplanation(r.find((x) => x.userId === "A")!, r, name)!;
    const text = e.lines.join(" ");
    expect(text).toContain("4개");
    expect(text).toContain("3개");
    expect(text).toContain(r[0].baseScore.toFixed(2));
  });
  it("시간으로 갈리면 분이, 횟수로 갈리면 회가 들어간다", () => {
    const rm = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, minutes: 800 }),
      p("B", { ratePct: 80, types: t3, minutes: 720 }),
    ]);
    expect(buildTieBreakExplanation(rm[0], rm, name)!.lines.join(" ")).toContain("800분");
    const rs = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, minutes: 10, sessions: 18 }),
      p("B", { ratePct: 80, types: t3, minutes: 10, sessions: 15 }),
    ]);
    expect(buildTieBreakExplanation(rs[0], rs, name)!.lines.join(" ")).toContain("18회");
  });
  it("완전 동점은 공동 순위를 말한다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80 }), p("B", { ratePct: 80 })]);
    expect(buildTieBreakExplanation(r[0], r, name)!.lines.join(" ")).toContain("공동 1위");
  });
  it("가산점이 있으면 소수 여섯째 자리, 없으면 둘째 자리로 표시", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80, types: t4 }), p("B", { ratePct: 80, types: t3 })]);
    expect(formatScoreV2(r[0])).toMatch(/^\d+\.\d{6}$/);
    expect(formatScoreV2(r[1])).toMatch(/^\d+\.\d{2}$/);
  });
});

describe("주격 조사", () => {
  it("나→내가, 받침 있으면 이, 없으면 가", async () => {
    const { subjectOf } = await import("./goal-score-v2");
    expect(subjectOf(["나"])).toBe("내가");
    expect(subjectOf(["아라짱"])).toBe("아라짱이");
    expect(subjectOf(["스칼레또"])).toBe("스칼레또가");
    expect(subjectOf(["아라짱", "민수"])).toBe("아라짱·민수가");
  });
});
