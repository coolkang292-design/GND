import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageEvolutionStatusView } from "./stage-evolution-status";
import type { GateCondition, StageGateStatus } from "@/lib/domain/evolution-gate";

const c = (key: GateCondition["key"], current: number | null, required: number | null, met: boolean, extra: Partial<GateCondition> = {}): GateCondition =>
  ({ key, current, required, met, ...extra });
const base: StageGateStatus = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 4, currentLevel: 19,
  stageEnteredAt: "2026-10-07T22:14:37Z", nextStage: 5, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 15.9, comparableCount: 16,
  requiredGrowthCount: 4, filledGrowthCount: 4, conditions: [], alternate: null,
  growthSummary: null, selectedGrowths: [],
};
/** 오뎅끼데스까의 실제 서버 응답과 같은 모양: 경험치만 부족, 운동일·평균은 초과 달성 */
const mixed: StageGateStatus = {
  ...base,
  conditions: [c("xp", 19, 21, false), c("days", 71, 60, true), c("growth_count", 4, 4, true), c("growth_average", 15.902333, 5, true), c("steady", 1, 1, true)],
  alternate: { kind: "days", current: 71, required: 90, met: false, exemptsSteady: true },
};
const html = (s: StageGateStatus) => renderToStaticMarkup(<StageEvolutionStatusView status={s} />);
const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;

describe("진화 카드 — 달성 타일·초과 배지·남은 조건 막대", () => {
  const h = html(mixed);
  it("헤더: 조건 5개 중 4개, 칸 막대, 크게 넘긴 조건 안내", () => {
    expect(h).toContain("다음 진화 · 불꽃러");
    expect(h).toContain("조건 5개 중 4개를 채웠어요");
    expect(h).toContain('aria-label="조건 5개 중 4개"');
    expect(count(h, /data-testid="evo-segment"/g)).toBe(5);
    expect(h).toContain("목표를 크게 넘긴 조건 1개");
  });
  it("달성한 조건은 타일, 초과는 배지로 구분(over·big·met)", () => {
    expect(count(h, /data-tone="big"/g)).toBe(1);
    expect(count(h, /data-tone="over"/g)).toBe(1);
    expect(count(h, /data-tone="met"/g)).toBe(2);
    expect(h).toContain("+11일");
    expect(h).toContain("3.1배");
    expect(h).toContain("+15.9%");
    expect(h).toContain("목표 +5%");
    expect(h).toContain("71일");
    expect(h).toContain("목표 달성");
  });
  it("남은 조건은 막대 줄: progressbar 값과 응원 톤 힌트", () => {
    expect(h).toContain('role="progressbar"');
    expect(h).toContain('aria-valuenow="90"');
    expect(h).toContain("Lv.19 → Lv.21");
    expect(h).toContain("마지막 조건이에요 · 2레벨 남았어요");
    expect(h).not.toMatch(/못했|실패|게으|부족해/);
  });
  it("대체 경로 줄과 5단계 면제 안내, 꾸준함 설명", () => {
    expect(h).toContain('data-testid="alternate-path"');
    expect(h).toContain("성장 대신 운동한 날");
    expect(h).toContain("71 / 90일");
    expect(h).toContain("꾸준함은 따로 채우지 않아도 돼요");
    expect(h).toContain("연속 4주 중 3주에서 주 2일 이상");
  });
  it("판정은 서버 met를 그대로 쓴다(met=false면 값이 목표를 넘어 보여도 막대 줄)", () => {
    const out = html({ ...base, conditions: [c("days", 70, 60, false)] });
    expect(out).toContain('role="progressbar"');
    expect(out).not.toContain('data-tone=');
  });
});

describe("상태별", () => {
  it("eligible: 모두 채웠어요 + 한 번만 재생되는 축하 체크, blocked에는 없다", () => {
    const e = html({ ...mixed, state: "eligible", currentLevel: 21, conditions: [c("xp", 21, 21, true), c("days", 71, 60, true)] });
    expect(e).toContain("진화 조건을 모두 채웠어요");
    expect(e).toContain("evo-pop");
    expect(html(mixed)).not.toContain("evo-pop");
  });
  it("대체 경로로 eligible: 성장·꾸준함 조건은 숨기고 대체 경로 달성", () => {
    const e = html({ ...base, state: "eligible", path: "alternate", currentLevel: 21,
      conditions: [c("xp", 21, 21, true), c("days", 95, 60, true), c("growth_count", 2, 4, false), c("growth_average", 3, 5, false), c("steady", 0, 1, false)],
      alternate: { kind: "days", current: 95, required: 90, met: true, exemptsSteady: true } });
    expect(e).toContain("진화 조건을 모두 채웠어요");
    expect(e).not.toContain("평균 성장");
    expect(e).toContain("95 / 90일");
    expect(e).not.toContain('aria-label="성장 종목"');
  });
  it("needs_baseline: 0%로 표시하지 않고 '기준 확인 중'", () => {
    const n = html({ ...base, state: "needs_baseline", averageGrowthPct: null, requiredGrowthCount: null, filledGrowthCount: 0,
      conditions: [c("xp", 19, 21, false), c("growth_count", null, null, false), c("growth_average", null, 5, false)] });
    expect(n).toContain("성장 비교 기준을 확인 중이에요");
    expect(n).toContain("기준 확인 중");
    expect(n).not.toMatch(/(^|[^\d.])0(\.0)?%/);
  });
  it("error: 성장·대체 경로를 숨기고 안심 문구", () => {
    const er = html({ ...mixed, state: "error" });
    expect(er).toContain("운동 기록과 경험치는 그대로예요");
    expect(er).not.toContain("평균 성장");
    expect(er).not.toContain("성장 종목");
    expect(er).not.toContain('data-testid="alternate-path"');
  });
  it("시동러까지는 경험치만: 막대 줄 하나, 대체 경로·성장 없음", () => {
    const x = html({ ...base, mode: "xp_only", currentStage: 2, nextStage: 3, conditions: [c("xp", 10, 11, false)] });
    expect(x).toContain("시동러까지는 경험치만으로 진화해요");
    expect(x).toContain("마지막 조건이에요 · 1레벨 남았어요");
    expect(x).not.toContain("alternate-path");
    expect(x).not.toContain("성장 종목");
  });
  it("6단계: 경과 주·최근 운동 타일과 미션형 대체 경로(면제 문구 없음)", () => {
    const s = html({ ...base, currentStage: 5, nextStage: 6, conditions: [c("xp", 26, 26, true), c("weeks", 30, 40, false), c("recent", 9, 8, true, { windowDays: 28 }), c("steady", 1, 2, false)],
      alternate: { kind: "steady", current: 1, required: 4, met: false, exemptsSteady: false } });
    expect(s).toContain("다음 진화 · 대장");
    expect(s).toContain("최근 운동 28일");
    expect(s).toContain("+1일");
    expect(s).toContain("성장 대신 꾸준함");
    expect(s).not.toContain("따로 채우지 않아도");
    expect(s).not.toContain("운동한 날");
  });
  it("최종 단계는 다음 조건이 없음", () => {
    expect(html({ ...base, currentStage: 7, nextStage: null, state: "max_stage", conditions: [] })).toContain("최종 단계");
  });
});

describe("모션", () => {
  it("축하 효과는 prefers-reduced-motion에서 꺼진다", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/@keyframes evo-pop/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.evo-pop\s*\{\s*animation:\s*none/);
  });
});
