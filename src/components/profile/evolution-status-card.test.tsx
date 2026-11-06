import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EvolutionStatusView,
  conditionRow,
  remainingItems,
} from "./evolution-status-card";
import {
  evaluateEvolution,
  type ExerciseGrowth,
  type GrowthSummary,
} from "@/lib/domain/evolution";

const TODAY = "2026-11-06";
function ago(n: number) {
  return new Date(Date.UTC(2026, 10, 6) - n * 86_400_000).toISOString().slice(0, 10);
}
const days = (n: number, startAgo: number) =>
  Array.from({ length: n }, (_, i) => ago(startAgo - i * 2));

const bench: ExerciseGrowth = {
  exercise: "벤치프레스", kind: "w", dayCount: 8, base: 60 * (1 + 8 / 30), recent: 60 * (1 + 8 / 30) * 1.05,
  growthPct: 5, last: { weight: 63, reps: 8, seconds: null },
};
const squat: ExerciseGrowth = {
  exercise: "스쿼트", kind: "w", dayCount: 8, base: 100 * (1 + 5 / 30), recent: 100 * (1 + 5 / 30) * 1.04,
  growthPct: 4, last: { weight: 104, reps: 5, seconds: null },
};
const g = (value: number | null, exercises: ExerciseGrowth[] = [bench, squat]): GrowthSummary => ({
  measuredCount: value === null ? 0 : exercises.length,
  baselineCount: exercises.length,
  value,
  exercises,
});

describe("EvolutionStatusView — 쉬운 말", () => {
  it("어려운 용어(XP 자격·성장률) 대신 쉬운 제목을 쓴다", () => {
    const status = evaluateEvolution({
      totalXp: 8040, currentStage: 4, today: TODAY, workoutDays: days(42, 125), growth: g(5.1),
    });
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} />);
    expect(html).toContain("다음엔 이렇게 진화해요");
    expect(html).toContain("5단계 불꽃러");
    expect(html).toContain("경험치 레벨");
    expect(html).toContain("운동한 날");
    expect(html).toContain("운동을 시작한 지");
    expect(html).toContain("예전의 나보다");
    expect(html).toContain("얼마나 세졌나");
    expect(html).toContain("한눈에 보기");
    expect(html).toContain("오늘 운동 시작하기");
    expect(html).toContain("이제 이것만 하면 돼요");
    expect(html).not.toContain("XP 자격");
    expect(html).not.toContain("성장률");
  });

  it("남은 조건은 오늘 할 일 문장 + 구체적인 운동 지침(몇 kg 몇 번)", () => {
    const status = evaluateEvolution({
      totalXp: 10000, currentStage: 4, today: TODAY, workoutDays: days(42, 125), growth: g(5.1),
    });
    const items = remainingItems(status);
    expect(items.map((i) => i.text)).toContain("운동을 18일 더 해요");
    const growth = items.find((i) => i.text.startsWith("예전의 나보다"))!;
    expect(growth.text).toContain("평균 8% 더 세져야 해요");
    expect(growth.tips && growth.tips.length).toBeGreaterThan(0);
    expect(growth.tips![0]).toMatch(/벤치프레스|스쿼트/);
    expect(growth.tips![0]).toMatch(/kg \d+번/);
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} />);
    expect(html).toContain("kg");
  });

  it("측정 전이면 0%라고 쓰지 않고 '아직 재는 중' + 몇 번 더 기록하라고 알려 준다", () => {
    const early: ExerciseGrowth = { ...bench, dayCount: 4, growthPct: null };
    const status = evaluateEvolution({
      totalXp: 6000, currentStage: 3, today: TODAY, workoutDays: days(30, 120), growth: g(null, [early]),
    });
    const row = conditionRow(status.conditions.find((c) => c.key === "growth")!);
    expect(row.value).toBe("아직 재는 중");
    const growth = remainingItems(status).find((i) => i.text.includes("못 쟀어요"))!;
    expect(growth.tips![0]).toContain("벤치프레스: 4번 기록했어요 → 2번만 더 하면 잴 수 있어요");
  });

  it("3단계는 '예전의 나 기록 만들기'로 풀어 쓴다 (+1.0% / +1.0% 같은 숫자를 쓰지 않는다)", () => {
    const early: ExerciseGrowth = { ...bench, dayCount: 2, growthPct: null };
    const unmet = evaluateEvolution({
      totalXp: 3000, currentStage: 2, today: TODAY, workoutDays: days(30, 120),
      growth: { measuredCount: 0, baselineCount: 0, value: null, exercises: [early] },
    });
    const row = conditionRow(unmet.conditions.find((c) => c.key === "growth")!);
    expect(row.label).toBe("예전의 나 기록 만들기");
    expect(row.value).toBe("아직 재는 중");
    expect(remainingItems(unmet).some((i) => i.text.includes("'예전의 나' 기록을 만들어요"))).toBe(true);

    const met = evaluateEvolution({
      totalXp: 3000, currentStage: 2, today: TODAY, workoutDays: days(30, 120), growth: g(null),
    });
    const metRow = conditionRow(met.conditions.find((c) => c.key === "growth")!);
    expect(metRow.value).toBe("완료");
    expect(renderToStaticMarkup(<EvolutionStatusView status={met} />)).not.toContain("+1.0%");
  });

  it("6단계 목표는 '요즘도 열심히 하나' 행을 그린다", () => {
    const status = evaluateEvolution({
      totalXp: 15000, currentStage: 5, today: TODAY, workoutDays: days(100, 300), growth: g(12),
    });
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} />);
    expect(html).toContain("요즘 활동 (최근 28일)");
    expect(html).toContain("운동 습관");
  });

  it("최종 단계면 마지막 문구", () => {
    const status = evaluateEvolution({
      totalXp: 26000, currentStage: 7, today: TODAY, workoutDays: days(200, 500), growth: g(20),
    });
    const html = renderToStaticMarkup(<EvolutionStatusView status={status} />);
    expect(html).toContain("마지막 모습까지 진화했어요");
  });

  it("한번 진화한 모습은 낮아지지 않는다고 알려 준다", () => {
    const status = evaluateEvolution({
      totalXp: 3000, currentStage: 2, today: TODAY, workoutDays: days(30, 120), growth: g(null, []),
    });
    expect(renderToStaticMarkup(<EvolutionStatusView status={status} />)).toContain(
      "한번 진화한 모습은 운동을 쉬어도 그대로예요",
    );
  });
});
