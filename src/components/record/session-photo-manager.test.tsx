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
