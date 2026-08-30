// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock은 호이스팅되므로 모의 함수도 hoisted로 만들어야 참조 시점이 맞는다.
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

beforeEach(() => {
  vi.clearAllMocks();
  // 본문(레벨·배지)은 이 파일의 관심사가 아니다. 조회를 영원히 매달아 두면
  // 시트는 `불러오는 중…`에 머물고 **머리말(아바타·닉네임)은 그대로 그려진다**.
  mocks.getCrewMemberProfile.mockReturnValue(new Promise(() => {}));
  mocks.getBadgeCatalog.mockReturnValue(new Promise(() => {}));
  mocks.uploadAvatarPhoto.mockResolvedValue("https://cdn.example/new.jpg");
  mocks.updateMyAvatar.mockResolvedValue(undefined);
});

afterEach(cleanup);

function open(onAvatarChanged?: (url: string) => void) {
  const { container } = render(
    <MemberProfileSheet
      userId="me"
      nickname="스칼레또"
      avatarUrl="🤓"
      onAvatarChanged={onAvatarChanged}
      onClose={() => {}}
    />,
  );
  return {
    container,
    file: container.querySelector<HTMLInputElement>("input[type=file]"),
  };
}

function pick(input: HTMLInputElement) {
  fireEvent.change(input, {
    target: { files: [new File(["x"], "me.jpg", { type: "image/jpeg" })] },
  });
}

/**
 * ⚠️⚠️ 이 파일이 지키는 것은 버튼 하나가 아니라 **"내 사진만 내가 바꾼다"** 는
 * 성질이다 (2026-08-22 사용자 지시 — *"홈 화면에 프로필 누른 뒤에 프로필 사진을
 * 눌러서 바로 수정"*).
 *
 * `MemberProfileSheet`는 호출부가 **6곳**이고 그중 본인은 `home-client.tsx` 하나뿐이다.
 * 편집 표시를 `onAvatarChanged` 유무로 가르므로, 누군가 남의 프로필 호출부에
 * 콜백을 달면 아래 첫 번째 테스트가 아니라 **그 화면**이 깨진다 — 그래서 "없을 때
 * 없다"를 먼저 단언한다(부정 확인이 이 기능의 증거다).
 */
describe("프로필 시트 아바타 — 내 것일 때만 눌린다", () => {
  it("남의 프로필(콜백 없음)에는 사진 바꾸기가 아예 없다", () => {
    const { file } = open();
    expect(screen.queryByRole("button", { name: "프로필 사진 바꾸기" })).toBeNull();
    // 카메라 표시는 물론 파일 입력조차 만들지 않는다
    expect(file).toBeNull();
  });

  it("내 프로필(콜백 있음)에는 사진 바꾸기 버튼이 있다", () => {
    const { file } = open(vi.fn());
    expect(
      screen.getByRole("button", { name: "프로필 사진 바꾸기" }),
    ).not.toBeNull();
    expect(file).not.toBeNull();
  });
});

describe("프로필 시트 아바타 — 고르는 즉시 저장한다 (저장 버튼 없음)", () => {
  it("업로드 → DB 저장 → 콜백 순서로 새 URL이 흘러간다", async () => {
    const onAvatarChanged = vi.fn();
    const { file } = open(onAvatarChanged);
    pick(file!);

    await waitFor(() =>
      expect(onAvatarChanged).toHaveBeenCalledWith("https://cdn.example/new.jpg"),
    );
    expect(mocks.uploadAvatarPhoto).toHaveBeenCalledTimes(1);
    expect(mocks.uploadAvatarPhoto.mock.calls[0][0]).toBe("me");
    // ⚠️ `upsertMyProfile`이 아니라 `updateMyAvatar`다 — 닉네임·주간목표를 손에
    //    들고 있지 않은 화면이 그 둘을 지어내 덮어쓰면 안 된다(`lib/crew.ts` 주석).
    expect(mocks.updateMyAvatar).toHaveBeenCalledWith(
      "me",
      "https://cdn.example/new.jpg",
    );
  });

  /**
   * ⚠️ 이 단언이 이 파일에서 가장 중요하다. 올리기만 하고 콜백을 부르면 화면은
   * 새 사진인데 `profiles`는 옛 사진이라, 탭을 옮기는 순간 되돌아간다 —
   * 사용자는 "저장이 안 됐다"가 아니라 **"사진이 사라졌다"** 로 읽는다.
   */
  it("DB 저장이 실패하면 화면을 바꾸지 않고 오류를 말한다", async () => {
    const onAvatarChanged = vi.fn();
    mocks.updateMyAvatar.mockRejectedValue(new Error("저장하지 못했어요"));
    const { file } = open(onAvatarChanged);
    pick(file!);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요");
    expect(onAvatarChanged).not.toHaveBeenCalled();
  });

  it("업로드가 실패하면 DB를 건드리지 않는다", async () => {
    const onAvatarChanged = vi.fn();
    mocks.uploadAvatarPhoto.mockRejectedValue(
      new Error("사진이 너무 커요 (20MB 이하)"),
    );
    const { file } = open(onAvatarChanged);
    pick(file!);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("사진이 너무 커요");
    expect(mocks.updateMyAvatar).not.toHaveBeenCalled();
    expect(onAvatarChanged).not.toHaveBeenCalled();
  });

  it("올리는 동안 버튼이 잠긴다 — 두 번 눌러 두 장이 올라가지 않게", async () => {
    let release: (url: string) => void = () => {};
    mocks.uploadAvatarPhoto.mockReturnValue(
      new Promise<string>((r) => {
        release = r;
      }),
    );
    const { file } = open(vi.fn());
    pick(file!);

    const button = await screen.findByRole("button", {
      name: "프로필 사진 바꾸기",
    });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));

    release("https://cdn.example/new.jpg");
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    expect(mocks.uploadAvatarPhoto).toHaveBeenCalledTimes(1);
  });
});

/**
 * 소개·링크 편집 (2026-08-31, 사용자 지시 — *"내 정보 탭에서 만들지 말고 홈화면에
 * 내 캐릭터 클릭하면 거기서 작성할 수 있게"*).
 *
 * ⚠️⚠️ 이 파일 맨 위 주석의 성질이 그대로 적용된다 — 판정은 `onAvatarChanged`
 * **하나뿐**이어야 한다. 두 번째 판정을 만들면 한 겹을 부숴도 테스트가 통과한다.
 * 그래서 여기서도 **"없을 때 없다"를 먼저** 단언한다.
 */
describe("소개·링크 편집 입구", () => {
  it("남의 프로필에는 편집 입구가 없다 (부정 확인)", () => {
    open();
    expect(screen.queryByText(/이름 · 소개 · 링크 편집/)).toBeNull();
  });

  it("내 프로필이면 편집 입구가 있다", () => {
    open(() => {});
    expect(screen.getByText(/이름 · 소개 · 링크 편집/)).toBeTruthy();
  });

  /**
   * 새 편집 화면을 만들지 않았다 — **기존 `ProfileEditSheet`**가 그대로 열린다.
   *
   * ⚠️ 입력칸까지는 안 본다. 그건 `getMyProfile`이 끝나야 그려지는데 이 파일은
   *    `@/lib/crew`를 아바타용으로만 모의해서 프로필 조회가 안 돈다. 입력칸의
   *    동작은 `profile-edit-sheet.test.tsx`가 따로 지킨다 — 같은 것을 두 곳에서
   *    검사하지 않는다.
   */
  it("누르면 기존 프로필 편집이 열린다", () => {
    open(() => {});
    expect(screen.queryByRole("heading", { name: "프로필 편집" })).toBeNull();
    fireEvent.click(screen.getByText(/이름 · 소개 · 링크 편집/));
    expect(screen.getByRole("heading", { name: "프로필 편집" })).toBeTruthy();
  });
});
