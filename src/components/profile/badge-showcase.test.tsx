import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeShowcase } from "./badge-showcase";
import { BadgeSheet } from "./badge-sheet";
import { badgeShelf, type BadgeMeta, type EarnedBadge } from "@/lib/domain/badges";

const CATALOG: BadgeMeta[] = [
  { key: "workout_1", emoji: "🐣", name: "첫 발", description: "시작이 반이라지만",
    tier: "bronze", metricKey: "workout_count", threshold: 1, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 101 },
  { key: "workout_10", emoji: "🦴", name: "열 번 찍었개", description: "안 넘어가는 나무",
    tier: "bronze", metricKey: "workout_count", threshold: 10, pointReward: 300,
    repeatable: false, repeatStep: null, sortOrder: 102 },
  { key: "streak_5", emoji: "🔥", name: "불꽃 5일", description: "또 모았개",
    tier: "bronze", metricKey: "streak_days", threshold: 5, pointReward: 500,
    repeatable: true, repeatStep: 5, sortOrder: 301 },
];

const EARNED: EarnedBadge[] = [
  { badgeKey: "workout_1", periodKey: "lifetime", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-20", earnedAt: new Date("2026-07-20") },
  { badgeKey: "streak_5", periodKey: "2026-07-25", earnedAt: new Date("2026-07-25") },
];

describe("BadgeShowcase", () => {
  it("획득 종류 수와 전체 수를 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("2 / 3");
    expect(html).toContain("전체 보기");
  });

  it("획득한 배지만 진열한다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("workout_1.png");
    expect(html).toContain("streak_5.png");
    expect(html).not.toContain("workout_10.png");
  });

  it("반복 배지는 개수를 붙인다", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, EARNED)} onOpenAll={() => {}} />,
    );
    expect(html).toContain("×2");
  });

  it("하나도 없으면 안내 문구", () => {
    const html = renderToStaticMarkup(
      <BadgeShowcase shelf={badgeShelf(CATALOG, [])} onOpenAll={() => {}} />,
    );
    expect(html).toContain("아직 획득한 배지가 없어요");
    expect(html).toContain("0 / 3");
  });
});

describe("BadgeSheet", () => {
  it("미획득 배지도 비유 문구와 함께 보여준다 — 다음 목표가 되도록", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, EARNED)} onClose={() => {}} />,
    );
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("안 넘어가는 나무");
  });

  it("지표별로 섹션을 나눈다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, EARNED)} onClose={() => {}} />,
    );
    expect(html).toContain("운동 횟수");
    expect(html).toContain("불꽃");
  });

  it("미획득은 잠금 표시, 획득은 지급 포인트를 보여준다", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, EARNED)} onClose={() => {}} />,
    );
    expect(html).toContain("🔒");
    expect(html).toContain("+300 P");
  });

  it("접근성: dialog 역할과 닫기", () => {
    const html = renderToStaticMarkup(
      <BadgeSheet shelf={badgeShelf(CATALOG, [])} onClose={() => {}} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("닫기");
  });
});
