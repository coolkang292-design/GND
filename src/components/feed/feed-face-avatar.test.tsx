// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getActiveCrewSessions: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/social", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social")>();
  return { ...actual, getActiveCrewSessions: mocks.getActiveCrewSessions };
});
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));

import { StoryTray } from "./story-tray";
import { LikersSheet } from "./likers-sheet";
import { __resetCharacterFacesForTest } from "@/lib/character-faces";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  __resetCharacterFacesForTest();
});

function faces(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLImageElement>('img[src*="evolution_avatar_"]')].map(
    (i) => i.getAttribute("src"),
  );
}

describe("피드 아바타 — 이모지 대신 진화 캐릭터 얼굴", () => {
  it("운동 중 스토리 트레이: 사진 없는 크루는 그 사람의 단계·외형 얼굴이 뜬다", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { user_id: A, stage: 2, variant: "female" },
        { user_id: B, stage: 4, variant: "male" },
      ],
      error: null,
    });
    const sessions = [
      { sessionId: "s1", userId: A, nickname: "스칼레또", avatarUrl: "🧔", startedAt: new Date(), exerciseNames: [] },
      { sessionId: "s2", userId: B, nickname: "낭만송곳니", avatarUrl: null, startedAt: new Date(), exerciseNames: [] },
    ];
    mocks.getActiveCrewSessions.mockResolvedValue(sessions);
    const { container } = render(<StoryTray />);
    await waitFor(() => expect(container.textContent).toContain("스칼레또"));
    await waitFor(() => expect(faces(container)).toHaveLength(2));
    expect(faces(container)).toEqual([
      "/characters/female/avatar/evolution_avatar_02.webp",
      "/characters/avatar/evolution_avatar_04.webp",
    ]);
    // 두 사람이어도 조회는 한 번
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("직접 올린 사진이 있으면 사진이 우선이다", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 2, variant: "female" }], error: null });
    const sessions = [
      { sessionId: "s1", userId: A, nickname: "스칼레또", avatarUrl: "https://cdn.example/a.jpg", startedAt: new Date(), exerciseNames: [] },
    ];
    mocks.getActiveCrewSessions.mockResolvedValue(sessions);
    const { container } = render(<StoryTray />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(faces(container)).toHaveLength(0);
    expect(container.querySelector('img[src="https://cdn.example/a.jpg"]')).not.toBeNull();
  });

  it("좋아요 명단: 이름·아바타를 아는 사람은 얼굴이 뜬다", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 3, variant: "male" }], error: null });
    const people = new Map([[A, { nickname: "스칼레또", avatarUrl: "🧔" }]]);
    const { container } = render(
      <LikersSheet likers={[A, B]} people={people} viewerId="me" onClose={() => {}} />,
    );
    await waitFor(() => expect(faces(container)).toHaveLength(1));
    expect(faces(container)[0]).toBe("/characters/avatar/evolution_avatar_03.webp");
    // 이름을 모르는 사람(B)은 기존 그대로 "크루원"
    expect(container.textContent).toContain("크루원");
  });

  it("관계가 없어 값을 못 받으면 이모지 그대로다 (오류도 화면을 막지 않는다)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const sessions = [
      { sessionId: "s1", userId: A, nickname: "누구", avatarUrl: "🧔", startedAt: new Date(), exerciseNames: [] },
    ];
    mocks.getActiveCrewSessions.mockResolvedValue(sessions);
    const { container } = render(<StoryTray />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(faces(container)).toHaveLength(0);
    expect(container.textContent).toContain("🧔");
  });
});
