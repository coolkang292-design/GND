// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  upsertMyProfile: vi.fn(),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ userId: "me", loading: false, configured: true }),
}));

vi.mock("@/lib/crew", () => ({
  getMyProfile: mocks.getMyProfile,
  upsertMyProfile: mocks.upsertMyProfile,
}));

import { ProfileEditSheet } from "./profile-edit-sheet";
import { AVATARS } from "@/lib/domain/avatars";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyProfile.mockResolvedValue({
    id: "me",
    nickname: "스칼레또",
    avatar_url: "🤓",
    weekly_goal: 5,
  });
  mocks.upsertMyProfile.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

/** 시트를 열고 현재 값이 채워질 때까지 기다린다 */
async function open() {
  render(<ProfileEditSheet />);
  fireEvent.click(screen.getByRole("button", { name: /프로필 편집/ }));
  await screen.findByDisplayValue("스칼레또");
}

/**
 * ⚠️⚠️ 이 파일이 지키는 것은 컴포넌트가 아니라 **두 값이 영원히 굳지 않는다**는
 * 성질이다 (설계 §4.3).
 *
 * 2026-08-08에 온보딩 첫 화면에서 이모지 선택과 주간목표 스테퍼를 뺐다.
 * `upsertMyProfile`을 부르는 곳은 그때까지 온보딩 한 곳뿐이었으므로, 이 시트가
 * 사라지면
 *   · `avatar_url`이 전원 `🧔`로 고정 — 12곳이 이 값을 렌더한다
 *   · `weekly_goal`이 주 3회로 고정 — 홈 WeeklyStats가 틀린 기준으로 잰다
 * 이 시트를 지우거나 저장 경로를 끊으면 여기서 실패해야 한다.
 */
describe("프로필 편집 시트 — 온보딩에서 뺀 값을 바꾸는 유일한 자리", () => {
  it("열기 전에는 접혀 있다", () => {
    render(<ProfileEditSheet />);
    expect(screen.getByRole("button", { name: /프로필 편집/ })).not.toBeNull();
    expect(screen.queryByPlaceholderText("닉네임")).toBeNull();
    // 닫혀 있으면 조회도 안 한다 — 안 여는 사람에게 질의를 하나 더 태우지 않는다
    expect(mocks.getMyProfile).not.toHaveBeenCalled();
  });

  it("열면 지금 값을 채워 넣는다 (빈 칸으로 덮어쓰지 않는다)", async () => {
    await open();
    expect(screen.getByDisplayValue("스칼레또")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "🤓", pressed: true }),
    ).not.toBeNull();
  });

  it("온보딩과 같은 이모지 배열을 쓴다 (복사본이 아니다)", async () => {
    await open();
    for (const a of AVATARS) {
      expect(screen.getByRole("button", { name: a })).not.toBeNull();
    }
  });

  it("이모지와 닉네임을 바꿔 저장한다", async () => {
    await open();

    fireEvent.click(screen.getByRole("button", { name: "🏃" }));
    fireEvent.change(screen.getByPlaceholderText("닉네임"), {
      target: { value: "달리는스칼레또" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(mocks.upsertMyProfile).toHaveBeenCalledWith({
        id: "me",
        nickname: "달리는스칼레또",
        avatar_url: "🏃",
        // ⚠️ 화면에서 스테퍼를 뺐어도(2026-08-08 사용자 지시) **읽은 값을 그대로
        //    다시 넣어야** 한다. 안 넣으면 저장할 때마다 주간 목표가 날아간다.
        weekly_goal: 5,
        // ⚠️⚠️ 0085 — 비어 있어도 **`null`을 명시해서 보낸다.** `undefined`로 두면
        //    upsert 페이로드에서 키가 빠져 **사용자가 지운 소개가 안 지워진다.**
        //    이 세 줄이 그 규약을 고정한다.
        bio: null,
        instagram_url: null,
        youtube_url: null,
      }),
    );
    await screen.findByText("저장했어요 ✓");
  });

  it("소개·SNS를 함께 저장한다 — 저장 버튼은 하나다", async () => {
    await open();

    fireEvent.change(screen.getByLabelText("자기소개"), {
      target: { value: "  퇴근 후 주 4회  " },
    });
    fireEvent.change(screen.getByLabelText("Instagram 주소"), {
      target: { value: "https://instagram.com/gnd_user" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(mocks.upsertMyProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          // 앞뒤 공백은 떼어서 저장한다
          bio: "퇴근 후 주 4회",
          instagram_url: "https://instagram.com/gnd_user",
          youtube_url: null,
        }),
      ),
    );
  });

  /**
   * ⚠️⚠️ 회귀 방어. 여기서 안 막으면 DB CHECK에 걸려 저장이 **통째로** 실패한다 —
   * 닉네임까지 같이 안 저장되고 사용자는 이유를 모른다.
   */
  it("Instagram이 아닌 주소는 저장을 막고 이유를 말한다", async () => {
    await open();

    fireEvent.change(screen.getByLabelText("Instagram 주소"), {
      target: { value: "https://evilinstagram.com/me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Instagram");
    expect(mocks.upsertMyProfile).not.toHaveBeenCalled();
  });

  it("javascript: 스킴은 저장되지 않는다", async () => {
    await open();

    fireEvent.change(screen.getByLabelText("YouTube 주소"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await screen.findByRole("alert");
    expect(mocks.upsertMyProfile).not.toHaveBeenCalled();
  });

  it("주간 목표 스테퍼가 화면에 없다 (부정 확인)", async () => {
    await open();
    expect(screen.queryByText("주간 운동 목표")).toBeNull();
    expect(screen.queryByRole("button", { name: "목표 늘리기" })).toBeNull();
  });

  /**
   * ⚠️ 홈·캘린더는 마운트 때 `weekly_goal`을 읽는다. 저장만 하고 알리지 않으면
   * 바로 위 성장 카드가 옛 이모지를 든 채로 남아 "안 바뀐 것"처럼 보인다.
   */
  it("저장하면 화면을 새로 읽으라고 알린다", async () => {
    const onSaved = vi.fn();
    render(<ProfileEditSheet onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /프로필 편집/ }));
    await screen.findByDisplayValue("스칼레또");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("닉네임을 비우면 저장하지 않는다", async () => {
    await open();
    fireEvent.change(screen.getByPlaceholderText("닉네임"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await screen.findByText("닉네임을 입력해주세요");
    expect(mocks.upsertMyProfile).not.toHaveBeenCalled();
  });

  /** 중복 판정은 `upsertMyProfile`이 이미 사람 말로 바꿔 준다 — 여기서 다시 하지 않는다 */
  it("닉네임이 중복이면 서버 문구를 그대로 보여준다", async () => {
    mocks.upsertMyProfile.mockRejectedValue(
      new Error("이미 사용 중인 닉네임이에요. 본인 계정이 이미 있다면…"),
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await screen.findByText(/이미 사용 중인 닉네임이에요/);
  });
});

/**
 * ⚠️ 입구 문구는 안의 내용을 정확히 말해야 한다. 0085에서 소개·SNS를 더했는데
 * 이 줄이 "이름 · 사진"으로 남아 있어 **소개를 어디서 쓰는지 찾을 수 없었다**
 * (2026-08-31 사용자 질문). 시트에 항목을 더하면 이 테스트가 같이 깨진다.
 */
describe("프로필 편집 입구 문구", () => {
  it("안에 있는 것을 말해 준다", () => {
    render(<ProfileEditSheet />);
    expect(screen.getByText("이름 · 사진 · 소개 ›")).toBeTruthy();
  });
});
