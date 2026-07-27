import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextGoalCard } from "./next-goal-card";
import type { Achievement } from "@/lib/domain/achievements";

const goal: Achievement = {
  key: "workout_10", title: "열 번 찍었개", description: "운동 10회 달성",
  emoji: "🦴", metricKey: "workout_count", rarity: "common", rewardPoint: 300,
  repeatable: false, currentValue: 7, targetValue: 10, progress: 0.7,
  remainingValue: 3, unlocked: false, count: 0,
};

describe("NextGoalCard", () => {
  it("제목·현재/목표·남은수치·보상을 보여준다", () => {
    const html = renderToStaticMarkup(<NextGoalCard goal={goal} />);
    expect(html).toContain("다음 목표");
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("7 / 10회");
    expect(html).toContain("앞으로 3회");
    expect(html).toContain("+300");
    expect(html).toContain("70%");
  });

  it("goal이 null이면 다 모았다는 문구", () => {
    const html = renderToStaticMarkup(<NextGoalCard goal={null} />);
    expect(html).toContain("모든 목표");
  });
});
