// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));

import { UserAvatar } from "./user-avatar";
import { __resetCharacterFacesForTest } from "@/lib/character-faces";

beforeEach(() => {
  vi.clearAllMocks();
  __resetCharacterFacesForTest();
});
afterEach(cleanup);

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

function face(container: HTMLElement) {
  return container.querySelector<HTMLImageElement>('img[src*="evolution_avatar_"]');
}

describe("UserAvatar — 챌린지 참가자 아바타", () => {
  it("사진이 없으면 그 사람의 단계·외형에 맞는 얼굴이 뜬다 (여성 2단계)", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 2, variant: "female" }], error: null });
    const { container } = render(<UserAvatar userId={A} src="🧔" className="x" />);
    // 값이 오기 전에는 기존 이모지 — 깨지지 않는다
    expect(container.textContent).toContain("🧔");
    await waitFor(() => expect(face(container)).not.toBeNull());
    expect(face(container)!.getAttribute("src")).toBe("/characters/female/avatar/evolution_avatar_02.webp");
  });

  it("남성이면 남성 얼굴 — 다른 사람의 외형을 내 것으로 그리지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 4, variant: "male" }], error: null });
    const { container } = render(<UserAvatar userId={A} src={null} />);
    await waitFor(() => expect(face(container)).not.toBeNull());
    expect(face(container)!.getAttribute("src")).toBe("/characters/avatar/evolution_avatar_04.webp");
  });

  it("직접 올린 사진이 있으면 사진이 우선이다", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 4, variant: "male" }], error: null });
    const { container } = render(<UserAvatar userId={A} src="https://cdn.example/me.jpg" />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(face(container)).toBeNull();
    expect(container.querySelector('img[src="https://cdn.example/me.jpg"]')).not.toBeNull();
  });

  it("같은 화면의 여러 아바타는 요청 한 번으로 묶인다 (배치)", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { user_id: A, stage: 1, variant: "male" },
        { user_id: B, stage: 2, variant: "female" },
        { user_id: C, stage: 3, variant: "male" },
      ],
      error: null,
    });
    const { container } = render(
      <>
        <UserAvatar userId={A} src="🧔" />
        <UserAvatar userId={B} src="🧔" />
        <UserAvatar userId={C} src="🧔" />
        <UserAvatar userId={A} src="🧔" />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll('img[src*="evolution_avatar_"]')).toHaveLength(4));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const ids = mocks.rpc.mock.calls[0][1].p_user_ids as string[];
    expect([...ids].sort()).toEqual([A, B, C]); // 중복 없이
  });

  it("값을 못 받으면(관계 없음·조회 실패) 기존 아바타 그대로다", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { container } = render(<UserAvatar userId={A} src="🧔" />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(face(container)).toBeNull();
    expect(container.textContent).toContain("🧔");
  });

  it("RPC 오류여도 화면을 막지 않는다", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const { container } = render(<UserAvatar userId={B} src="🧔" />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(container.textContent).toContain("🧔");
  });

  it("userId가 없으면 조회하지 않는다", () => {
    const { container } = render(<UserAvatar userId={undefined} src="🧔" />);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(container.textContent).toContain("🧔");
  });

  it("한 번 받은 값은 다시 묻지 않는다 (캐시)", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: A, stage: 1, variant: "male" }], error: null });
    const first = render(<UserAvatar userId={A} src="🧔" />);
    await waitFor(() => expect(face(first.container)).not.toBeNull());
    first.unmount();
    const second = render(<UserAvatar userId={A} src="🧔" />);
    expect(face(second.container)).not.toBeNull(); // 즉시
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
