// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewCard } from "./crew-card";

const mocks = vi.hoisted(() => ({
  issueMyInviteCode: vi.fn(),
  getMyGroups: vi.fn(),
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
  issueMyInviteCode: mocks.issueMyInviteCode,
  getMyGroups: mocks.getMyGroups,
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.issueMyInviteCode.mockResolvedValue("GND-U2X6G");
});

describe("CrewCard — 크루 정체성과 초대만 남는다", () => {
  it("초대 코드를 보여준다", async () => {
    render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    expect(screen.getByText("GND-U2X6G")).toBeTruthy();
    expect(screen.getByText("초대 링크 복사")).toBeTruthy();
  });

  /**
   * ⚠️ 2026-08-07 사용자 지적 — 운영에서 이 헤딩이 `👥 리얼GND`로 떴다.
   * `groups.name`을 그대로 헤딩에 쓰고 있었는데, 그 이름은 사용자가 오래전에
   * 지은 것이라 **카드가 무엇을 하는 곳인지 말해 주지 않는다**.
   *
   * ⚠️ 2026-08-08(0061)에 이 카드가 `groups`를 **아예 조회하지 않게** 됐다.
   * 그래서 그룹명이 새어 나올 경로 자체가 없어졌지만, 단언은 남긴다 —
   * 다음 사람이 그룹 조회를 되살릴 때 이 테스트가 먼저 막는다.
   */
  it("그룹을 조회하지도, 그룹 이름을 쓰지도 않는다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    expect(container.innerHTML).not.toContain("리얼GND");
    // 0061: 코드 주인이 사람이라 그룹 조회가 필요 없다
    expect(mocks.getMyGroups).not.toHaveBeenCalled();
    expect(mocks.issueMyInviteCode).toHaveBeenCalled();
  });

  /**
   * ⚠️ 2026-08-07 사용자 지적 — "문구가 너무 길다. 심플하게 한줄로 설명하고
   * 클릭하면 자세한 정보 나오게." 카드가 다섯 줄짜리 벽이 돼 있었다.
   *
   * 접힌 상태에서 **한 줄만** 남는지를 부정 단언으로 고정한다. 새 한 줄이 있는
   * 것만 보면, 긴 설명이 아래에 그대로 붙어 있어도 통과한다.
   */
  it("접혀 있을 때는 한 줄만 말한다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    // 무엇에 대한 초대인지는 접힌 상태에서도 말해야 한다 (2026-08-07 사용자 질문)
    expect(container.innerHTML).toContain("GND 앱에 친구를 부르는 링크");
    // 상세는 접혀 있다
    expect(container.innerHTML).not.toContain("닉네임만 정하면");
    expect(container.innerHTML).not.toContain("카카오나 구글을 연결");
    expect(container.innerHTML).not.toContain("챌린지 초대와는 달라요");
  });

  /**
   * ⚠️ 2026-08-07 사용자 질문 — "이건 챌린지 초대가 아니라 GND 앱 초대인 거지?"
   * 옛 문구("초대 링크를 보내면 친구가 크루로 들어와요")는 **무엇에 대한 초대인지**를
   * 말하지 않아 챌린지 초대와 헷갈렸다. 실제 동작(`invite/[code]`)을 그대로 적는다.
   *
   * 길이 때문에 접었을 뿐 **내용을 버린 게 아니다** — 펼치면 전부 있어야 한다.
   */
  it("펼치면 처음 온 친구가 뭘 하는지·챌린지와 뭐가 다른지 나온다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("자세히"));

    expect(container.innerHTML).toContain("닉네임만 정하면");
    expect(container.innerHTML).toContain("챌린지 초대와는 달라요");
  });

  it("펼친 것을 다시 접을 수 있다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    const toggle = screen.getByText("자세히");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.innerHTML).not.toContain("닉네임만 정하면");
  });

  /**
   * ⚠️ 2026-08-07 사용자 지적 — 옛 문구는 `이메일 가입 없이`를 **장점처럼** 광고했다.
   * 그런데 같은 앱의 계정 화면(`account/page.tsx`)은 정확히 그 상태를 이렇게 경고한다:
   * "브라우저 데이터를 지우면 기록·XP·배지에 다시 접근할 수 없어요."
   * 앱이 한쪽에선 팔고 한쪽에선 말리고 있었다. 파는 쪽을 지운다.
   *
   * ⚠️ **접힌 상태와 펼친 상태 둘 다** 확인한다. 한쪽만 보면 접기 기능을 넣으면서
   * 옛 문구가 상세 안으로 숨어 들어가도 통과한다.
   */
  it("이메일 없이 쓰는 것을 장점으로 광고하지 않는다 — 접든 펼치든", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    expect(container.innerHTML).not.toContain("이메일 가입 없이");

    fireEvent.click(screen.getByText("자세히"));
    expect(container.innerHTML).not.toContain("이메일 가입 없이");
    // 계정 화면과 같은 사실을 말해야 한다 — 연결해야 기록이 지켜진다.
    expect(container.innerHTML).toContain("데이터를 지우면 기록");
  });

  /**
   * ⚠️ 2026-08-07 사용자 질문 — "이메일을 연결은 조인 하고 내정보에서 할수 있나?"
   * 그때 답은 **아니다**였고(이메일 발송 한도 429), 문구가 "크루장이 대신 붙여
   * 줘요"였다.
   *
   * 2026-08-08에 답이 바뀌었다 — `/account`에서 카카오·구글을 **본인이** 연결한다.
   * 그래서 이 단언도 뒤집혔다. 할 수 있는 일이 생겼는데 크루장을 찾으라고 두면
   * 헛걸음을 시킨다. 옛 문구가 되살아나면 실패해야 한다.
   */
  it("계정을 어디서 지키는지 말한다 — 이제 본인이 한다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    fireEvent.click(screen.getByText("자세히"));
    expect(container.innerHTML).toContain("내 정보 → 계정");
    expect(container.innerHTML).toContain("카카오나 구글을 연결");
    expect(container.innerHTML).not.toContain("크루장이 대신 붙여");
  });

  /**
   * ⚠️ 부정 확인 — 2026-08-07에 찌르기를 친구 목록 카드로 **옮겼다**.
   * 여기 되살리면 `poked` 상태가 두 벌이 되어 한쪽 버튼이 거짓말을 한다.
   * 설계 §6.6 참조.
   */
  it("콕 찌르기가 없다 — 친구 목록 카드로 옮겼다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    expect(container.innerHTML).not.toContain("콕");
    expect(container.innerHTML).not.toContain("찌름");
    expect(container.innerHTML).not.toContain("찌를 수 있어요");
  });

  it("멤버 칩 줄이 없다 — 같은 사람이 친구 목록에 더 자세히 나온다", async () => {
    render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    // 칩을 그리려면 크루 명단 조회가 있어야 한다. 그 조회 자체가 사라졌다.
    expect(screen.queryByText(/명$/)).toBeNull();
  });

  /**
   * ⚠️ 부정 확인 — 2026-08-08(0061)에 `NoCrewCard`("＋ 크루 만들기 / 초대 코드로
   * 참여")를 **지웠다.**
   *
   * 옛 카드는 그룹이 없으면 그 CTA로 갈아탔는데, 그 탓에 **그룹이 없는 사람은
   * 친구 초대를 아예 할 수 없었다.** 그룹은 이제 `create_challenge_room`(0062)이
   * 챌린지를 만들 때 자동으로 만들므로 사용자에게 물을 이유가 없고, 친구가 0명일
   * 때의 안내는 친구 목록 카드가 카드 안에서 이미 한다 — 둘을 같이 두면 홈에
   * "크루와 함께하면 더 강해져요"와 "친구와 함께하면 더 강해져요"가 나란히 뜬다.
   *
   * 되살리려면 그 두 카드가 같은 화면에서 어떻게 보이는지 먼저 확인하라.
   */
  it("크루 만들기·참여 CTA가 없다 — 그룹은 챌린지 만들 때 자동 생성된다", async () => {
    const { container } = render(<CrewCard />);
    await waitFor(() =>
      expect(screen.getByText("친구 초대하기")).toBeTruthy(),
    );
    expect(container.innerHTML).not.toContain("크루 만들기");
    expect(container.innerHTML).not.toContain("초대 코드로 참여");
    expect(container.innerHTML).not.toContain("크루와 함께하면");
  });

  /**
   * 프로필이 아직 없으면(온보딩 직전) 서버가 `no_profile`을 던진다.
   * 카드를 그리지 않고 조용히 넘긴다 — 홈은 곧 온보딩으로 이동한다.
   */
  it("코드를 못 받으면 카드를 그리지 않는다", async () => {
    mocks.issueMyInviteCode.mockRejectedValue(new Error("no_profile"));
    const { container } = render(<CrewCard />);
    await waitFor(() => expect(mocks.issueMyInviteCode).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("판정 전에는 아무것도 그리지 않는다 — 깜빡임 방지", () => {
    mocks.issueMyInviteCode.mockReturnValue(new Promise(() => {})); // 영원히 미해결
    const { container } = render(<CrewCard />);
    expect(container.innerHTML).toBe("");
  });
});
