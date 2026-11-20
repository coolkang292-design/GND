import { describe, expect, it } from "vitest";
import {
  TIE_BREAKERS,
  TIE_BREAKERS_V2,
  TIE_STEPS_V2,
  addGoalAdvice,
  goalPointGuide,
  stageGuide,
  mustKnow,
  scoreCards,
  scoreFormula,
  tieRules,
} from "./challenge-rules-copy";
import { rankParticipantsV2, type ParticipantInputV2 } from "./goal-score-v2";
import {
  COMPLETED_GOAL_BONUS_MAX,
  COMPLETED_GOAL_BONUS_PER,
  achievementScore,
  ACHIEVEMENT_WEIGHT,
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

  it("새 유산소 규칙은 11/3 이후 시작하는 챌린지에만 말한다 — 그 전에 시작한 챌린지에는 거짓이다", () => {
    expect(mustKnow({ photoRequired: false, startDate: "2026-10-27" }).join("\n")).not.toContain("싸이클");
    expect(mustKnow({ photoRequired: false, startDate: "2026-11-14" }).join("\n")).toContain("싸이클 시간");
  });

  it("시작 후에는 올리기만 된다고 말한다 — '언제든지'는 거짓이다", () => {
    const t = mustKnow({ photoRequired: false, startDate: "2026-11-14" }).join("\n");
    expect(t).toContain("올리는 것만");
    expect(t).not.toContain("언제든지");
  });
});

describe("랭킹 v2 동점 설명 — rankParticipantsV2와 같은 순서 (scoring_version 2)", () => {
  const goal = (type: "workout_days" | "weight_days" | "bodyweight_days", target: number, actual: number) => ({
    type,
    target,
    actual,
  });
  const p = (over: Partial<ParticipantInputV2> & { userId: string }): ParticipantInputV2 => ({
    goals: [goal("workout_days", 10, 10)],
    workoutDays: 10,
    plannedDays: 10,
    allGoalsCompletedAtMs: 1000,
    workoutSessions: 10,
    workoutMinutes: 300,
    minutesComplete: true,
    ...over,
  });

  it("v2 설명은 세 단계(운동한 날 수 → 운동 횟수 → 운동 시간)다", () => {
    expect(TIE_BREAKERS_V2).toHaveLength(3);
    expect(TIE_STEPS_V2).toHaveLength(3);
    expect(tieRules(2).breakers).toBe(TIE_BREAKERS_V2);
    expect(tieRules(1).breakers).toBe(TIE_BREAKERS); // 옛 챌린지는 옛 설명
  });

  it("기본 점수가 같으면 ① 운동한 날이 더 많은 사람이 앞선다 — 목표를 더 많이 걸어도 소용없다 (설명 첫 줄)", () => {
    // 두 사람 모두 달성 100%·참여율 100%(계획일 10 이상). 목표 수는 many가 더 많지만 날은 적다.
    const few = p({ userId: "few", goals: [goal("workout_days", 10, 10)], workoutDays: 12 });
    const many = p({
      userId: "many",
      goals: [goal("workout_days", 10, 10), goal("weight_days", 8, 8)],
      workoutDays: 10,
    });
    const r = rankParticipantsV2([few, many]);
    // 완료 보너스(개당 +3)가 달라 기본 점수가 갈리면 이 사례가 성립하지 않는다 — 같은 개수로 맞춘다
    const same = rankParticipantsV2([
      p({ userId: "few", goals: [goal("workout_days", 10, 10), goal("weight_days", 8, 8)], workoutDays: 12 }),
      p({ userId: "many", goals: [goal("workout_days", 10, 10), goal("weight_days", 8, 8)], workoutDays: 10 }),
    ]);
    expect(same[0].baseScore).toBe(same[1].baseScore); // 먼저 동점이어야 설명이 맞는 상황이다
    expect(same.map((x) => x.userId)).toEqual(["few", "many"]);
    expect(r[0].baseScore).not.toBe(r[1].baseScore); // 목표 수 차이는 보너스로 이미 점수에 들어 있다
    expect(TIE_BREAKERS_V2[0]).toContain("운동한 날");
  });

  it("v2는 활동 점수 카드와 총점 공식을 더한다 — v1에는 없다", () => {
    const v2 = scoreCards(2);
    expect(v2).toHaveLength(scoreCards(1).length + 1);
    expect(v2[v2.length - 1].body).toContain("운동한 날 1일에 1점 · 운동 1회에 1점 · 운동 60분에 1점");
    expect(scoreFormula(2)).toContain("활동 점수");
    expect(scoreFormula(1)).not.toContain("활동 점수");
  });

  it("v2 목표 추가 안내는 동점이 목표 수가 아니라 꾸준함으로 갈린다고 말한다 — v1에는 없다", () => {
    expect(addGoalAdvice(2).good).toContain("목표 수가 아니라 운동한 날 수·횟수·시간");
    expect(addGoalAdvice(2).good).not.toContain("목표를 더 많이 설정한 사람이 앞서요");
    expect(addGoalAdvice(1).good).not.toContain("운동한 날 수");
  });

  it("v2 챌린지는 목표 3개 이상 필요하다고 알린다 (minDetailGoals 규칙과 같은 말)", () => {
    const v2 = mustKnow({ photoRequired: false, startDate: "2026-11-14", scoringVersion: 2 });
    const v1 = mustKnow({ photoRequired: false, startDate: "2026-11-14", scoringVersion: 1 });
    expect(v2.some((l) => l.includes("3개 이상"))).toBe(true);
    expect(v1.some((l) => l.includes("3개 이상"))).toBe(false);
  });
});

/**
 * 목표를 세운 뒤 마지막 설명 — "내 목표로는 이렇게 올라요" (사용자 지시 2026-11-17).
 * 화면의 숫자가 실제 점수 계산(`achievementScore`)과 같은지를 **계산 함수로** 묶는다.
 */
describe("내 목표별 점수 안내 — 실제 계산과 같은 숫자", () => {
  // 나(오뎅끼데스까)의 11월 챌린지 목표 5개와 같은 모양
  const goals = [
    { type: "cardio_days" as const, target: 13, qualifier: 1 },
    { type: "cardio_time" as const, target: 386 },
    { type: "tabata_count" as const, target: 13 },
    { type: "weight_days" as const, target: 13, qualifier: 3 },
    { type: "workout_days" as const, target: 13 },
  ];
  const guide = goalPointGuide({ goals, weeklyDays: 3, periodDays: 30, scoringVersion: 2 });

  it("목표 하나를 예시 만큼 올리면 실제 종합점수가 그만큼 오른다 (일수형 1일 = 80÷5÷13 = 1.2)", () => {
    const row = guide.rows.find((r) => r.type === "tabata_count")!;
    const scored = (actual: number) =>
      achievementScore(goals.map((g) => ({ type: g.type, target: g.target, actual: g.type === "tabata_count" ? actual : 0 }))) *
      ACHIEVEMENT_WEIGHT;
    expect(row.points).toBeCloseTo(scored(1) - scored(0), 1);
    expect(row.points).toBe(1.2);
  });

  it("시간 목표는 30분 기준, 거리 목표는 5km 기준으로 말한다", () => {
    expect(guide.rows.find((r) => r.type === "cardio_time")!.amount).toBe("30분");
    const withDistance = goalPointGuide({ goals: [{ type: "cardio_distance", target: 45 }], weeklyDays: 3, periodDays: 30, scoringVersion: 2 });
    expect(withDistance.rows[0].amount).toBe("5km");
    // 목표 1개면 80점 ÷ 1 ÷ 45km × 5km
    expect(withDistance.rows[0].points).toBeCloseTo(((80 / 45) * 5), 1);
  });

  it("목표를 넘는 만큼은 안 오르므로 예시가 목표보다 크면 목표까지만 센다", () => {
    const small = goalPointGuide({ goals: [{ type: "cardio_time", target: 20 }], weeklyDays: 3, periodDays: 30, scoringVersion: 2 });
    expect(small.rows[0].points).toBe(80); // 30분 예시가 목표 20분을 넘어도 100%까지만
  });

  it("작은 목표일수록 한 번에 더 크게 오른다 — 초보자가 바로 느끼는 점수", () => {
    const easy = goalPointGuide({ goals: [{ type: "workout_days", target: 4 }], weeklyDays: 1, periodDays: 28, scoringVersion: 2 });
    const hard = goalPointGuide({ goals: [{ type: "workout_days", target: 13 }], weeklyDays: 3, periodDays: 30, scoringVersion: 2 });
    expect(easy.rows[0].points).toBeGreaterThan(hard.rows[0].points);
  });

  it("하루 평균은 (달성 80 + 꾸준함 20) ÷ 계획한 날 수 — 주 3회 × 30일 = 13일이면 약 7.7점", () => {
    expect(guide.plannedDays).toBe(13);
    expect(guide.perDay).toBe(7.7);
    expect(guide.baseMax).toBe(100 + COMPLETED_GOAL_BONUS_PER * COMPLETED_GOAL_BONUS_MAX);
  });

  it("목표가 없으면 아무 줄도 만들지 않는다", () => {
    expect(goalPointGuide({ goals: [], weeklyDays: 3, periodDays: 30, scoringVersion: 2 }).rows).toEqual([]);
  });
});

describe("진행 중 / 최종 발표 단계 안내 — 활동 점수는 진행 중에도 총점에 더한다 (2026-11-20)", () => {
  it("v2는 진행 중에도 최종에도 '기본 점수 + 활동 점수 = 총점'으로 순위를 매긴다고 말한다", () => {
    const stages = stageGuide(2);
    expect(stages).toHaveLength(2);
    expect(stages[0].when).toBe("진행 중·최종");
    expect(stages[0].text).toContain("109점"); // 100 + 보너스 최대 9 — 상수에서 온다
    expect(stages[0].text).toContain("총점");
    expect(stages[0].text).toContain("운동한 날 1일에 1점");
    expect(stages[1].text).toContain("계속");
  });

  it("옛 안내('진행 중에는 기본 점수로만', '최종 발표 때만')는 없어졌다 — 제거는 부정 확인으로 묶는다", () => {
    const all = stageGuide(2).map((x) => `${x.when} ${x.text}`).join(" ");
    expect(all).not.toContain("기본 점수로 순위를 매겨요");
    expect(all).not.toContain("최종 발표 때만");
    expect(stageGuide(2).some((x) => x.when === "진행 중")).toBe(false);
  });

  it("v1(옛 규칙)은 활동 점수를 말하지 않는다 — 진행 중인 경기에 새 규칙을 말하면 거짓이다", () => {
    const stages = stageGuide(1);
    expect(stages.map((x) => x.text).join(" ")).not.toContain("활동 점수");
  });
});
