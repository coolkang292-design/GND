import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageEvolutionStatusView } from "./stage-evolution-status";
import type { StageGateStatus } from "@/lib/domain/evolution-gate";
const status: StageGateStatus = {
  mode: "gated", ruleVersion: "stage_growth_v1", currentStage: 4, currentLevel: 21,
  stageEnteredAt: "2026-08-01T00:00:00Z", nextStage: 5, state: "blocked", path: "growth",
  growthMetric: "top_n_zero_padded_mean", averageGrowthPct: 8, comparableCount: 3,
  requiredGrowthCount: 4, filledGrowthCount: 3,
  conditions: [
    { key: "xp", current: 21, required: 21, met: true },
    { key: "days", current: 60, required: 60, met: true },
    { key: "weeks", current: 24, required: 24, met: true },
    { key: "growth_count", current: 3, required: 4, met: false },
    { key: "growth_average", current: 8, required: 8, met: true },
  ], growthSummary: null, selectedGrowths: [],
};
describe("서버 진화 현황", () => {
  it("평균8%라도3/4이면 진화 조건 남음 표시", () => {
    const html = renderToStaticMarkup(<StageEvolutionStatusView status={status} />);
    expect(html).toContain("성장 종목"); expect(html).toContain("3 / 4종목");
    expect(html).toContain("진화 조건이 남았어요"); expect(html).not.toContain("미리보기");
    expect(html).not.toContain("현재 진화는 경험치 기준");
  });
  it("목표2·3에는 XP만 안내", () => {
    const html = renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status, mode: "xp_only", currentStage: 2, nextStage: 3,
      conditions: [{ key: "xp", current: 10, required: 11, met: false }] }} />);
    expect(html).toContain("시동러까지는 경험치만");expect(html).not.toContain("성장 종목");
  });
  it("기준 미준비·장애를0% 성장 미달로 안내하지 않음", () => {
    const pending=renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status,state:"needs_baseline",averageGrowthPct:null,requiredGrowthCount:null }} />);
    expect(pending).toContain("비교 기준을 확인 중");
    const error=renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status,state:"error" }} />);
    expect(error).toContain("진화 판정을 다시 확인");expect(error).not.toContain("진화 조건이 남았어요");
    expect(error).not.toContain("진화 평가 평균");
  });
  it("꾸준함 행과 설명, 면제되는 5단계 대체 경로(운동 90일)를 중립적으로 표시", () => {
    const html = renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status,
      conditions: [...status.conditions, { key: "steady", current: 0, required: 1, met: false }],
      alternate: { kind: "days", current: 70, required: 90, met: false, exemptsSteady: true } }} />);
    expect(html).toContain("꾸준함"); expect(html).toContain("0 / 1회");
    expect(html).toContain("연속 4주 중 3주에서 주 2일 이상");
    expect(html).toContain("성장 대신 운동한 날 70 / 90일"); expect(html).toContain("꾸준함은 따로 채우지 않아도 돼요");
    expect(html).not.toMatch(/못했|실패|게으|부족해/);
  });
  it("6·7단계 대체 경로는 꾸준함 횟수이고 면제 문구가 없다", () => {
    const html = renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status, currentStage: 5, nextStage: 6,
      alternate: { kind: "steady", current: 3, required: 4, met: false, exemptsSteady: false } }} />);
    expect(html).toContain("성장 대신 꾸준함 3 / 4회"); expect(html).not.toContain("따로 채우지 않아도");
  });
  it("대체 경로를 채우면 체크 표시, 오류 상태에서는 대체 경로를 보이지 않는다", () => {
    const alt = { kind: "days" as const, current: 90, required: 90, met: true, exemptsSteady: true };
    expect(renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status, alternate: alt }} />)).toContain("✓ 성장 대신");
    expect(renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status, state: "error", alternate: alt }} />)).not.toContain("alternate-path");
  });
  it("최종 단계는 다음 조건이 없음", () => {
    expect(renderToStaticMarkup(<StageEvolutionStatusView status={{ ...status,currentStage:7,nextStage:null,state:"max_stage",conditions:[] }} />)).toContain("최종 단계");
  });
});
