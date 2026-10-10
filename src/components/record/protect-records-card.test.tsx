// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **첫 운동을 마친 익명 사용자에게 기록 지키기를 권하는가** (2026-10-11, Issue #2 P0-2).
 *
 * "닉네임만 정하고 바로 시작"으로 들어온 사람은 소셜 신원이 0개다. 브라우저를 지우면
 * 기록이 사라지고, 다른 기기에서 같은 카카오로 먼저 가입하면 영영 못 붙인다
 * (`identity_already_exists`). 그래서 **가치를 막 느낀 순간**에 연결을 권한다.
 */

const mocks = vi.hoisted(() => ({
  linked: false,
  linkFail: null as Error | null,
  linkProvider: vi.fn(),
}));

vi.mock("@/lib/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity")>()),
  hasLinkedIdentity: async () => mocks.linked,
  linkProvider: async (p: string) => {
    mocks.linkProvider(p);
    if (mocks.linkFail) throw mocks.linkFail;
  },
}));

import { ProtectRecordsCard } from "./protect-records-card";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

beforeEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
  mocks.linked = false;
  mocks.linkFail = null;
  mocks.linkProvider.mockReset();
});

afterEach(() => {
  cleanup();
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL_FLAG;
});

describe("ProtectRecordsCard", () => {
  it("익명이면 기록 지키기 카드와 카카오·구글 버튼이 뜬다", async () => {
    render(<ProtectRecordsCard />);
    expect(await screen.findByText(/방금 기록, 지켜 둘까요/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "카카오로 지키기" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "구글로 지키기" })).not.toBeNull();
  });

  it("⚠️ 이미 신원이 붙은 사람에게는 안 뜬다 — 지킬 필요가 없다", async () => {
    mocks.linked = true;
    render(<ProtectRecordsCard />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/방금 기록, 지켜 둘까요/)).toBeNull();
  });

  it("누르면 linkProvider로 **지금 계정에** 붙인다 (새 계정 로그인이 아니다)", async () => {
    render(<ProtectRecordsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "카카오로 지키기" }));
    await waitFor(() => expect(mocks.linkProvider).toHaveBeenCalledWith("kakao"));
  });

  it("연결이 실패하면 이유를 보여주고 다시 누를 수 있다", async () => {
    mocks.linkFail = Object.assign(new Error("Identity is already linked to another user"), {
      code: "identity_already_exists",
    });
    render(<ProtectRecordsCard />);
    fireEvent.click(await screen.findByRole("button", { name: "카카오로 지키기" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "카카오로 지키기" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
