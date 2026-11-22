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
  it("요구 종목 수 하한 3: 이전 단계 종목이 적어도 1개로 줄지 않는다(이전 종목 수가 상한)", () => {
    expect(getStageGrowthGoal(3, 4)).toMatchObject({ requiredCount: 3 }); // ceil(0.6)=1 → 하한 3
    expect(getStageGrowthGoal(3, 2)).toMatchObject({ requiredCount: 2 }); // 하한 3이어도 이전 종목 수(2)를 넘지 않는다
    expect(getStageGrowthGoal(3, 1)).toMatchObject({ requiredCount: 1 });
  });
  it("M이 없으면 최소1개로 임의 통과시키지 않고 기준 준비 상태", () => {
    expect(getStageGrowthGoal(3, null)).toMatchObject({ mode: "needs_baseline" });
  });
  it("최종 단계에는 다음 성장 관문을 만들지 않는다", () => {
    expect(getStageGrowthGoal(7, 18)).toEqual({ mode: "complete", nextStage: null });
  });
});

describe("규칙표(2026-11-13 확정, 2026-11-22 개정 — 단계 진입 후 기준, 서버 0147과 같은 값)", () => {
  it("4단계는 단계 안 운동일, 5·6·7단계는 단계 진입 후 경과 주를 습관으로 쓴다", () => {
    expect(STAGE_RULES[4].habit).toEqual({ kind: "days", required: 20 });
    expect(STAGE_RULES[5].habit).toEqual({ kind: "weeks", required: 10 });
    expect(STAGE_RULES[6].habit).toEqual({ kind: "weeks", required: 12 });
    expect(STAGE_RULES[7].habit).toEqual({ kind: "weeks", required: 20 });
  });
  it("2·3단계는 XP만, 평균·비율·미션·대체 경로가 없다", () => {
    for (const s of [2, 3]) expect(STAGE_RULES[s]).toMatchObject({ mode: "xp_only", habit: null, averagePct: null,
      growthRatio: null, steadyRequired: 0, alternate: null });
  });
  it("대체 경로: 4=30일, 5=36일(미션 면제), 6=미션4회, 7=미션6회", () => {
    expect(STAGE_RULES[4].alternate).toEqual({ kind: "days", required: 30, exemptsSteady: false });
    expect(STAGE_RULES[5].alternate).toEqual({ kind: "days", required: 36, exemptsSteady: true });
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
  it("4단계: 단계 안 운동 19일 보류, 20일 통과(성장 충족 시)", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(19) })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(20) })).state).toBe("eligible");
  });
  it("4단계: 경과 주는 보지 않는다(20일이 짧은 기간에 몰려도 통과)", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(20) })).conditions.map(c => c.key)).not.toContain("weeks");
  });
  it("진입 전 운동은 습관에 세지 않는다 — 진화 직후엔 0에서 시작", () => {
    const entered = day(400 - 9); // 10일 전 진입
    const before = run(30, day(400 - 9 - 30)); // 진입 전 30일 연속
    const after = end(10); // 진입 뒤 10일 연속(진입일 포함)
    const r = evaluateStageGate(4, base({ level: 16, workoutDays: [...before, ...after], stageEnteredDay: entered }));
    expect(r.conditions.find(c => c.key === "days")).toMatchObject({ current: 10, required: 20, met: false });
    expect(r.state).toBe("blocked");
    // 진입일이 없으면(기록 없음) 센 것이 없다
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(30), stageEnteredDay: null })).conditions.find(c => c.key === "days"))
      .toMatchObject({ current: 0, met: false });
  });
  it("4단계 대체 경로: 성장 미달이어도 29일 보류, 30일 통과", () => {
    const weak = { filled: 0, required: 4, averagePct: 0 };
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(29), growth: weak })).state).toBe("blocked");
    const r = evaluateStageGate(4, base({ level: 16, workoutDays: end(30), growth: weak }));
    expect(r).toMatchObject({ state: "eligible", path: "alternate" });
  });
  it("성장 기준이 없어도(M=0) 30일이면 대체 경로로 통과, 아니면 기준 준비 중", () => {
    const none = { filled: 0, required: null, averagePct: null };
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(25), growth: none })).state).toBe("needs_baseline");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(30), growth: none })).state).toBe("eligible");
  });
  it("N 부족은 평균이 높아도 보류, 평균 미달도 보류, 반올림 전 값으로 판정", () => {
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(20), growth: { filled: 2, required: 3, averagePct: 50 } })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(20), growth: { filled: 3, required: 3, averagePct: 2.99999 } })).state).toBe("blocked");
    expect(evaluateStageGate(4, base({ level: 16, workoutDays: end(20), growth: { filled: 3, required: 3, averagePct: 3 } })).state).toBe("eligible");
  });
  it("5단계: 진입 후 10주 + 미션 — 미션 0회면 성장을 채워도 보류, 1회면 통과", () => {
    // 주 1일씩 35주 → 주 2일 미만이라 꾸준함 0회, 운동일 35일은 대체 경로(36일)에 1일 모자란다
    const sparse = Array.from({ length: 35 }, (_, i) => day(i * 7));
    const late = { today: day(1000) };
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse, ...late })).state).toBe("blocked");
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse, ...late })).steady).toMatchObject({ count: 0, required: 1, met: false });
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: end(60), stageEnteredDay: day(400 - 70) })).state).toBe("eligible");
  });
  it("5단계: 경과 주 9주 보류 / 10주 통과(운동일이 아니라 진입 후 지난 기간)", () => {
    const w = (weeks: number) => evaluateStageGate(5, base({ level: 21, workoutDays: end(60), stageEnteredDay: day(400 - weeks * 7) }));
    expect(w(9).conditions.find(c => c.key === "weeks")).toMatchObject({ current: 9, required: 10, met: false });
    expect(w(9).state).toBe("blocked");
    expect(w(10).conditions.find(c => c.key === "weeks")).toMatchObject({ current: 10, required: 10, met: true });
    expect(w(10).conditions.map(c => c.key)).not.toContain("days");
  });
  it("5단계 대체 경로(36일)는 미션 0회여도 통과(면제), 35일은 보류", () => {
    const weak = { filled: 0, required: 4, averagePct: 0 };
    const sparse = (n: number) => Array.from({ length: n }, (_, i) => day(i * 7)); // 주 1일 → 꾸준함 0회
    const late = { today: day(1000) };
    expect(evaluateStageGate(5, base({ level: 21, workoutDays: sparse(35), growth: weak, ...late })).state).toBe("blocked");
    const r36 = evaluateStageGate(5, base({ level: 21, workoutDays: sparse(36), growth: weak, ...late }));
    expect(r36).toMatchObject({ state: "eligible", path: "alternate", steady: { count: 0, met: false } });
    // 4단계 대체 경로는 면제가 없다는 대비: 6단계 쪽은 별도 시험
  });
  it("면제는 5단계 36일 경로에만: 4·6단계 규칙에는 영향 없음", () => {
    expect(STAGE_RULES[4].alternate).toMatchObject({ exemptsSteady: false });
    expect(STAGE_RULES[6].alternate).toEqual({ kind: "steady", required: 4 });
  });
  it("6·7단계: 단계 진입 후 경과 주만 판정(운동일 조건 없음), 11주 보류/12주 통과 · 7단계는 20주", () => {
    const at = (w: number) => ({ workoutDays: end(30), stageEnteredDay: day(400 - w * 7) });
    const r11 = evaluateStageGate(6, base({ level: 26, ...at(11) }));
    expect(r11.conditions.map(c => c.key)).not.toContain("days");
    expect(r11.conditions.find(c => c.key === "weeks")).toMatchObject({ current: 11, required: 12, met: false });
    expect(r11.state).toBe("blocked");
    expect(evaluateStageGate(6, base({ level: 26, ...at(12) })).conditions.find(c => c.key === "weeks"))
      .toMatchObject({ current: 12, met: true });
    expect(evaluateStageGate(7, base({ level: 31, ...at(19) })).conditions.find(c => c.key === "weeks"))
      .toMatchObject({ current: 19, required: 20, met: false });
    expect(evaluateStageGate(7, base({ level: 31, ...at(20) })).conditions.find(c => c.key === "weeks"))
      .toMatchObject({ current: 20, met: true });
  });
  it("6단계 최근 운동은 진화 뒤 새로 센다: 진화 전 22일 + 뒤 2일이면 2/8", () => {
    const entered = day(400 - 1); // 어제 진화
    const r = evaluateStageGate(6, base({ level: 26, workoutDays: end(24), stageEnteredDay: entered }));
    expect(r.conditions.find(c => c.key === "recent")).toMatchObject({ current: 2, required: 8, met: false });
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

describe("단계별 경험치 조건(stage_xp) — 2026-11-22", () => {
  const base = (over: Partial<GateInput>): GateInput => ({
    level: 1, workoutDays: run(30, day(400 - 29)), today: day(400), stageEnteredDay: MON,
    growth: { filled: 4, required: 4, averagePct: 20 }, ...over,
  });
  it("stageXp를 주면 레벨이 아니라 '이 단계에서 쌓은 경험치'로 판정한다 (3→4단계 필요량 3000)", () => {
    const ok = evaluateStageGate(4, base({ stageXp: 3000 }));
    expect(ok.conditions[0]).toEqual({ key: "stage_xp", current: 3000, required: 3000, met: true });
    expect(ok.state).toBe("eligible");
    const short = evaluateStageGate(4, base({ stageXp: 2999 }));
    expect(short.conditions[0]).toMatchObject({ key: "stage_xp", met: false });
    expect(short.state).toBe("blocked");
  });
  it("레벨이 아무리 높아도(옛 누적 방식이면 통과할 값) 단계 경험치가 모자라면 막힌다 — 과대 누적 차단", () => {
    expect(evaluateStageGate(4, base({ level: 35, stageXp: 100 })).state).toBe("blocked");
  });
  it("단계별 필요량: 5단계 목표 4000 · 6단계 목표 5000 · 7단계 목표 6000, 2·3단계 목표는 1000·2000", () => {
    const need = (t: number) => evaluateStageGate(t, base({ stageXp: 0 })).conditions[0].required;
    expect([2, 3, 4, 5, 6, 7].map(need)).toEqual([1000, 2000, 3000, 4000, 5000, 6000]);
  });
  it("2·3단계(경험치만 보는 단계)도 단계 경험치로: 1000 채우면 2단계 진화", () => {
    expect(evaluateStageGate(2, base({ stageXp: 1000 })).state).toBe("eligible");
    expect(evaluateStageGate(2, base({ stageXp: 999 })).state).toBe("blocked");
  });
  it("stageXp를 안 주면 옛 레벨 방식 그대로", () => {
    expect(evaluateStageGate(4, base({ level: 16 })).conditions[0]).toMatchObject({ key: "xp", current: 16, required: 16, met: true });
  });
  it("서버 계약: stage_xp 조건을 정상으로 읽는다(옛 앱도 새 서버 값을 못 읽어 깨지지 않게)", () => {
    const status = {
      mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 3, currentLevel: 13,
      stageEnteredAt: null, nextStage: 4, state: "blocked", path: "growth", growthMetric: "top_n_zero_padded_mean",
      averageGrowthPct: null, comparableCount: 0, requiredGrowthCount: null, filledGrowthCount: 0,
      conditions: [{ key: "stage_xp", current: 1550, required: 3000, met: false }], growthSummary: null, selectedGrowths: [],
    };
    expect(parseStageGateStatus(status).conditions[0].key).toBe("stage_xp");
  });
});
