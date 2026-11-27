// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 크루가 0명이면 피드에 예시가 펼쳐진다 (2026-11-26 사용자 결정 "크루가 생기면 사라지게").
 *
 * ⚠️ 부정 확인이 반이다 — 크루가 있는 사람에게 가짜 게시물이 섞여 보이면 사고다.
 */
const mocks = vi.hoisted(() => ({
  getCrewFeed: vi.fn(),
  getMyCrewIds: vi.fn(),
}));
vi.mock("@/lib/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social")>()),
  getCrewFeed: mocks.getCrewFeed,
  getMyCrewIds: mocks.getMyCrewIds,
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));
vi.mock("@/components/feed/discoverable-challenges", () => ({
  useDiscoverableChallenges: () => ({ items: [], setItems: () => {} }),
  DiscoverableChallengeList: () => <p>모집 목록</p>,
}));
vi.mock("@/components/feed/story-tray", () => ({ StoryTray: () => null }));
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/crew/member-profile-sheet", () => ({ MemberProfileSheet: () => null }));

import FeedPage from "./page";

afterEach(cleanup);
beforeEach(() => {
  mocks.getCrewFeed.mockReset().mockResolvedValue([]);
  mocks.getMyCrewIds.mockReset();
});

describe("피드 — 크루 0명이면 예시를 펼친다", () => {
  it("크루 0명 + 내 운동 0개 → 빈 안내 아래에 예시 카드 3개", async () => {
    mocks.getMyCrewIds.mockResolvedValue([]);
    render(<FeedPage />);

    const preview = await screen.findByTestId("example-feed-preview");
    expect(screen.getByText("아직 운동 기록이 없어요")).toBeTruthy();
    expect(preview.querySelectorAll("article")).toHaveLength(3);
    expect(preview.textContent).toContain("예시 · 실제 회원이 아니에요");
    // 입구 링크를 두 번 그리지 않는다 — 예시가 바로 아래 있으니까
    expect(screen.queryByText("예시로 하루치 피드를 미리 볼 수 있어요")).toBeNull();
  });

  it("크루가 있으면 예시가 없다 (빈 피드면 링크만)", async () => {
    mocks.getMyCrewIds.mockResolvedValue(["friend-1"]);
    render(<FeedPage />);

    await screen.findByText("아직 운동 기록이 없어요");
    await waitFor(() => expect(mocks.getMyCrewIds).toHaveBeenCalled());
    expect(screen.queryByTestId("example-feed-preview")).toBeNull();
    expect(screen.getByText("예시로 하루치 피드를 미리 볼 수 있어요")).toBeTruthy();
  });

  it("크루 수를 못 읽으면 예시를 그리지 않는다 — 틀리게 보여 주느니 안 보여 준다", async () => {
    mocks.getMyCrewIds.mockRejectedValue(new Error("network"));
    render(<FeedPage />);

    await screen.findByText("아직 운동 기록이 없어요");
    expect(screen.queryByTestId("example-feed-preview")).toBeNull();
  });

  it("예시의 '모집 중인 챌린지 보러 가기'는 모집 탭으로 바꾼다", async () => {
    mocks.getMyCrewIds.mockResolvedValue([]);
    render(<FeedPage />);

    await screen.findByTestId("example-feed-preview");
    fireEvent.click(screen.getByRole("button", { name: /모집 중인 챌린지 보러 가기/ }));
    expect(screen.getByText("모집 목록")).toBeTruthy();
    expect(screen.queryByTestId("example-feed-preview")).toBeNull();
  });
});
