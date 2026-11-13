// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCrewMemberProfile: vi.fn(),
  getBadgeCatalog: vi.fn(),
  uploadAvatarPhoto: vi.fn(),
  updateMyAvatar: vi.fn(),
  recordProfileView: vi.fn(),
  getMyEvolutionStatus: vi.fn(),
}));

vi.mock("@/lib/progression", () => ({
  getCrewMemberProfile: mocks.getCrewMemberProfile,
}));
vi.mock("@/lib/badges", () => ({ getBadgeCatalog: mocks.getBadgeCatalog }));
vi.mock("@/lib/avatar", () => ({ uploadAvatarPhoto: mocks.uploadAvatarPhoto }));
vi.mock("@/lib/crew", () => ({ updateMyAvatar: mocks.updateMyAvatar }));
vi.mock("@/lib/profile-views", () => ({
  recordProfileView: mocks.recordProfileView,
}));
vi.mock("@/lib/evolution", () => ({
  getMyEvolutionStatus: mocks.getMyEvolutionStatus,
}));
// 시트의 진화 카드는 서버 판정을 스스로 조회한다. 이 시험은 서버 규칙이 없는 상태(null → 옛 카드)를 본다.
vi.mock("@/lib/stage-evolution", () => ({
  getMyStageEvolutionStatus: async () => null,
}));

import { MemberProfileSheet } from "./member-profile-sheet";
import { evolutionAvatarSrc } from "@/lib/domain/character-variant";
import { evaluateEvolution } from "@/lib/domain/evolution";

function profile(over: Record<string, unknown> = {}) {
  return {
    totalXp: 8040, currentLevel: 18, currentStage: 4, stageName: "꾸준러",
    characterPath: "/characters/char-4.png", characterVariant: "male",
    nextLevelRequiredXp: 8400, xpToNextLevel: 360, levelProgressPercent: 60,
    badges: [], joinedAt: null, levelUps: [], workoutCount: 0, totalMinutes: 0,
    workoutDays: 0, distanceMeters: 0, bio: null, instagramUrl: null, youtubeUrl: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBadgeCatalog.mockResolvedValue([]);
  mocks.getMyEvolutionStatus.mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

function open(opts: { avatarUrl: string | null; own?: boolean; p?: Record<string, unknown> }) {
  mocks.getCrewMemberProfile.mockResolvedValue(profile(opts.p));
  return render(
    <MemberProfileSheet
      userId="me"
      nickname="오뎅끼데스까"
      avatarUrl={opts.avatarUrl}
      onAvatarChanged={opts.own ? vi.fn() : undefined}
      onClose={() => {}}
    />,
  );
}

function faceImg(container: HTMLElement) {
  return container.querySelector<HTMLImageElement>('img[src*="evolution_avatar_"]');
}

describe("evolutionAvatarSrc — 7단계 × 남·여", () => {
  it("단계별 얼굴 경로가 한 곳에서 만들어진다", () => {
    for (let s = 1; s <= 7; s++) {
      expect(evolutionAvatarSrc(s, "male")).toBe(`/characters/avatar/evolution_avatar_0${s}.webp`);
      expect(evolutionAvatarSrc(s, "female")).toBe(
        `/characters/female/avatar/evolution_avatar_0${s}.webp`,
      );
    }
  });
  it("범위 밖 단계는 null — 기존 아바타로 되돌린다", () => {
    expect(evolutionAvatarSrc(0, "male")).toBeNull();
    expect(evolutionAvatarSrc(8, "female")).toBeNull();
    expect(evolutionAvatarSrc(2.5, "male")).toBeNull();
    expect(evolutionAvatarSrc(Number.NaN, "male")).toBeNull();
  });
});

describe("프로필 시트 얼굴 아바타 — 우선순위: 사진 > 진화 얼굴 > 이모지", () => {
  it("사진이 없으면(이모지) 현재 단계의 얼굴이 뜬다 — 4단계 남성", async () => {
    const { container } = open({ avatarUrl: "🧔" });
    await waitFor(() => expect(faceImg(container)).not.toBeNull());
    expect(faceImg(container)!.getAttribute("src")).toBe("/characters/avatar/evolution_avatar_04.webp");
  });

  it("여성이면 여성 얼굴 경로 — 2단계 여성", async () => {
    const { container } = open({
      avatarUrl: "🧔",
      p: { currentStage: 2, characterVariant: "female" },
    });
    await waitFor(() => expect(faceImg(container)).not.toBeNull());
    expect(faceImg(container)!.getAttribute("src")).toBe(
      "/characters/female/avatar/evolution_avatar_02.webp",
    );
  });

  it("직접 올린 사진이 있으면 사진이 우선이다 (얼굴 이미지는 안 뜬다)", async () => {
    const { container } = open({ avatarUrl: "https://cdn.example/me.jpg" });
    await screen.findByText(/꾸준러/);
    expect(faceImg(container)).toBeNull();
    expect(container.querySelector('img[src="https://cdn.example/me.jpg"]')).not.toBeNull();
  });

  it("내 시트에서도 사진이 없으면 얼굴이 뜨고, 카메라 버튼은 그대로 있다", async () => {
    const { container } = open({ avatarUrl: null, own: true });
    await waitFor(() => expect(faceImg(container)).not.toBeNull());
    expect(screen.getByRole("button", { name: "프로필 사진 바꾸기" })).not.toBeNull();
  });

  it("얼굴 이미지를 못 불러오면 기존 이모지로 되돌린다", async () => {
    const { container } = open({ avatarUrl: "🧔" });
    await waitFor(() => expect(faceImg(container)).not.toBeNull());
    fireEvent.error(faceImg(container)!);
    expect(faceImg(container)).toBeNull();
    expect(container.textContent).toContain("🧔");
  });

  it("조회 전(프로필 없음)에는 얼굴 대신 기존 아바타", () => {
    mocks.getCrewMemberProfile.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <MemberProfileSheet userId="me" nickname="오뎅끼데스까" avatarUrl="🧔" onClose={() => {}} />,
    );
    expect(faceImg(container)).toBeNull();
    expect(container.textContent).toContain("🧔");
  });
});

describe("내 프로필 시트 — 다음 진화 현황", () => {
  it("내 시트에는 진화 현황이 있고, 남의 시트에는 없다", async () => {
    const status = evaluateEvolution({
      totalXp: 8040, currentStage: 4, today: "2026-11-06",
      workoutDays: ["2026-10-01"], growth: { measuredCount: 0, baselineCount: 0, value: null },
    });
    mocks.getMyEvolutionStatus.mockResolvedValue(status);

    const mine = open({ avatarUrl: "🧔", own: true });
    await screen.findByText("다음엔 이렇게 진화해요");
    mine.unmount();

    open({ avatarUrl: "🧔", own: false });
    await screen.findByText(/꾸준러/);
    expect(screen.queryByText("다음엔 이렇게 진화해요")).toBeNull();
  });
});
