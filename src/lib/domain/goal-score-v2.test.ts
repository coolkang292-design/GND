import { describe, expect, it } from "vitest";
import { rankParticipants, type GoalType } from "./goal-score";
import {
  ACTIVITY_MINUTES_PER_POINT,
  ACTIVITY_POINT_PER_DAY,
  ACTIVITY_POINT_PER_SESSION,
  allocateCents,
  buildScoreBreakdown,
  buildTieBreakExplanation,
  calculateActivityPoints,
  calculateTieBonusUnits,
  compareTieBreakMetrics,
  formatScoreV2,
  getConfiguredGoalCount,
  rankParticipantsV2,
  TIE_BREAK_RULE_TEXT,
  toCents,
  type ParticipantInputV2,
} from "./goal-score-v2";

/**
 * 기본 점수를 원하는 값으로 만들기 쉽게: 목표 N개 달성률 = rate, 참여율 100%(계획일 10, 기본 운동일 10).
 * ⚠️ 총점 = 기본 점수 + 활동 점수(1일=1점·1회=1점·60분=1점)라서, 활동량이 다르면 총점도 다르다.
 *    동점 판정을 따로 시험하려면 총점이 **같은** 조합(날 12+횟수 8 = 날 11+횟수 9 = 20)을 쓴다.
 */
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

describe("비교 키: 운동한 날 수 > 횟수 > 시간", () => {
  const m = (days: number, sessions: number, minutes: number) => ({ days, sessions, minutes });
  it("운동한 날 수가 횟수·시간보다 우선", () => {
    expect(compareTieBreakMetrics(m(12, 1, 10), m(11, 99, 9999), true)).toBeLessThan(0);
  });
  it("횟수가 시간보다 우선", () => {
    expect(compareTieBreakMetrics(m(10, 20, 100), m(10, 19, 9999), true)).toBeLessThan(0);
  });
  it("날 수·횟수가 같으면 시간으로 가른다", () => {
    expect(compareTieBreakMetrics(m(10, 20, 900), m(10, 20, 800), true)).toBeLessThan(0);
  });
  it("시간을 못 쓰면 시간 단계는 건너뛰고 같다고 본다", () => {
    expect(compareTieBreakMetrics(m(10, 20, 900), m(10, 20, 100), false)).toBe(0);
  });
  it("규칙 문구 상수가 이 순서를 말한다", () => {
    expect(TIE_BREAK_RULE_TEXT).toBe("운동한 날 수 → 운동 횟수 → 운동 시간");
  });
});

describe("활동 점수: 1일=1점 · 1회=1점 · 60분=1점", () => {
  it("환산 비율 상수", () => {
    expect(ACTIVITY_POINT_PER_DAY).toBe(1);
    expect(ACTIVITY_POINT_PER_SESSION).toBe(1);
    expect(ACTIVITY_MINUTES_PER_POINT).toBe(60);
  });
  it("날·횟수·시간을 각각 점수로 바꿔 더한다 (11월 방 오뎅끼데스까 기록)", () => {
    const a = calculateActivityPoints({ days: 12, sessions: 13, minutes: 439 });
    expect(a.days).toBe(12);
    expect(a.sessions).toBe(13);
    expect(a.minutes).toBe(7.32); // 439 ÷ 60 = 7.3166… → 소수 둘째 자리
    expect(a.total).toBe(32.32);
    expect(a.cents).toBe(3232);
  });
  it("기록이 없으면 0점, 음수·NaN은 0으로 본다", () => {
    expect(calculateActivityPoints({ days: 0, sessions: 0, minutes: 0 }).cents).toBe(0);
    expect(calculateActivityPoints({ days: -3, sessions: Number.NaN, minutes: -10 }).cents).toBe(0);
  });
  it("총점 = 기본 점수 + 활동 점수", () => {
    const b = buildScoreBreakdown(p("A", { ratePct: 80, workoutDays: 10, sessions: 4, minutes: 120 }));
    expect(b.activity.total).toBe(10 + 4 + 2);
    expect(b.totalScoreCents).toBe(b.baseScoreCents + 1600);
  });
  it("목표를 다 채운 뒤에도 운동할수록 점수가 계속 오른다 (핵심 요구)", () => {
    const done = p("A", { ratePct: 100, workoutDays: 10, sessions: 10, minutes: 300 });
    const more = { ...done, workoutSessions: 11, workoutMinutes: 360 };
    const a = rankParticipantsV2([done])[0];
    const b = rankParticipantsV2([more])[0];
    expect(a.baseScore).toBe(b.baseScore); // 기본 점수는 만점에서 멈춘다
    expect(b.totalScore).toBeGreaterThan(a.totalScore); // 총점은 계속 오른다
    expect(b.totalScore - a.totalScore).toBeCloseTo(2, 5); // 1회(1점) + 60분(1점)
  });
  it("기본 점수가 낮아도 활동량이 충분히 많으면 총점으로 앞선다", () => {
    const r = rankParticipantsV2([
      p("steady", { ratePct: 60, workoutDays: 20, sessions: 30, minutes: 1800 }), // 활동 80점
      p("goal", { ratePct: 100, workoutDays: 10, sessions: 10, minutes: 300 }), // 활동 25점
    ]);
    expect(r.find((x) => x.userId === "steady")!.rank).toBe(1);
  });
  it("목표를 낮게 걸어도 이득이 없다 — 활동 점수는 목표와 무관하다", () => {
    const low = p("low", { types: ["workout_days"], ratePct: 100, workoutDays: 10, sessions: 5 });
    const high = p("high", { types: ["workout_days", "weight_days", "bodyweight_days"], ratePct: 100, workoutDays: 10, sessions: 12 });
    const r = rankParticipantsV2([low, high]);
    expect(r.find((x) => x.userId === "high")!.rank).toBe(1);
  });
});

describe("기간 중에는 기본 점수만 · 활동 점수는 최종 발표에서만 (includeActivity)", () => {
  it("진행 중: 활동량이 아무리 많아도 기본 점수가 높은 쪽이 앞선다", () => {
    const list = [
      p("steady", { ratePct: 60, workoutDays: 20, sessions: 30, minutes: 1800 }),
      p("goal", { ratePct: 100, workoutDays: 10, sessions: 10, minutes: 300 }),
    ];
    const live = rankParticipantsV2(list, { includeActivity: false });
    expect(live.find((x) => x.userId === "goal")!.rank).toBe(1);
    const fin = rankParticipantsV2(list, { includeActivity: true });
    expect(fin.find((x) => x.userId === "steady")!.rank).toBe(1); // 같은 기록, 최종 발표에서만 뒤집힌다
  });
  it("진행 중 점수는 기본 점수 그대로이고 활동 점수는 순위 점수에 안 들어간다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80, workoutDays: 12, sessions: 8, minutes: 600 })], { includeActivity: false })[0];
    expect(r.totalScore).toBe(r.baseScore);
    expect(r.activityIncluded).toBe(false);
    expect(r.activityScore).toBeGreaterThan(0); // 계산은 해 두되 화면이 쓰지 않는다
    expect(r.finalScoreUnits).toBe(Math.round(r.baseScore * 100) * 10000 + r.tieBonusUnits);
  });
  it("진행 중 동점: 기본 점수가 같으면 날 수 → 횟수 → 시간으로 가른다", () => {
    const r = rankParticipantsV2(
      [p("A", { ratePct: 80, workoutDays: 12, sessions: 0 }), p("B", { ratePct: 80, workoutDays: 11, sessions: 40, minutes: 9000 })],
      { includeActivity: false },
    );
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r[0].tieBreak.kind).toBe("days");
    expect(buildTieBreakExplanation(r.find((x) => x.userId === "A")!, r, (id) => id)!.lines.join(" ")).toContain("기본 점수는");
  });
  it("includeActivity를 생략하면 최종 발표(true)로 본다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80, sessions: 5 })])[0];
    expect(r.activityIncluded).toBe(true);
    expect(r.totalScore).toBeCloseTo(r.baseScore + r.activityScore, 5);
  });
});

describe("지시서 §3.7 사례 (총점이 같을 때만 동점 규칙)", () => {
  // 총점을 같게 만들기 위해 달성률·참여율·활동 점수 합을 동일하게 둔다.
  const same = { ratePct: 80 };

  it("A: 총점이 다르면 목표를 더 많이 걸어도 진다 — 가산점 0", () => {
    const hi = p("A", { types: ["workout_days", "weight_days"], ratePct: 100 }); // 목표 2개, 높은 점수
    const lo = p("B", { types: ["workout_days", "weight_days", "cardio_time", "volume"], ratePct: 99 });
    const r = rankParticipantsV2([lo, hi]);
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r.every((x) => x.tieBonusUnits === 0 && x.tieGroupSize === 1)).toBe(true);
    expect(r.every((x) => x.tieBreak.kind === "none")).toBe(true);
  });

  it("0.01점 차이는 가산점으로 못 뒤집는다 (경계)", () => {
    // 한 목표를 0.05%p 올리면 평균 +0.0167 → ×0.8 = +0.0133점 → 센트로 딱 한 칸(84.00 → 84.01) 차이
    const a = p("A", { types: ["workout_days", "weight_days", "cardio_time"], ratePct: 80 });
    const b = { ...p("B", { types: ["workout_days", "weight_days", "cardio_time"], ratePct: 80 }) };
    b.goals = b.goals.map((g, i) => (i === 0 ? { ...g, actual: 80.05 } : g));
    const r = rankParticipantsV2([a, b]);
    const ra = r.find((x) => x.userId === "A")!;
    const rb = r.find((x) => x.userId === "B")!;
    expect(rb.totalScore).toBeGreaterThan(ra.totalScore);
    expect(rb.rank).toBe(1);
    expect(ra.tieBonusUnits).toBe(0);
  });

  it("B: 총점 같고 운동한 날 12 vs 11 → 날 수가 많은 쪽(횟수가 적어도)", () => {
    // 날 12 + 횟수 8 = 날 11 + 횟수 9 = 20점
    const r = rankParticipantsV2([
      p("A", { ...same, workoutDays: 12, sessions: 8 }),
      p("B", { ...same, workoutDays: 11, sessions: 9 }),
    ]);
    expect(r[0].totalScore).toBe(r[1].totalScore); // 먼저 동점이어야 이 사례가 성립한다
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r.find((x) => x.userId === "B")!.rank).toBe(2);
    expect(r[0].tieBreak.kind).toBe("days");
  });

  it("목표를 더 많이 설정해도 동점 판정에는 영향이 없다 (보너스가 이미 점수에 들어 있다)", () => {
    const t4 = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as GoalType[];
    const t3 = ["workout_days", "weight_days", "bodyweight_days"] as GoalType[];
    const rk = ranks([
      p("A", { ...same, types: t4, workoutDays: 9, sessions: 11 }),
      p("B", { ...same, types: t3, workoutDays: 10, sessions: 10 }),
    ]);
    expect(rk).toEqual({ B: 1, A: 2 });
  });

  it("C: 날 수 같으면 횟수 (15 < 18)", () => {
    // 날 10 + 횟수 15 + 시간 180분(3점) = 날 10 + 횟수 18 = 28점
    const rk = ranks([
      p("A", { ...same, workoutDays: 10, sessions: 15, minutes: 180 }),
      p("B", { ...same, workoutDays: 10, sessions: 18 }),
    ]);
    expect(rk).toEqual({ B: 1, A: 2 });
  });

  it("D: 날·횟수 같고 시간이 0.01점 안쪽으로만 다르면 시간으로 가른다", () => {
    // 100분 = 1.67점, 100.2분 = 1.67점(둘 다 167센트) → 총점은 같고 시간만 다르다
    const rk = ranks([
      p("A", { ...same, workoutDays: 10, sessions: 15, minutes: 100 }),
      p("B", { ...same, workoutDays: 10, sessions: 15, minutes: 100.2 }),
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
    // 날 + 횟수 = 15로 맞춘다
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, workoutDays: 10, sessions: 5 }),
      p("B", { ratePct: 80, types: t4, workoutDays: 12, sessions: 3 }),
      p("C", { ratePct: 80, types: t3, workoutDays: 11, sessions: 4 }),
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
      p("A", { ratePct: 80, types: t3, workoutDays: 10, sessions: 2 }),
      p("B", { ratePct: 80, types: t4, workoutDays: 9, sessions: 3 }),
      p("C", { ratePct: 80, types: t3, workoutDays: 10, sessions: 2 }),
      p("D", { ratePct: 20, types: t3 }),
    ];
    const a = JSON.stringify(rankParticipantsV2(list).map((r) => [r.userId, r.rank, r.finalScoreUnits]));
    const b = JSON.stringify(rankParticipantsV2([...list].reverse()).map((r) => [r.userId, r.rank, r.finalScoreUnits]));
    expect(a).toBe(b);
  });

  it("운동한 날 수가 이미 갈리면 시간 누락은 영향 없다(시간 건너뜀 표시만 켜진다)", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t4, workoutDays: 12, sessions: 8, minutesComplete: false }),
      p("B", { ratePct: 80, types: t3, workoutDays: 11, sessions: 9 }),
    ]);
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r[0].tieBreak.kind).toBe("days");
    expect(r[0].tieBreak.minutesSkipped).toBe(true);
  });

  it("날 수·횟수·총점이 같고 시간 기록이 비면 시간을 비교하지 않아 공동 순위다", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, sessions: 5, minutes: 100, minutesComplete: false }),
      p("B", { ratePct: 80, types: t3, sessions: 5, minutes: 100.2 }),
    ]);
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
    expect(r[0].tieBreak.kind).toBe("all_equal");
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
  it("활동량이 같고 동점이 없으면 v2의 순서는 v1과 같다 (기본 점수 순)", () => {
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
  it("운동한 날 수로 갈리면 실제 일수가 문구에 들어간다", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t4, workoutDays: 12, sessions: 8 }),
      p("B", { ratePct: 80, types: t3, workoutDays: 11, sessions: 9 }),
    ]);
    const e = buildTieBreakExplanation(r.find((x) => x.userId === "A")!, r, name)!;
    const text = e.lines.join(" ");
    expect(text).toContain("12일");
    expect(text).toContain("11일");
    expect(text).toContain(r[0].totalScore.toFixed(2));
  });
  it("횟수로 갈리면 회가, 시간으로 갈리면 분이 들어간다", () => {
    const rs = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, sessions: 18 }),
      p("B", { ratePct: 80, types: t3, sessions: 15, minutes: 180 }),
    ]);
    expect(buildTieBreakExplanation(rs[0], rs, name)!.lines.join(" ")).toContain("18회");
    const rm = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, sessions: 4, minutes: 120.2 }),
      p("B", { ratePct: 80, types: t3, sessions: 4, minutes: 120 }),
    ]);
    expect(buildTieBreakExplanation(rm[0], rm, name)!.lines.join(" ")).toContain("120분");
  });
  it("완전 동점은 공동 순위를 말한다", () => {
    const r = rankParticipantsV2([p("A", { ratePct: 80 }), p("B", { ratePct: 80 })]);
    expect(buildTieBreakExplanation(r[0], r, name)!.lines.join(" ")).toContain("공동 1위");
  });
  it("시간 기록이 비어 공동이 되면 그 이유를 말한다", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t3, minutes: 100, minutesComplete: false }),
      p("B", { ratePct: 80, types: t3, minutes: 100.2 }),
    ]);
    expect(buildTieBreakExplanation(r[0], r, name)!.lines.join(" ")).toContain("운동 시간 기록을 확인할 수 없어");
  });
  it("가산점이 있으면 소수 여섯째 자리, 없으면 둘째 자리로 표시", () => {
    const r = rankParticipantsV2([
      p("A", { ratePct: 80, types: t4, workoutDays: 12, sessions: 8 }),
      p("B", { ratePct: 80, types: t3, workoutDays: 11, sessions: 9 }),
    ]);
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
