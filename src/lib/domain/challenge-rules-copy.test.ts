import { describe, expect, it } from "vitest";
import {
  TIE_BREAKERS,
  addGoalAdvice,
  mustKnow,
  scoreCards,
  scoreFormula,
} from "./challenge-rules-copy";
import {
  COMPLETED_GOAL_BONUS_MAX,
  COMPLETED_GOAL_BONUS_PER,
  overallScore,
  rankParticipants,
  type ParticipantInput,
} from "./goal-score";

describe("챌린지 규칙 설명 — 실제 계산과 같은 숫자를 말한다", () => {
  it("80·20·+3·최대 3개가 계산 상수에서 나온다", () => {
    const text = scoreCards().map((c) => `${c.title} ${c.body}`).join(" ");
    expect(text).toContain("80점");
    expect(text).toContain("20점");
    expect(text).toContain(`+${COMPLETED_GOAL_BONUS_PER}점`);
    expect(text).toContain(`${COMPLETED_GOAL_BONUS_MAX}개`);
    expect(scoreFormula()).toContain("0.8");
    expect(scoreFormula()).toContain("0.2");
  });

  it("설명한 비중이 실제 종합점수 계산과 같다 (달성 100·꾸준함 0 → 80)", () => {
    expect(overallScore(100, 0)).toBe(80);
    expect(overallScore(0, 100)).toBe(20);
  });

  it("목표 추가 안내는 좋은 점과 조심할 점을 둘 다 말한다", () => {
    const a = addGoalAdvice();
    expect(a.good).toContain("+3점");
    expect(a.careful).toContain("평균");
  });
});

describe("동점 순서 설명 — rankParticipants의 비교 사슬과 같은 순서", () => {
  const goal = (target: number, actual: number) => ({
    type: "workout_days" as const,
    target,
    actual,
  });
  const p = (over: Partial<ParticipantInput> & { userId: string }): ParticipantInput => ({
    goals: [goal(10, 10)],
    workoutDays: 10,
    plannedDays: 10,
    allGoalsCompletedAtMs: 1000,
    ...over,
  });

  it("설명은 네 단계 + 공동 순위다", () => {
    expect(TIE_BREAKERS).toHaveLength(4);
  });

  it("종합점수가 같으면 ③ 모든 목표를 먼저 채운 사람이 앞선다 (설명 3번째)", () => {
    const r = rankParticipants([
      p({ userId: "late", allGoalsCompletedAtMs: 2000 }),
      p({ userId: "early", allGoalsCompletedAtMs: 1000 }),
    ]);
    expect(r.map((x) => x.userId)).toEqual(["early", "late"]);
    expect(TIE_BREAKERS[2]).toContain("먼저");
  });

  it("완전히 같으면 공동 순위다", () => {
    const r = rankParticipants([p({ userId: "a" }), p({ userId: "b" })]);
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(1);
  });
});

describe("꼭 알아둘 약속", () => {
  it("사진 필수 챌린지만 사진 문구가 있다", () => {
    expect(mustKnow({ photoRequired: true, startDate: "2026-11-03" }).join("\n")).toContain("사진을 올린");
    expect(mustKnow({ photoRequired: false, startDate: "2026-11-03" }).join("\n")).not.toContain("사진을 올린");
  });

  it("새 유산소 규칙은 11/12 이후 시작하는 챌린지에만 말한다 — 진행 중 챌린지에는 거짓이다", () => {
    expect(mustKnow({ photoRequired: false, startDate: "2026-11-03" }).join("\n")).not.toContain("사이클");
    expect(mustKnow({ photoRequired: false, startDate: "2026-11-14" }).join("\n")).toContain("사이클 시간");
  });

  it("시작 후에는 올리기만 된다고 말한다 — '언제든지'는 거짓이다", () => {
    const t = mustKnow({ photoRequired: false, startDate: "2026-11-14" }).join("\n");
    expect(t).toContain("올리는 것만");
    expect(t).not.toContain("언제든지");
  });
});
