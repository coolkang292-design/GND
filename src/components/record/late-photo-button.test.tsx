// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LatePhotoButton } from "./late-photo-button";

// vi.mock은 호이스팅되므로 모의 함수도 hoisted로 만들어야 참조 시점이 맞는다.
const mocks = vi.hoisted(() => ({
  uploadWorkoutImage: vi.fn(),
  awardWorkoutPhotoXp: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock("@/lib/workout", () => ({
  uploadWorkoutImage: mocks.uploadWorkoutImage,
  awardWorkoutPhotoXp: mocks.awardWorkoutPhotoXp,
}));
vi.mock("@/lib/image", () => ({ compressImage: mocks.compressImage }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compressImage.mockImplementation(async (file: Blob) => file);
  mocks.uploadWorkoutImage.mockResolvedValue({});
  mocks.awardWorkoutPhotoXp.mockResolvedValue({ awarded: true, xpAwarded: 10 });
});

afterEach(cleanup);

function setup() {
  const onDone = vi.fn();
  const onToast = vi.fn();
  const { container, getByRole } = render(
    <LatePhotoButton
      userId="user-1"
      sessionId="session-1"
      onDone={onDone}
      onToast={onToast}
    />,
  );
  const inputs = Array.from(
    container.querySelectorAll("input[type=file]"),
  ) as HTMLInputElement[];
  return {
    onDone,
    onToast,
    getByRole,
    cameraInput: inputs.find((i) => i.hasAttribute("capture"))!,
    albumInput: inputs.find((i) => !i.hasAttribute("capture"))!,
  };
}

function pickPhoto(input: HTMLInputElement) {
  fireEvent.change(input, {
    target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
  });
}

/**
 * ③ 나중에 붙이기에도 앨범 허용 (2026-08-04, 사용자 결정).
 *
 * 이 버튼은 원래 "카메라 촬영만"으로 만들어졌다 — 2026-08-01의 앨범 제거 결정을
 * 되돌리지 않으려는 것이었다. 그 결정이 이번에 뒤집혔으므로 여기도 같이 연다.
 * 완료 화면에서 앨범이 되는데 나중 붙이기만 막으면 규칙이 갈라진다.
 */
describe("LatePhotoButton — 촬영·앨범 두 경로", () => {
  it("촬영 버튼과 앨범 버튼을 둘 다 보여준다", () => {
    const { getByRole } = setup();

    expect(getByRole("button", { name: /촬영/ })).toBeTruthy();
    expect(getByRole("button", { name: /앨범/ })).toBeTruthy();
  });

  it("앨범 입력에는 capture를 걸지 않는다 — 걸면 카메라가 열려 앨범을 못 고른다", () => {
    const { albumInput } = setup();

    expect(albumInput).toBeTruthy();
    expect(albumInput.hasAttribute("capture")).toBe(false);
  });

  it("앨범으로 올리면 source=album · clientCapturedAt=null", async () => {
    const { albumInput } = setup();
    pickPhoto(albumInput);

    await waitFor(() =>
      expect(mocks.uploadWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({ source: "album", clientCapturedAt: null }),
      ),
    );
  });

  it("앨범 업로드는 photo_uploaded로 알린다 — 카메라 인증으로 승격시키지 않는다", async () => {
    const { onDone, albumInput } = setup();
    pickPhoto(albumInput);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("photo_uploaded"));
  });

  it("촬영은 여전히 camera_verified다", async () => {
    const { onDone, cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("camera_verified"));
  });

  it("업로드가 실패하면 인증 상태를 바꾸지 않는다", async () => {
    mocks.uploadWorkoutImage.mockRejectedValue(new Error("업로드 실패"));
    const { onDone, onToast, albumInput } = setup();
    pickPhoto(albumInput);

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining("사진 업로드 실패"),
      ),
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
