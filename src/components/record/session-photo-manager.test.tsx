// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionPhotoManager } from "./session-photo-manager";
import type { SessionPhoto } from "@/lib/domain/workout-photos";

const mocks = vi.hoisted(() => ({
  listSessionPhotos: vi.fn(),
  uploadWorkoutImage: vi.fn(),
  deleteWorkoutImage: vi.fn(),
  reorderWorkoutImages: vi.fn(),
  finalizeWorkoutVerification: vi.fn(),
  awardWorkoutPhotoXp: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock("@/lib/workout", () => ({
  listSessionPhotos: mocks.listSessionPhotos,
  uploadWorkoutImage: mocks.uploadWorkoutImage,
  deleteWorkoutImage: mocks.deleteWorkoutImage,
  reorderWorkoutImages: mocks.reorderWorkoutImages,
  finalizeWorkoutVerification: mocks.finalizeWorkoutVerification,
  awardWorkoutPhotoXp: mocks.awardWorkoutPhotoXp,
}));
vi.mock("@/lib/image", () => ({ compressImage: mocks.compressImage }));

function photo(i: number, source: "camera" | "album" = "camera"): SessionPhoto {
  return { id: `img-${i}`, url: `https://x.test/${i}.jpg`, source, sortOrder: i };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compressImage.mockImplementation(async (f: Blob) => f);
  mocks.listSessionPhotos.mockResolvedValue([photo(0), photo(1), photo(2)]);
  mocks.uploadWorkoutImage.mockResolvedValue({ id: "img-new" });
  mocks.deleteWorkoutImage.mockResolvedValue({ remaining: 2, verificationCleared: false });
  mocks.reorderWorkoutImages.mockResolvedValue(undefined);
  mocks.finalizeWorkoutVerification.mockResolvedValue({});
  mocks.awardWorkoutPhotoXp.mockResolvedValue({ awarded: false });
});

afterEach(() => cleanup());

function setup(over: Partial<Parameters<typeof SessionPhotoManager>[0]> = {}) {
  const onToast = vi.fn();
  const onPhotosChange = vi.fn();
  const { container } = render(
    <SessionPhotoManager
      userId="user-1"
      sessionId="session-1"
      onToast={onToast}
      onPhotosChange={onPhotosChange}
      {...over}
    />,
  );
  return { onToast, onPhotosChange, container };
}

describe("SessionPhotoManager — 목록", () => {
  it("사진 수를 `3/5` 로 보여준다", async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/3\/5/)).toBeTruthy());
  });

  it("사진만큼 썸네일을 그린다", async () => {
    // ⚠️ `img` 전체를 세면 안 된다 — `UiIcon`도 img로 그려서 추가 버튼의
    //    카메라 아이콘까지 딸려 온다. 사진 썸네일만 센다.
    setup();
    await waitFor(() =>
      expect(screen.getAllByAltText(/번째 사진$/)).toHaveLength(3),
    );
  });

  it("5장이면 추가 버튼이 사라진다", async () => {
    mocks.listSessionPhotos.mockResolvedValue([0, 1, 2, 3, 4].map((i) => photo(i)));
    setup();
    await waitFor(() => expect(screen.getByText(/5\/5/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /사진 추가/ })).toBeNull();
  });

  it("5장 미만이면 추가 버튼이 있다", async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/3\/5/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /사진 추가/ })).toBeTruthy();
  });
});

describe("SessionPhotoManager — 삭제", () => {
  it("삭제하면 row 와 스토리지를 함께 정리하는 경로를 부른다", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /삭제/ })).toHaveLength(3));
    fireEvent.click(screen.getAllByRole("button", { name: /삭제/ })[1]);

    await waitFor(() =>
      expect(mocks.deleteWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "session-1", imageId: "img-1" }),
      ),
    );
  });

  it("삭제 뒤 목록을 다시 읽는다 (슬롯이 재정렬됐을 수 있다)", async () => {
    setup();
    await waitFor(() => expect(mocks.listSessionPhotos).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole("button", { name: /삭제/ })[0]);
    await waitFor(() => expect(mocks.listSessionPhotos).toHaveBeenCalledTimes(2));
  });

  /**
   * ⚠️⚠️ 계획 §9. 마지막 사진을 지우면 인증이 풀린다 — 그 사실을 사용자에게
   *    말해 줘야 한다. 말 안 하면 달력에서 스탬프가 사라진 것을 나중에 보고
   *    "기록이 사라졌다"고 느낀다.
   */
  it("마지막 사진을 지우면 인증이 풀렸다고 알린다", async () => {
    mocks.deleteWorkoutImage.mockResolvedValue({ remaining: 0, verificationCleared: true });
    mocks.listSessionPhotos.mockResolvedValueOnce([photo(0)]).mockResolvedValue([]);
    const { onToast } = setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /삭제/ })).toHaveLength(1));
    fireEvent.click(screen.getAllByRole("button", { name: /삭제/ })[0]);

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("인증")),
    );
  });

  it("사진이 남아 있으면 인증 해제 문구를 말하지 않는다", async () => {
    const { onToast } = setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /삭제/ })).toHaveLength(3));
    fireEvent.click(screen.getAllByRole("button", { name: /삭제/ })[0]);

    await waitFor(() => expect(mocks.deleteWorkoutImage).toHaveBeenCalled());
    expect(
      onToast.mock.calls.some((c) => String(c[0]).includes("인증이 풀렸")),
    ).toBe(false);
  });
});

describe("SessionPhotoManager — 순서 바꾸기", () => {
  it("오른쪽으로 옮기면 전량 목록을 새 순서로 보낸다", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /뒤로 옮기기/ })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: /뒤로 옮기기/ })[0]);

    await waitFor(() =>
      expect(mocks.reorderWorkoutImages).toHaveBeenCalledWith("session-1", [
        "img-1",
        "img-0",
        "img-2",
      ]),
    );
  });

  it("왼쪽으로 옮기면 반대로 보낸다", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /앞으로 옮기기/ })).toHaveLength(2));
    // 앞으로 옮기기 버튼은 2번째·3번째 사진에만 있다 → [0] 은 2번째 사진의 것
    fireEvent.click(screen.getAllByRole("button", { name: /앞으로 옮기기/ })[0]);

    await waitFor(() =>
      expect(mocks.reorderWorkoutImages).toHaveBeenCalledWith("session-1", [
        "img-1",
        "img-0",
        "img-2",
      ]),
    );
  });

  it("첫 사진에는 앞으로 옮기기가 없고 마지막에는 뒤로 옮기기가 없다", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /삭제/ })).toHaveLength(3));
    // 3장이면 앞으로 2개(2·3번째), 뒤로 2개(1·2번째)
    expect(screen.getAllByRole("button", { name: /앞으로 옮기기/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /뒤로 옮기기/ })).toHaveLength(2);
  });

  it("1장뿐이면 순서 버튼이 아예 없다", async () => {
    mocks.listSessionPhotos.mockResolvedValue([photo(0)]);
    setup();
    await waitFor(() => expect(screen.getByText(/1\/5/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /옮기기/ })).toBeNull();
  });
});

describe("SessionPhotoManager — 추가", () => {
  it("추가하면 저장하고 인증을 다시 확정한다", async () => {
    const { container } = setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /사진 추가/ })).toBeTruthy());

    const input = container.querySelector('input[capture]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledWith("session-1"),
    );
  });

  /**
   * ⚠️ 사진 XP 는 운동 1회당 한 번이다. 서버(`award_workout_photo_xp`)가 멱등이라
   *    여러 번 불러도 안전하지만, 화면이 5장마다 "+10 XP"를 외치면 거짓말이 된다.
   */
  it("XP 가 실제로 지급됐을 때만 XP 문구를 말한다", async () => {
    mocks.awardWorkoutPhotoXp.mockResolvedValue({ awarded: false, reason: "already_awarded" });
    const { container, onToast } = setup();
    await waitFor(() => expect(screen.getByRole("button", { name: /사진 추가/ })).toBeTruthy());

    const input = container.querySelector('input[capture]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(onToast).toHaveBeenCalled());
    expect(onToast.mock.calls.every((c) => !String(c[0]).includes("XP"))).toBe(true);
  });
});

/**
 * ⚠️⚠️ 2026-09-10 실측 버그. 운동 완료 직후 `"잠시 후 결과 화면으로 넘어가요"`
 *    구간에서 찍은 사진은 저장은 되는데 `verification_status`가 `none`으로 남았다.
 *    완료 핸들러가 사진 0장일 때 이미 한 번 돌아 버렸기 때문이다.
 *
 *    그래서 **결과 화면에 닿는 순간** 서버 상태를 한 번 맞춘다. 사진이 어떤
 *    경로로 생겼든(운동 중 · 완료 직후 · 나중 붙이기) 여기를 지난다.
 *
 * ⚠️ `ActivePhotoButton`에서 부르는 것으로 고치면 안 된다 — 그쪽은 `active`
 *    세션에서도 도는데 `set_workout_verification`은 `completed`만 받는다.
 */
describe("SessionPhotoManager — 마운트 인증 확정", () => {
  it("사진이 있으면 마운트 때 인증을 한 번 확정한다", async () => {
    setup();
    await waitFor(() =>
      expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledWith("session-1"),
    );
    expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledTimes(1);
  });

  it("사진이 0장이면 부르지 않는다", async () => {
    // 0장에 확정을 부르면 서버는 아무것도 안 하지만(멱등), 인증이 없는 운동에
    // 매번 헛 RPC를 쏘는 것이라 하지 않는다.
    mocks.listSessionPhotos.mockResolvedValue([]);
    setup();
    await waitFor(() => expect(mocks.listSessionPhotos).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/0\/5/)).toBeTruthy());
    expect(mocks.finalizeWorkoutVerification).not.toHaveBeenCalled();
  });

  /** 확정이 실패해도 화면은 살아 있어야 한다 — 사진 관리는 그대로 쓸 수 있다 */
  it("확정이 실패해도 썸네일은 그린다", async () => {
    mocks.finalizeWorkoutVerification.mockRejectedValue(new Error("boom"));
    setup();
    await waitFor(() =>
      expect(screen.getAllByAltText(/번째 사진$/)).toHaveLength(3),
    );
  });

  /** 목록을 다시 읽는 일(삭제·추가)마다 확정이 또 돌면 RPC가 눈덩이가 된다 */
  it("삭제로 목록을 다시 읽어도 마운트 확정이 다시 돌지는 않는다", async () => {
    setup();
    await waitFor(() => expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole("button", { name: /삭제/ })[0]);
    await waitFor(() => expect(mocks.listSessionPhotos).toHaveBeenCalledTimes(2));
    expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledTimes(1);
  });
});
