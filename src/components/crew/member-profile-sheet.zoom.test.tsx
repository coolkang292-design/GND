// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCrewMemberProfile: vi.fn(),
  getBadgeCatalog: vi.fn(),
  uploadAvatarPhoto: vi.fn(),
  updateMyAvatar: vi.fn(),
  recordProfileView: vi.fn(),
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

import { MemberProfileSheet } from "./member-profile-sheet";

const PHOTO = "https://cdn.example/friend.jpg";
const ZOOM_LABEL = "스칼레또님 프로필 사진 크게 보기";

beforeEach(() => {
  vi.clearAllMocks();
  // 본문(레벨·배지)은 이 파일의 관심사가 아니다. 조회를 영원히 매달아 두면
  // 시트는 `불러오는 중…`에 머물고 **머리말(아바타·닉네임)은 그대로 그려진다**.
  mocks.getCrewMemberProfile.mockReturnValue(new Promise(() => {}));
  mocks.getBadgeCatalog.mockReturnValue(new Promise(() => {}));
});

afterEach(cleanup);

function open({
  avatarUrl,
  mine = false,
}: {
  avatarUrl: string | null;
  mine?: boolean;
}) {
  render(
    <MemberProfileSheet
      userId="friend"
      nickname="스칼레또"
      avatarUrl={avatarUrl}
      // 넘기는 순간 "내 프로필"이 된다 — 이 파일이 가르는 유일한 축이다
      onAvatarChanged={mine ? () => {} : undefined}
      onClose={() => {}}
    />,
  );
}

/**
 * ⚠️⚠️ 이 파일이 지키는 것은 버튼 하나가 아니라 **"확대는 친구 사진에만 열린다"**는
 * 성질이다 (2026-08-28 사용자 요청 — *"친구의 프로필 사진을 클릭 하면 큰 화면
 * 이미지로 확인"*, 범위는 "이번엔 친구만"으로 확정).
 *
 * 무너지는 방향이 셋이라 셋 다 **없음을 먼저 단언한다**(부정 확인이 증거다):
 *  1. 이모지에 확대를 열면 512px로 키운 이모지가 나온다
 *  2. 내 시트에 확대를 달면 2026-08-22의 **사진 바꾸기 입구를 덮는다**
 *  3. 확대가 시트를 닫아 버리면 사진 한 장 보려고 프로필을 다시 열어야 한다
 */
describe("MemberProfileSheet — 친구 사진 확대", () => {
  it("친구가 사진이면 확대 버튼이 붙는다", () => {
    open({ avatarUrl: PHOTO });
    expect(screen.getByRole("button", { name: ZOOM_LABEL })).toBeTruthy();
  });

  it("확대 버튼을 누르면 사진이 큰 겹으로 뜬다", () => {
    open({ avatarUrl: PHOTO });
    // 열기 전에는 시트 하나뿐이다
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: ZOOM_LABEL }));

    // 시트 + 라이트박스 = 둘. **시트가 닫히지 않는다**(위 3번)
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    // 아바타 안의 `<img>`는 alt가 빈 장식이라, 이 이름을 가진 것은 큰 사진뿐이다
    const big = screen.getByAltText("스칼레또님 프로필 사진");
    expect(big.getAttribute("src")).toBe(PHOTO);
  });

  it("확대를 닫아도 시트는 남는다", () => {
    open({ avatarUrl: PHOTO });
    fireEvent.click(screen.getByRole("button", { name: ZOOM_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "사진 닫기" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByAltText("스칼레또님 프로필 사진")).toBeNull();
    expect(screen.getByRole("button", { name: ZOOM_LABEL })).toBeTruthy();
  });

  it("친구가 이모지면 확대 버튼이 없다", () => {
    open({ avatarUrl: "🤓" });
    expect(screen.queryByRole("button", { name: ZOOM_LABEL })).toBeNull();
  });

  it("친구가 사진도 이모지도 없으면 확대 버튼이 없다", () => {
    open({ avatarUrl: null });
    expect(screen.queryByRole("button", { name: ZOOM_LABEL })).toBeNull();
  });

  /** 2026-08-22의 '홈에서 2탭에 사진 바꾸기'를 덮지 않는다 */
  it("내 프로필이면 사진이어도 확대가 아니라 사진 바꾸기다", () => {
    open({ avatarUrl: PHOTO, mine: true });
    expect(screen.queryByRole("button", { name: ZOOM_LABEL })).toBeNull();
    expect(
      screen.getByRole("button", { name: "프로필 사진 바꾸기" }),
    ).toBeTruthy();
  });
});
