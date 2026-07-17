import { describe, expect, it } from "vitest";
import {
  achievementScore,
  gndLabel,
  goalRate,
  overallScore,
  participationScore,
  plannedDaysForPeriod,
  rankParticipants,
  type ParticipantInput,
  type ScoredGoal,
} from "./goal-score";

const g = (target: number, actual: number): ScoredGoal => ({
  type: "volume",
  target,
  actual,
});

describe("goalRate — 종류 정규화 (실적/목표)", () => {
  it("0% / 50% / 100% / 120% / 150%", () => {
    expect(goalRate(100, 0)).toBe(0);
    expect(goalRate(100, 50)).toBe(0.5);
    expect(goalRate(100, 100)).toBe(1);
    expect(goalRate(100, 120)).toBeCloseTo(1.2);
    expect(goalRate(100, 150)).toBeCloseTo(1.5);
  });

  it("목표 0 이하는 0 처리 (0 나눗셈 방지)", () => {
    expect(goalRate(0, 50)).toBe(0);
    expect(goalRate(-5, 50)).toBe(0);
  });
});

describe("achievementScore — 목표들의 % 평균, 각 100% 상한", () => {
  it("단일 목표 초과 달성은 100점 상한 (어뷰징 억제)", () => {
    expect(achievementScore([g(100, 150)])).toBe(100);
  });

  it("다중 목표는 합이 아니라 평균 (개수 중립)", () => {
    // 100% + 50% → 평균 75
    expect(achievementScore([g(100, 100), g(100, 50)])).toBe(75);
    // 목표 1개 100%인 사람과 3개 100%인 사람은 같은 점수
    expect(achievementScore([g(10, 10)])).toBe(
      achievementScore([g(10, 10), g(20, 20), g(30, 30)]),
    );
  });

  it("초과분은 평균에 못 들어간다 — 120%와 100%는 동일 기여", () => {
    expect(achievementScore([g(100, 120), g(100, 0)])).toBe(50);
  });

  it("목표 없음 → 0", () => {
    expect(achievementScore([])).toBe(0);
  });
});

describe("participationScore — 실제 운동일/계획일, 100% 상한", () => {
  it("0% / 50% / 100% / 초과 상한", () => {
    expect(participationScore(0, 20)).toBe(0);
    expect(participationScore(10, 20)).toBe(50);
    expect(participationScore(20, 20)).toBe(100);
    expect(participationScore(25, 20)).toBe(100);
  });

  it("계획일 0 이하는 0 처리", () => {
    expect(participationScore(5, 0)).toBe(0);
  });
});

describe("overallScore — achievement×0.8 + participation×0.2", () => {
  it("가중 합", () => {
    expect(overallScore(100, 100)).toBe(100);
    expect(overallScore(100, 0)).toBe(80);
    expect(overallScore(0, 100)).toBe(20);
    expect(overallScore(75, 50)).toBe(70);
  });
});

describe("plannedDaysForPeriod — 주 N일 → 기간 계획일 환산", () => {
  it("주5일 × 28일 기간 = 20일", () => {
    expect(plannedDaysForPeriod(5, 28)).toBe(20);
  });

  it("주3일 × 31일 = 13일 (반올림)", () => {
    expect(plannedDaysForPeriod(3, 31)).toBe(13);
  });

  it("최소 1일 보장", () => {
    expect(plannedDaysForPeriod(1, 3)).toBe(1);
  });
});

describe("rankParticipants — 종합점수 순위 + 동점 규칙 (§7)", () => {
  const base = (
    userId: string,
    partial: Partial<ParticipantInput>,
  ): ParticipantInput => ({
    userId,
    goals: [g(100, 100)],
    workoutDays: 20,
    plannedDays: 20,
    allGoalsCompletedAtMs: null,
    ...partial,
  });

  it("종합점수 내림차순, 목표 개수 달라도 공평 비교", () => {
    const ranked = rankParticipants([
      base("A", { goals: [g(100, 50)] }), // ach 50 → overall 60
      base("B", { goals: [g(10, 10), g(20, 20), g(30, 30)] }), // ach 100 → 100
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["B", "A"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[0].overall).toBe(100);
    expect(ranked[1].overall).toBe(60);
  });

  it("동점 1차: 평균 달성률 높은 쪽 우선", () => {
    // A: ach 90, part 100 → 92 / B: ach 100, part 60 → 92
    const ranked = rankParticipants([
      base("A", { goals: [g(100, 90)], workoutDays: 20 }),
      base("B", { goals: [g(100, 100)], workoutDays: 12 }),
    ]);
    expect(ranked[0].overall).toBeCloseTo(ranked[1].overall);
    expect(ranked.map((r) => r.userId)).toEqual(["B", "A"]);
    expect(ranked[1].rank).toBe(2);
  });

  it("동점 3차: 먼저 전 목표 달성한 시각 (빠른 쪽 우선, 미달성 null은 뒤)", () => {
    const ranked = rankParticipants([
      base("느림", { allGoalsCompletedAtMs: 2000 }),
      base("빠름", { allGoalsCompletedAtMs: 1000 }),
      base("미달성", { allGoalsCompletedAtMs: null }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["빠름", "느림", "미달성"]);
  });

  it("완전 동점은 공동 순위 (다음 순위는 건너뜀)", () => {
    const ranked = rankParticipants([base("A", {}), base("B", {}), base("C", { goals: [g(100, 0)] })]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it("completedGoalCount 집계 (100% 이상 목표 수)", () => {
    const ranked = rankParticipants([
      base("A", { goals: [g(100, 120), g(100, 99)] }),
    ]);
    expect(ranked[0].completedGoalCount).toBe(1);
  });
});

describe("gndLabel — 시상대 등급 (표시용)", () => {
  it("1위=탈출, 꼴찌=확정, 중간=탈출중", () => {
    expect(gndLabel(1, 4)).toBe("GND 탈출!");
    expect(gndLabel(2, 4)).toBe("GND 탈출중");
    expect(gndLabel(4, 4)).toBe("GND 확정");
  });

  it("2인 크루: 1위 탈출, 2위 확정", () => {
    expect(gndLabel(1, 2)).toBe("GND 탈출!");
    expect(gndLabel(2, 2)).toBe("GND 확정");
  });

  it("1인이면 항상 탈출", () => {
    expect(gndLabel(1, 1)).toBe("GND 탈출!");
  });
});
