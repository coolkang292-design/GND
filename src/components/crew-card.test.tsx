// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewCard } from "./crew-card";

const mocks = vi.hoisted(() => ({
  getMyGroups: vi.fn(),
  createGroup: vi.fn(),
  joinGroupWithCode: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    userId: "me",
    loading: false,
    configured: true,
    error: null,
  }),
}));

vi.mock("@/lib/crew", () => ({
  getMyGroups: mocks.getMyGroups,
  createGroup: mocks.createGroup,
  joinGroupWithCode: mocks.joinGroupWithCode,
}));

const GROUP = {
  id: "g1",
  name: "리얼GND",
  invite_code: "GND-U2X6G",
  owner_id: "me",
  created_at: "2026-07-01T00:00:00Z",
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyGroups.mockResolvedValue([GROUP]);
});

describe("CrewCard — 크루 정체성과 초대만 남는다", () => {
  it("크루명과 초대 코드를 보여준다", async () => {
    render(<CrewCard />);
    await waitFor(() => expect(screen.getByText("👥 리얼GND")).toBeTruthy());
    expect(screen.getByText("GND-U2X6G")).toBeTruthy();
    expect(screen.getByText("초대 링크 복사")).toBeTruthy();
  });

  /**
   * ⚠️ 2026-08-07 사용자 질문 — "이건 챌린지 초대가 아니라 GND 앱 초대인 거지?"
   * 옛 문구("초대 링크를 보내면 친구가 크루로 들어와요")는 **무엇에 대한 초대인지**를
   * 말하지 않아 챌린지 초대와 헷갈렸다. 실제 동작(`invite/[code]`)을 그대로 적는다.
   */
  it("GND 앱 초대라는 것과 처음 온 친구가 뭘 하는지 말해준다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() => expect(screen.getByText("👥 리얼GND")).toBeTruthy());
    expect(container.innerHTML).toContain("GND 앱에 친구를 부르는 링크");
    expect(container.innerHTML).toContain("닉네임만 정하면");
    // auth-provider가 signInAnonymously로 계정을 바로 발급하고, 온보딩 화면엔
    // 이메일·비밀번호 입력칸이 없다 — 그 사실을 화면이 말해야 한다.
    expect(container.innerHTML).toContain("이메일 가입 없이");
  });

  it("챌린지 초대와 다르다는 것을 짚어 준다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() => expect(screen.getByText("👥 리얼GND")).toBeTruthy());
    expect(container.innerHTML).toContain("챌린지 초대와는 달라요");
  });

  /**
   * ⚠️ 부정 확인 — 2026-08-07에 찌르기를 친구 목록 카드로 **옮겼다**.
   * 여기 되살리면 `poked` 상태가 두 벌이 되어 한쪽 버튼이 거짓말을 한다.
   * 설계 §6.6 참조.
   */
  it("콕 찌르기가 없다 — 친구 목록 카드로 옮겼다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() => expect(screen.getByText("👥 리얼GND")).toBeTruthy());
    expect(container.innerHTML).not.toContain("콕");
    expect(container.innerHTML).not.toContain("찌름");
    expect(container.innerHTML).not.toContain("찌를 수 있어요");
  });

  it("멤버 칩 줄이 없다 — 같은 사람이 친구 목록에 더 자세히 나온다", async () => {
    render(<CrewCard />);
    await waitFor(() => expect(screen.getByText("👥 리얼GND")).toBeTruthy());
    // 칩을 그리려면 크루 명단 조회가 있어야 한다. 그 조회 자체가 사라졌다.
    expect(screen.queryByText(/명$/)).toBeNull();
  });

  it("크루가 없으면 만들기·참여 CTA로 바뀐다", async () => {
    mocks.getMyGroups.mockResolvedValue([]);
    render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("＋ 크루 만들기")).toBeTruthy(),
    );
    expect(screen.getByText("초대 코드로 참여")).toBeTruthy();
  });

  it("판정 전에는 아무것도 그리지 않는다 — 깜빡임 방지", () => {
    mocks.getMyGroups.mockReturnValue(new Promise(() => {})); // 영원히 미해결
    const { container } = render(<CrewCard />);
    expect(container.innerHTML).toBe("");
  });
});
