import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scoreBreakdown, type ScoredGoal } from "@/lib/domain/goal-score";
import { ScoreBreakdownCard } from "./score-breakdown-card";

const g = (target: number, actual: number): ScoredGoal => ({ type: "volume", target, actual });
const html = (goals: ScoredGoal[], workoutDays: number, plannedDays: number) =>
  renderToStaticMarkup(
    <ScoreBreakdownCard b={scoreBreakdown({ userId: "me", goals, workoutDays, plannedDays })} />,
  );

describe("ScoreBreakdownCard", () => {
  it("계산식과 세 항목을 말한다", () => {
    const h = html([g(10, 5)], 2, 10);
    expect(h).toContain("목표점수");
    expect(h).toContain("참여점수");
    expect(h).toContain("완료 보너스");
    expect(h).toContain("2일 / 10일");
  });

  it("아무것도 못 채웠으면 '더 안 올라요' 표시가 하나도 없다 (부정 확인)", () => {
    expect(html([g(10, 5)], 2, 10)).not.toContain("cap-reached");
  });

  it("목표 1개 달성: 목표·보너스 상한 표시 2개, 참여는 아직 아님, 만점 103", () => {
    const h = html([g(10, 10)], 2, 10);
    expect(h.match(/data-testid="cap-reached"/g)?.length).toBe(2);
    expect(h).toContain("103점");
  });

  it("전부 채우면 상한 표시 3개", () => {
    expect(html([g(10, 10)], 10, 10).match(/data-testid="cap-reached"/g)?.length).toBe(3);
  });

  it("종합점수 합계 숫자는 그리지 않는다 (종료일 공개 유지)", () => {
    expect(html([g(10, 10)], 10, 10)).not.toContain("종합점수 103");
  });
});
