import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeShowcase } from "./badge-showcase";
import { badgeShelf, type BadgeMeta, type EarnedBadge } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "시작이 반이라지만",
    tier: "bronze", rarity: "common", metricKey: "workout_count", threshold: 1, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번 찍었개", description: "안 넘어가는 나무",
    tier: "bronze", rarity: "common", metricKey: "workout_count", threshold: 10, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "또 모았개",
    tier: "bronze", rarity: "common", metricKey: "streak_days", threshold: 5, pointReward: 500,
    repeatable: true, repeatStep: 5, sortOrder: 301 },
];

const EARNED: EarnedBadge[] = [
  { badgeKey: "workout_1", periodKey: "lifetime", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-20", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-25", earnedAt: new Date("2026-07-25") },
];

describe("BadgeShowcase — 성취별 대표 배지", () => {
  it("6개 지표별 카드를 표시한다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("대표 배지");
    expect(html).toContain("전체 배지");
    for (const label of ["운동 횟수", "누적 시간", "연속 운동", "운동 볼륨", "이동 거리", "기록 갱신"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<li /g)).toHaveLength(6);
  });

  it("획득한 배지만 표시하고 미획득 카테고리는 잠금 상태로 남긴다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("workout_1.webp");
    expect(html).toContain("streak_5.webp");
    expect(html).not.toContain("workout_10.webp");
    expect(html).toContain("미획득");
  });

  it("반복 배지 획득 횟수를 유지한다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("×2");
  });

  it("획득한 배지가 하나도 없어도 6칸을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, [])} onOpenAll={() => {}} />,
    );
    expect(html).toContain("대표 배지");
    expect(html.match(/미획득/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
