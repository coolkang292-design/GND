import { describe, expect, it } from "vitest";
import {
  STAGE_RULES, countSteadyWindows, evaluateStageGate, getStageGrowthGoal, parseStageGateStatus,
  type GateInput,
} from "./evolution-gate";

/** 2026-01-05는 월요일(KST 달력 주의 시작). */
const MON = "2026-01-05";
const day = (offset: number, from = MON) => new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
/** 연속 n일 */
const run = (n: number, from = MON) => Array.from({ length: n }, (_, i) => day(i, from));
/** 월요일 기준 w주차(0부터)에 요일 offsets 만큼 운동 */
const week = (w: number, ...dow: number[]) => dow.map(d => day(w * 7 + d));
const weeks = (pattern: number[]) => pattern.flatMap((n, w) => week(w, ...Array.from({ length: n }, (_, i) => i * 2)));

describe("진화 성장 목표", () => {
  it.each([1, 2])("현재%d단계는 시동러까지 XP만으로 진화", current => {
    expect(getStageGrowthGoal(current, null)).toMatchObject({ mode: "xp_only" });
  });
  it("시동러→꾸준러 진입부터 M18의15%=3종목·평균3%", () => {
    expect(getStageGrowthGoal(3, 18)).toMatchObject({ mode: "growth_preview", nextStage: 4,
      requiredCount: 3, averageTargetPct: 3 });
  });
  it("꾸준러→불꽃러는4종목·평균5%, 대장 25%·+8%, 전설 30%·+10%", () => {
    expect(getStageGrowthGoal(4, 18)).toMatchObject({ requiredCount: 4, averageTargetPct: 5 });
    expect(getStageGrowthGoal(5, 18)).toMatchObject({ requiredCount: 5, averageTargetPct: 8 });
    expect(getStageGrowthGoal(6, 18)).toMatchObject({ requiredCount: 6, averageTargetPct: 10 });
  });
  it("M이 없으면 최소1개로 임의 통과시키지 않고 기준 준비 상태", () => {
    expect(getStageGrowthGoal(3, null)).toMatchObject({ mode: "needs_baseline" });
  });
  it("최종 단계에는 다음 성장 관문을 만들지 않는다", () => {
    expect(getStageGrowthGoal(7, 18)).toEqual({ mode: "complete", nextStage: null });
  });
});

describe("규칙표(사용자 확정 2026-11-13)", () => {
  it("4·5단계는 운동일만, 6·7단계는 경과 주만 습관으로 쓴다", () => {
    expect(STAGE_RULES[4].habit).toEqual({ kind: "days", required: 36 });
    expect(STAGE_RULES[5].habit).toEqual({ kind: "days", required: 60 });
    expect(STAGE_RULES[6].habit).toEqual({ kind: "weeks", required: 40 });
    expect(STAGE_RULES[7].habit).toEqual({ kind: "weeks", required: 60 });
  });
  it("2·3단계는 XP만, 평균·비율·미션·대체 경로가 없다", () => {
    for (const s of [2, 3]) expect(STAGE_RULES[s]).toMatchObject({ mode: "xp_only", habit: null, averagePct: null,
      growthRatio: null, steadyRequired: 0, alternate: null });
  });
  it("대체 경로: 4=54일, 5=90일(미션 면제), 6=미션4회, 7=미션6회", () => {
    expect(STAGE_RULES[4].alternate).toEqual({ kind: "days", required: 54, exemptsSteady: false });
    expect(STAGE_RULES[5].alternate).toEqual({ kind: "days", required: 90, exemptsSteady: true });
    expect(STAGE_RULES[6].alternate).toEqual({ kind: "steady", required: 4 });
    expect(STAGE_RULES[7].alternate).toEqual({ kind: "steady", required: 6 });
  });
  it("미션·최근활동: 5=1회, 6=2회+28중8, 7=3회+42중12", () => {
    expect(STAGE_RULES[4].steadyRequired).toBe(0);
    expect(STAGE_RULES[5].steadyRequired).toBe(1);
    expect(STAGE_RULES[6]).toMatchObject({ steadyRequired: 2, recent: { windowDays: 28, days: 8 } });
    expect(STAGE_RULES[7]).toMatchObject({ steadyRequired: 3, recent: { windowDays: 42, days: 12 } });
  });
});

describe("꾸준함 1회 = 연속 4개 달력 주 중 3주 이상에서 서로 다른 운동일 2일 이상", () => {
  const today = (w: number) => day(w * 7 + 6); // w주차 일요일
  it("4주 모두 충족 = 1회", () => expect(countSteadyWindows(weeks([2, 2, 2, 2]), MON, today(3))).toBe(1));
  it("4주 중 3주 충족 = 1회(어느 주가 비어도)", () => {
    for (const p of [[2, 2, 2, 0], [0, 2, 2, 2], [2, 0, 2, 2], [2, 2, 0, 2]])
      expect(countSteadyWindows(weeks(p), MON, today(3))).toBe(1);
  });
  it("2주만 충족 = 0회, 한 주 1일은 충족이 아니다", () => {
    expect(countSteadyWindows(weeks([2, 2, 0, 0]), MON, today(3))).toBe(0);
    expect(countSteadyWindows(weeks([2, 2, 1, 1]), MON, today(3))).toBe(0);
  });
  it("구간은 겹치지 않게 센다: 8주 연속 = 2회, 7주 연속 = 1회", () => {
    expect(countSteadyWindows(weeks([2, 2, 2, 2, 2, 2, 2, 2]), MON, today(7))).toBe(2);
    expect(countSteadyWindows(weeks([2, 2, 2, 2, 2, 2, 2]), MON, today(6))).toBe(1);
  });
  it("앞에서부터 탐욕적으로: 공백 뒤에는 한 주씩 밀어 첫 충족 구간을 찾는다", () => {
    // 0 0 2 2 2 2 2 2: w0 구간(0,0,2,2)=2주 ✗ → w1(0,2,2,2)=3 ✓(주1~4) → 다음 w5(2,2,2,?)는 끝 주 8 > 7 ✗
    expect(countSteadyWindows(weeks([0, 0, 2, 2, 2, 2, 2, 2]), MON, today(7))).toBe(1);
  });
  it("아직 끝나지 않은 구간(마지막 주가 오늘 이후)은 세지 않는다", () => {
    expect(countSteadyWindows(weeks([2, 2, 2]), MON, today(2))).toBe(0);
  });
  it("현재 주가 구간의 마지막 주면 그 주가 아직 덜 찼어도 앞 3주로 인정", () => {
    expect(countSteadyWindows(weeks([2, 2, 2]), MON, day(21))).toBe(1); // 4주차 월요일, 그 주 운동 0
  });
  it("월요일 00:00 경계: 일요일과 월요일은 서로 다른 주", () => {
    // 일요일(6)+다음 월요일(7)은 서로 다른 주에 1일씩이라 어느 주도 충족하지 못한다.
    expect(countSteadyWindows([day(6), day(7), day(13), day(14), day(20), day(21)], MON, today(3))).toBe(0);
    expect(countSteadyWindows([day(0), day(6), day(7), day(13), day(14), day(20)], MON, today(3))).toBe(1);
  });
  it("진입 주의 부분 주: 진입일 이전 운동은 세지 않는다", () => {
    const since = day(2); // 수요일 진입
    // 월·화(진입 전) + 수 1일 = 진입 주는 1일뿐 → 미충족, 나머지 3주 충족해도 3주 필요
    const days = [day(0), day(1), day(2), ...weeks([0, 2, 2, 2]).filter(d => d > day(6))];
    expect(countSteadyWindows(days, since, today(3))).toBe(1);
    expect(countSteadyWindows([day(0), day(1), day(2), ...weeks([0, 2, 2, 0]).filter(d => d > day(6))], since, today(3))).toBe(0);
  });
  it("같은 날 여러 번 운동은 1일", () => {
    const dup = [...week(0, 0, 0, 0, 0), ...week(1, 0, 2), ...week(2, 0, 2), ...week(3, 0, 2)];
    expect(countSteadyWindows(dup, MON, today(3))).toBe(1); // 0주차는 중복 4개지만 1일 → 미충족, 나머지 3주 충족
    expect(countSteadyWindows([...week(0, 0, 0), ...week(1, 0, 0), ...week(2, 0, 0), ...week(3, 0, 0)], MON, today(3))).toBe(0);
  });
  it("진입일이 없거나 운동이 없으면 0회", () => {
    expect(countSteadyWindows([], MON, today(3))).toBe(0);
    expect(countSteadyWindows(weeks([2, 2, 2, 2]), null, today(3))).toBe(0);
  });
});

describe("진화 판정 evaluateStageGate", () => {
  const growthOk = { filled: 4, required: 4, averagePct: 20 };
  const base = (over: Partial<GateInput>): GateInput => ({
    level: 40, workoutDays: [], today: day(400), stageEnteredDay: MON, growth: growthOk, ...over,
  });
  const end = (n: number) => run(n, day(400 - n + 1)); // today(day 400)까지 이어지는 연속 n일

  it("목표 2·3은 XP(레벨)만 보고 습관·성장·미션과 무관하게 통과", () => {
    expect(evaluateStageGate(2, base({ level: 6, workoutDays: [], growth: { filled: 0, required: null, averagePct: null } })).state).toBe("eligible");
    expect(evaluateStageGate(3, base({ level: 10, workoutDays: [], growth: { filled: 0, required: null, averagePct: null } })).state).toBe("blocked");
    expect(evaluateStageGate(3, base({ level: 11 })).state).toBe("eligible");
  });
  it("4단계: 운동 35일 보류, 36일 통과(성장 충족 시)", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(35) })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(36) })).state).toBe("eligible");
  });
  it("4단계: 경과 주는 보지 않는다(36일이 짧은 기간에 몰려도 통과)", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(36) })).conditions.map(c => c.key)).not.toContain("weeks");
  });
  it("4단계 대체 경로: 성장 미달이어도 53일 보류, 54일 통과", () => {
    const weak = { filled: 0, required: 4, averagePct: 0 };
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(53), growth: weak })).state).toBe("blocked");
    const r = evaluateStageGate(4, base({ level: 16, workoutDays: end(54), growth: weak }));
    expect(r).toMatchObject({ state: "eligible", path: "alternate" });
  });
  it("성장 기준이 없어도(M=0) 54일이면 대체 경로로 통과, 아니면 기준 준비 중", () => {
    const none = { filled: 0, required: null, averagePct: null };
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(40), growth: none })).state).toBe("needs_baseline");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(54), growth: none })).state).toBe("eligible");
  });
  it("N 부족은 평균이 높아도 보류, 평균 미달도 보류, 반올림 전 값으로 판정", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(36), growth: { filled: 2, required: 3, averagePct: 50 } })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(36), growth: { filled: 3, required: 3, averagePct: 2.99999 } })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(36), growth: { filled: 3, required: 3, averagePct: 3 } })).state).toBe("eligible");
  });
  it("5단계: 미션 0회면 성장·운동일을 채워도 보류, 1회면 통과", () => {
    const sparse = Array.from({ length: 60 }, (_, i) => day(i * 7)); // 주 1일씩 60주 → 운동일 60일이지만 주 2일 미만
    const late = { today: day(1000) };
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse, ...late })).state).toBe("blocked");
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse, ...late })).steady).toMatchObject({ count: 0, required: 1, met: false });
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: end(60), stageEnteredDay: day(400 - 59) })).state).toBe("eligible");
  });
  it("5단계 대체 경로(90일)는 미션 0회여도 통과(면제), 89일은 보류", () => {
    const weak = { filled: 0, required: 4, averagePct: 0 };
    const sparse = (n: number) => Array.from({ length: n }, (_, i) => day(i * 7)); // 주 1일 → 꾸준함 0회
    const late = { today: day(1000) };
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse(89), growth: weak, ...late })).state).toBe("blocked");
    const r90 = evaluateStageGate(5, base({ level: 21, workoutDays: sparse(90), growth: weak, ...late }));
    expect(r90).toMatchObject({ state: "eligible", path: "alternate", steady: { count: 0, met: false } });
    // 4단계 대체 경로는 면제가 없다는 대비: 6단계 쪽은 별도 시험
  });
  it("면제는 5단계 90일 경로에만: 90일이어도 4·6단계 규칙에는 영향 없음", () => {
    expect(STAGE_RULES[4].alternate).toMatchObject({ exemptsSteady: false });
    expect(STAGE_RULES[6].alternate).toEqual({ kind: "steady", required: 4 });
  });
  it("6·7단계: 경과 주만 판정(운동일 100/156 조건 없음), 39주 보류/40주 통과", () => {
    const d = (w: number) => [day(400 - w * 7), ...end(30)]; // 첫 운동이 w주 전 + 최근 30일 연속
    const r39 = evaluateStageGate(6, base({ level: 26, workoutDays: d(39) }));
    expect(r39.conditions.map(c => c.key)).not.toContain("days");
    expect(r39.conditions.find(c => c.key === "weeks")).toMatchObject({ current: 39, required: 40, met: false });
    expect(r39.state).toBe("blocked");
    expect(evaluateStageGate(6, base({ level: 26, workoutDays: d(40), stageEnteredDay: day(400 - 60) })).conditions.find(c => c.key === "weeks"))
      .toMatchObject({ current: 40, met: true });
  });
  it("6단계 최근 활동: 28일 중 7일 보류, 8일 통과 / 7단계 42일 중 11/12일", () => {
    const longAgo = day(400 - 41 * 7);
    const withRecent = (n: number, window: number) => [longAgo, ...Array.from({ length: n }, (_, i) => day(400 - i * Math.floor(window / n))), ];
    const r7 = evaluateStageGate(6, base({ level: 26, workoutDays: withRecent(7, 28) }));
    const r8 = evaluateStageGate(6, base({ level: 26, workoutDays: withRecent(8, 28) }));
    expect(r7.conditions.find(c => c.key === "recent")).toMatchObject({ current: 7, required: 8, met: false });
    expect(r8.conditions.find(c => c.key === "recent")).toMatchObject({ current: 8, required: 8, met: true });
    const r11 = evaluateStageGate(7, base({ level: 31, workoutDays: [longAgo, ...Array.from({ length: 11 }, (_, i) => day(400 - i * 3))] }));
    const r12 = evaluateStageGate(7, base({ level: 31, workoutDays: [longAgo, ...Array.from({ length: 12 }, (_, i) => day(400 - i * 3))] }));
    expect(r11.conditions.find(c => c.key === "recent")).toMatchObject({ current: 11, required: 12, met: false });
    expect(r12.conditions.find(c => c.key === "recent")).toMatchObject({ current: 12, required: 12, met: true });
  });
  it("6·7단계 대체 경로: 성장 대신 꾸준함 4회/6회(면제 없음)", () => {
    const weak = { filled: 0, required: 6, averagePct: 0 };
    const steadyWeeks = (n: number) => weeks(Array(n).fill(2)).map(d => day(400 - n * 7 + (Date.parse(d) - Date.parse(MON)) / 86400000));
    const days16 = steadyWeeks(16), days15 = steadyWeeks(15);
    const r16 = evaluateStageGate(6, base({ level: 26, workoutDays: [day(400 - 41 * 7), ...days16, ...end(28)], growth: weak, stageEnteredDay: day(400 - 16 * 7) }));
    expect(r16.alternate).toMatchObject({ kind: "steady", required: 4 });
    expect(r16.alternate?.current).toBeGreaterThanOrEqual(4);
    expect(r16.state).toBe("eligible");
    const r15 = evaluateStageGate(6, base({ level: 26, workoutDays: [day(400 - 41 * 7), ...days15], growth: weak, stageEnteredDay: day(400 - 15 * 7) }));
    expect(r15.state).toBe("blocked");
  });
  it("최종 단계 이후는 판정하지 않는다", () => {
    expect(() => evaluateStageGate(8, base({}))).toThrow(RangeError);
  });
});

describe("서버 계약 검증", () => {
  it("누락/비정상 상태를 정상 미달로 읽지 않는다", () => {
    for (const bad of [null, {}, { mode: "gated", currentStage: 0 }, { mode: "gated", state: "success" }]) {
      expect(() => parseStageGateStatus(bad)).toThrow("invalid stage evolution");
    }
  });
});
