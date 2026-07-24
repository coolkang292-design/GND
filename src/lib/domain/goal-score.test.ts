import { describe, expect, it } from "vitest";
import {
  achievementScore,
  completedGoalBonus,
  completedGoalCountOf,
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

describe("completedGoalBonus — 완료(100%) 목표 수 비례, 최대 3개", () => {
  it("0/1/2/3/4개 → 0/3/6/9/9", () => {
    expect(completedGoalBonus(0)).toBe(0);
    expect(completedGoalBonus(1)).toBe(3);
    expect(completedGoalBonus(2)).toBe(6);
    expect(completedGoalBonus(3)).toBe(9);
    expect(completedGoalBonus(4)).toBe(9); // 4개 이상은 3개로 상한
  });
});

describe("completedGoalCountOf — 100% 이상 달성한 목표 수", () => {
  it("달성/미달성 혼합", () => {
    expect(completedGoalCountOf([g(100, 100), g(100, 50), g(100, 120)])).toBe(2);
    expect(completedGoalCountOf([g(100, 99)])).toBe(0);
    expect(completedGoalCountOf([])).toBe(0);
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

  it("종합점수 내림차순 + 완료 목표 수 보너스 반영", () => {
    const ranked = rankParticipants([
      base("A", { goals: [g(100, 50)] }), // ach 50 → overall 60, 완료0 → +0
      base("B", { goals: [g(10, 10), g(20, 20), g(30, 30)] }), // ach 100 → 100, 완료3 → +9
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["B", "A"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[0].overall).toBe(109); // 100 + 완료 3개×3
    expect(ranked[1].overall).toBe(60);
  });

  it("완료 목표가 많을수록 유리 — 달성률·참여율 같아도 완료 3개 > 1개", () => {
    // 둘 다 ach 100·part 100 → overall 100. 완료 목표 수만 다르다.
    const ranked = rankParticipants([
      base("한개", { goals: [g(100, 100)] }), // 완료1 → +3 = 103
      base("세개", { goals: [g(10, 10), g(20, 20), g(30, 30)] }), // 완료3 → +9 = 109
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["세개", "한개"]);
    expect(ranked[0].overall).toBe(109);
    expect(ranked[1].overall).toBe(103);
  });

  it("동점 1차: 완료 목표 수 같을 때 평균 달성률 높은 쪽 우선", () => {
    // 둘 다 완료 1개 → 보너스 +3 동일. overall 83로 동점.
    // A: ach75(2개 중 1개 완료)·part100 → 80  / B: ach100·part0 → 80
    const ranked = rankParticipants([
      base("A", { goals: [g(100, 100), g(100, 50)], workoutDays: 20, plannedDays: 20 }),
      base("B", { goals: [g(100, 100)], workoutDays: 0, plannedDays: 20 }),
    ]);
    expect(ranked[0].overall).toBeCloseTo(ranked[1].overall);
    expect(ranked.map((r) => r.userId)).toEqual(["B", "A"]); // 달성률 B(100) > A(75)
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
