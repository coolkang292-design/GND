import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeSheet } from "./badge-sheet";
import { buildAchievements } from "@/lib/domain/achievements";
import type { BadgeMeta } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_10", emoji: "🦴", name: "열 번 찍었개", description: "운동 10회 달성",
    tier: "bronze", rarity: "common", metricKey: "workout_count", threshold: 10,
    pointReward: 300, repeatable: false, repeatStep: null, sortOrder: 102 },
  { key: "workout_30", emoji: "💪", name: "습관이 됐개", description: "운동 30회 달성",
    tier: "silver", rarity: "rare", metricKey: "workout_count", threshold: 30,
    pointReward: 800, repeatable: false, repeatStep: null, sortOrder: 103 },
];

function sheet(workoutCount: number) {
  const metrics = {
    workout_count: workoutCount, total_minutes: 0, streak_days: 0,
    weight_volume_kg: 0, cardio_distance_m: 0, record_beaten: 0,
  };
  const earned = workoutCount >= 10
    ? [{ badgeKey: "workout_10", periodKey: "lifetime", earnedAt: new Date("2026-07-20") }]
    : [];
  return buildAchievements(CATALOG, earned, metrics);
}

describe("BadgeSheet 퀘스트", () => {
  it("전체 완료율과 카테고리 완료율을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("1 / 2"); // 전체 완료
    expect(html).toContain("50%");
  });

  it("미획득 배지에 현재/목표·남은수치를 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    // workout_30 미획득: 12/30, 남은 18
    expect(html).toContain("12 / 30회");
    expect(html).toContain("앞으로 18회");
  });

  it("희귀도 라벨과 보상을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("RARE");
    expect(html).toContain("+800");
  });
});

describe("획득일 표시 (2026-08-14)", () => {
  /**
   * ⚠️⚠️ 회귀선이다. `earned_at`은 DB→앱까지 오는데 화면이 한 번도 안 그렸다 —
   * `badge-showcase.tsx`는 정렬에만 썼고 이 파일은 아예 안 썼다.
   * **배지가 수집물인데 언제 무엇을 땄는지 볼 자리가 앱에 없었다.**
   *
   * `sheet(12)`는 `workout_10`을 2026-07-20에 딴 상태다 → `7월 20일`.
   * `new Date("2026-07-20")`은 UTC 자정 = KST 09:00이라 KST 날짜도 7월 20일이다.
   */
  it("획득한 배지에는 딴 날짜가 보인다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(12)} onClose={() => {}} />,
    );
    expect(html).toContain("7월 20일 획득");
  });

  /** 미획득 행은 `앞으로 N회 · +N P`를 그린다 — 날짜가 끼면 안 된다 */
  it("아무것도 못 딴 상태에서는 날짜가 안 보인다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet achievements={sheet(5)} onClose={() => {}} />,
    );
    expect(html).not.toContain("획득");
  });
});
