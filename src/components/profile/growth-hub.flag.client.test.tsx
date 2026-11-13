// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ flag: false }));
// 이 테스트가 보는 것은 카드의 유무뿐이다 — 나머지 자식은 비운다
const stub = vi.hoisted(() => () => () => null);

vi.mock("@/lib/flags", () => ({
  get GROWTH_V2() {
    return mocks.flag;
  },
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "not"]) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
      return b;
    },
  }),
}));
vi.mock("@/lib/progression", () => ({
  getProgressSummary: async () => ({ totalXp: 1500, currentLevel: 7, currentStage: 2, characterVariant: "a" }),
  getLevelRewards: async () => [],
  getMyUnlocks: async () => new Set<string>(),
  getRecentXpTransactions: async () => [],
  getCrewMemberProfile: async () => ({ workoutCount: 0, joinedAt: null, levelUps: [], badges: [] }),
}));
vi.mock("@/lib/points", () => ({
  getMyWallet: async () => ({ balance: 0 }),
  getRecentPointTransactions: async () => [],
}));
vi.mock("@/lib/badges", () => ({
  getBadgeCatalog: async () => [],
  getMyBadges: async () => [],
  getMyBadgeMetrics: async () => ({}),
}));

// 이 테스트가 보는 것은 카드의 유무뿐이다 — 나머지 자식은 비운다
vi.mock("@/components/profile/current-stage-card", () => ({ CurrentStageCard: stub() }));
vi.mock("@/components/profile/evolution-status-card", () => ({ EvolutionStatusCard: () => <div data-testid="stub-evolution" /> }));
vi.mock("@/components/profile/growth-timeline", () => ({ GrowthTimeline: stub() }));
vi.mock("@/components/profile/level-rewards", () => ({ LevelRewards: stub() }));
vi.mock("@/components/profile/next-stage-preview", () => ({ NextStagePreview: stub() }));
vi.mock("@/components/profile/stage-carousel", () => ({ StageCarousel: stub() }));
vi.mock("@/components/profile/stage-guide-sheet", () => ({ StageGuideSheet: stub() }));
vi.mock("@/components/profile/xp-guide-sheet", () => ({ XpGuideSheet: stub() }));
vi.mock("@/components/profile/xp-history", () => ({ XpHistory: stub(), XpHistoryList: stub() }));
vi.mock("@/components/profile/point-history", () => ({ PointHistory: stub(), PointHistoryList: stub() }));
vi.mock("@/components/profile/history-sheet", () => ({ HistorySheet: stub() }));
vi.mock("@/components/profile/badge-sheet", () => ({ BadgeSheet: stub() }));
vi.mock("@/components/profile/badge-showcase", () => ({ BadgeShowcase: stub() }));
vi.mock("@/components/profile/growth-summary-card", () => ({ GrowthSummaryCard: stub() }));
vi.mock("@/components/profile/recent-achievement-history", () => ({ RecentAchievementHistory: stub() }));
vi.mock("@/components/profile/next-goal-card", () => ({ NextGoalCard: stub() }));
vi.mock("@/components/profile/point-summary", () => ({ PointSummary: stub() }));
vi.mock("@/components/profile/level-growth-card", () => ({
  LevelGrowthCard: (p: { userId: string; level: number }) => (
    <div data-testid="level-growth-card" data-user={p.userId} data-level={p.level} />
  ),
}));

import { GrowthHub } from "./growth-hub";

beforeEach(() => {
  mocks.flag = false;
});
afterEach(() => cleanup());

describe("GrowthHub — GROWTH_V2 플래그", () => {
  it("꺼져 있으면 '내 성장' 카드가 없고 기존 진화 카드는 그대로다", async () => {
    render(<GrowthHub />);
    await waitFor(() => expect(screen.getByTestId("stub-evolution")).toBeDefined());
    expect(screen.queryByTestId("level-growth-card")).toBeNull();
  });

  it("켜져 있으면 진화 카드 바로 아래에 현재 레벨로 카드가 나온다", async () => {
    mocks.flag = true;
    render(<GrowthHub />);
    const card = await screen.findByTestId("level-growth-card");
    expect(card.getAttribute("data-user")).toBe("me");
    expect(card.getAttribute("data-level")).toBe("7");
    const evo = screen.getByTestId("stub-evolution");
    expect(evo.nextElementSibling).toBe(card);
  });
});
