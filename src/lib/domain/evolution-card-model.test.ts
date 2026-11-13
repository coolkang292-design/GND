import { describe, expect, it } from "vitest";
import type { GateCondition, StageGateStatus } from "./evolution-gate";
import { buildEvolutionCardModel } from "./evolution-card-model";

const base: StageGateStatus = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 4, currentLevel: 19,
  stageEnteredAt: "2026-10-07T22:14:37Z", nextStage: 5, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 15.9, comparableCount: 16,
  requiredGrowthCount: 4, filledGrowthCount: 4, conditions: [], alternate: null,
  growthSummary: null, selectedGrowths: [],
};
const c = (key: GateCondition["key"], current: number | null, required: number | null, met: boolean, extra: Partial<GateCondition> = {}): GateCondition =>
  ({ key, current, required, met, ...extra });
const status = (over: Partial<StageGateStatus>): StageGateStatus => ({ ...base, ...over });
const tile = (s: StageGateStatus, key: string) => buildEvolutionCardModel(s).tiles.find(t => t.key === key);
const row = (s: StageGateStatus, key: string) => buildEvolutionCardModel(s).rows.find(r => r.key === key);

describe("초과 달성 배지 규칙", () => {
  it("목표를 딱 채우면 배지 없이 '달성'", () => {
    const t = tile(status({ conditions: [c("days", 60, 60, true)] }), "days")!;
    expect(t).toMatchObject({ tone: "met", badge: null, value: "60일", target: "목표 60일" });
  });
  it("1배 초과~2배 미만은 +N 단위 배지(일·종목·회·레벨)", () => {
    expect(tile(status({ conditions: [c("days", 71, 60, true)] }), "days")).toMatchObject({ tone: "over", badge: "+11일" });
    expect(tile(status({ conditions: [c("growth_count", 5, 4, true)] }), "growth_count")).toMatchObject({ tone: "over", badge: "+1종목" });
    expect(tile(status({ conditions: [c("steady", 2, 1, true)] }), "steady")).toBeDefined();
    expect(tile(status({ conditions: [c("xp", 22, 21, true)] }), "xp")).toMatchObject({ tone: "over", badge: "+1레벨", value: "Lv.22" });
  });
  it("1.99배까지는 +N, 정확히 2배부터 'N.N배'", () => {
    expect(tile(status({ conditions: [c("days", 119, 60, true)] }), "days")).toMatchObject({ tone: "over", badge: "+59일" });
    expect(tile(status({ conditions: [c("days", 120, 60, true)] }), "days")).toMatchObject({ tone: "big", badge: "2.0배" });
  });
  it("평균 성장: 15.9/5는 3.1배(내림), 5.4/5는 +0.4%p, 5.04/5는 반올림 차이 0이라 배지 없음", () => {
    expect(tile(status({ conditions: [c("growth_average", 15.902333, 5, true)] }), "growth_average"))
      .toMatchObject({ tone: "big", badge: "3.1배", value: "+15.9%", target: "목표 +5%" });
    expect(tile(status({ conditions: [c("growth_average", 5.4, 5, true)] }), "growth_average")).toMatchObject({ tone: "over", badge: "+0.4%p" });
    expect(tile(status({ conditions: [c("growth_average", 5.04, 5, true)] }), "growth_average")).toMatchObject({ tone: "met", badge: null });
  });
  it("required가 0이거나 값이 없으면 배수를 만들지 않는다", () => {
    expect(tile(status({ conditions: [c("days", 5, 0, true)] }), "days")).toMatchObject({ tone: "met", badge: null });
  });
});

describe("남은 조건은 막대 줄, 0%·100%를 속이지 않는다", () => {
  it("경험치 19/21 → 90%·'2레벨 남았어요'", () => {
    const r = row(status({ conditions: [c("xp", 19, 21, false), c("days", 71, 60, true)] }), "xp")!;
    expect(r).toMatchObject({ percent: 90, valueText: "Lv.19 → Lv.21" });
    expect(r.hint).toContain("2레벨 남았어요");
  });
  it("거의 다 찬 값(4.97/5)도 미달이면 99%로 고정", () => {
    expect(row(status({ conditions: [c("growth_average", 4.97, 5, false)] }), "growth_average")!.percent).toBe(99);
  });
  it("값이 null이면 '기준 확인 중'·0%이며 타일이 되지 않는다", () => {
    const s = status({ state: "needs_baseline", conditions: [c("growth_count", null, null, false)] });
    const m = buildEvolutionCardModel(s);
    expect(m.tiles).toHaveLength(0);
    expect(m.rows[0]).toMatchObject({ valueText: "기준 확인 중", percent: 0, hint: "" });
    expect(m.headline).toBe("성장 비교 기준을 확인 중이에요.");
  });
  it("조건별 힌트: 운동일·경과 주·최근 운동·성장 종목·평균·꾸준함", () => {
    const hints = (cond: GateCondition) => row(status({ conditions: [cond, c("xp", 1, 1, true)] }), cond.key)!.hint;
    expect(hints(c("days", 29, 36, false))).toContain("7일 더");
    expect(hints(c("weeks", 30, 40, false))).toContain("10주");
    expect(hints(c("recent", 5, 8, false, { windowDays: 28 }))).toContain("최근 28일 중 3일 더");
    expect(hints(c("growth_count", 3, 4, false))).toContain("1개 더");
    expect(hints(c("growth_average", 3, 5, false))).toContain("+2.0%p");
    expect(hints(c("steady", 0, 1, false))).toContain("1회 더");
  });
  it("남은 조건이 정확히 하나면 '마지막 조건이에요'", () => {
    const one = status({ conditions: [c("xp", 19, 21, false), c("days", 71, 60, true), c("steady", 1, 1, true)] });
    expect(row(one, "xp")!.hint).toMatch(/^마지막 조건이에요 · 2레벨 남았어요/);
    const two = status({ conditions: [c("xp", 19, 21, false), c("days", 10, 60, false)] });
    expect(row(two, "xp")!.hint).not.toContain("마지막");
  });
});

describe("헤더·칸 막대", () => {
  it("blocked: 조건 N개 중 M개, 칸 막대는 조건 수만큼", () => {
    const m = buildEvolutionCardModel(status({ conditions: [c("xp", 19, 21, false), c("days", 71, 60, true), c("growth_count", 4, 4, true), c("growth_average", 15.9, 5, true), c("steady", 1, 1, true)] }));
    expect(m).toMatchObject({ headline: "조건 5개 중 4개를 채웠어요", total: 5, metCount: 4, celebrate: false });
    expect(m.segments).toEqual([false, true, true, true, true]);
  });
  it("eligible: 모두 채웠어요 + 축하 표시", () => {
    const m = buildEvolutionCardModel(status({ state: "eligible", conditions: [c("xp", 21, 21, true), c("days", 71, 60, true)] }));
    expect(m).toMatchObject({ headline: "진화 조건을 모두 채웠어요", celebrate: true });
  });
  it("크게 초과(2배 이상)한 조건이 있으면 안내 문구", () => {
    const m = buildEvolutionCardModel(status({ conditions: [c("growth_average", 15.9, 5, true), c("days", 71, 60, true)] }));
    expect(m.bigNote).toBe("목표를 크게 넘긴 조건 1개");
    expect(buildEvolutionCardModel(status({ conditions: [c("days", 71, 60, true)] })).bigNote).toBeNull();
  });
  it("시동러까지(XP만)는 조건 수 문구 대신 짧은 헤더와 안내", () => {
    const m = buildEvolutionCardModel(status({ mode: "xp_only", currentStage: 2, nextStage: 3, conditions: [c("xp", 10, 11, false)] }));
    expect(m.headline).toBe("진화 조건이 남았어요");
    expect(m.sub).toBe("시동러까지는 경험치만으로 진화해요.");
    expect(m.rows[0].hint).toMatch(/^마지막 조건이에요 · 1레벨 남았어요/);
  });
});

describe("단계별 조건 구성", () => {
  it("6단계는 운동한 날 없이 경과 주·최근 운동 타일", () => {
    const m = buildEvolutionCardModel(status({ currentStage: 5, nextStage: 6, conditions: [c("xp", 26, 26, true), c("weeks", 41, 40, true), c("recent", 9, 8, true, { windowDays: 28 })] }));
    expect(m.tiles.map(t => t.label)).toEqual(["경험치 레벨", "운동 시작 후", "최근 운동 28일"]);
    expect(m.tiles.find(t => t.key === "weeks")).toMatchObject({ value: "41주", badge: "+1주" });
    expect(m.tiles.find(t => t.key === "recent")).toMatchObject({ value: "9일", target: "목표 8일" });
  });
});

describe("서버 판정을 그대로 쓰고 숨길 것은 숨긴다", () => {
  const growth = [c("xp", 19, 21, false), c("days", 95, 60, true), c("growth_count", 2, 4, false), c("growth_average", 3, 5, false), c("steady", 0, 1, false)];
  it("error: 성장 조건과 대체 경로를 숨기고 안심 문구", () => {
    const m = buildEvolutionCardModel(status({ state: "error", conditions: growth, alternate: { kind: "days", current: 95, required: 90, met: true, exemptsSteady: true } }));
    expect([...m.tiles, ...m.rows].some(x => x.key.startsWith("growth_"))).toBe(false);
    expect(m.alternate).toBeNull();
    expect(m.headline).toContain("운동 기록과 경험치는 그대로예요");
  });
  it("eligible을 대체 경로로 통과: 성장·(면제 시)꾸준함 조건은 숨기고 대체 경로를 달성으로", () => {
    const m = buildEvolutionCardModel(status({ state: "eligible", path: "alternate", conditions: [c("xp", 21, 21, true), c("days", 95, 60, true), c("growth_count", 2, 4, false), c("growth_average", 3, 5, false), c("steady", 0, 1, false)],
      alternate: { kind: "days", current: 95, required: 90, met: true, exemptsSteady: true } }));
    const keys = [...m.tiles, ...m.rows].map(x => x.key);
    expect(keys).not.toContain("growth_count"); expect(keys).not.toContain("growth_average"); expect(keys).not.toContain("steady");
    expect(m.rows).toHaveLength(0);
    expect(m.segments.every(Boolean)).toBe(true);
    expect(m.alternate).toMatchObject({ met: true, text: "성장 대신 운동한 날", valueText: "95 / 90일" });
  });
  it("6·7단계 대체 경로(미션)로 통과하면 성장만 숨기고 꾸준함은 보인다", () => {
    const m = buildEvolutionCardModel(status({ currentStage: 5, nextStage: 6, state: "eligible", path: "alternate",
      conditions: [c("xp", 26, 26, true), c("growth_count", 0, 5, false), c("growth_average", 0, 8, false), c("steady", 4, 2, true)],
      alternate: { kind: "steady", current: 4, required: 4, met: true, exemptsSteady: false } }));
    const keys = [...m.tiles, ...m.rows].map(x => x.key);
    expect(keys).toContain("steady"); expect(keys).not.toContain("growth_count");
    expect(m.alternate).toMatchObject({ text: "성장 대신 꾸준함", valueText: "4 / 4회", note: null });
  });
  it("blocked에서는 대체 경로를 진행 줄로 보이고 5단계 운동일 경로는 면제 안내", () => {
    const m = buildEvolutionCardModel(status({ conditions: growth, alternate: { kind: "days", current: 70, required: 90, met: false, exemptsSteady: true } }));
    expect(m.alternate).toMatchObject({ met: false, percent: 77, valueText: "70 / 90일", note: "꾸준함은 따로 채우지 않아도 돼요" });
  });
  it("꾸준함 조건이 있으면 설명 footnote 플래그", () => {
    expect(buildEvolutionCardModel(status({ conditions: [c("steady", 0, 1, false)] })).steadyNote).toBe(true);
    expect(buildEvolutionCardModel(status({ conditions: [c("days", 1, 36, false)] })).steadyNote).toBe(false);
  });
  it("met를 화면에서 다시 계산하지 않는다(서버 met=false면 값이 목표를 넘겨 보여도 미달 줄)", () => {
    expect(row(status({ conditions: [c("days", 70, 60, false)] }), "days")).toBeDefined();
    expect(tile(status({ conditions: [c("days", 70, 60, false)] }), "days")).toBeUndefined();
  });
});
