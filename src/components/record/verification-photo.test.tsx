// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationPhoto } from "./verification-photo";

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

function setup() {
  const onToast = vi.fn();
  const { container } = render(
    <VerificationPhoto
      userId="user-1"
      sessionId="session-1"
      durationMinutes={65}
      completedAtMs={Date.parse("2026-07-26T12:00:00+09:00")}
      onToast={onToast}
    />,
  );
  const cameraInput = container.querySelector(
    "input[capture]",
  ) as HTMLInputElement;
  return { onToast, cameraInput };
}

function pickPhoto(input: HTMLInputElement) {
  fireEvent.change(input, {
    target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compressImage.mockImplementation(async (file: Blob) => file);
  mocks.uploadWorkoutImage.mockResolvedValue({});
  mocks.awardWorkoutPhotoXp.mockResolvedValue({ awarded: true, xpAwarded: 10 });
  // jsdom에는 objectURL이 없다
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => cleanup());

describe("VerificationPhoto — 사진 XP 후등록", () => {
  it("업로드가 성공하면 사진 XP를 이어서 청구한다", async () => {
    const { cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(mocks.awardWorkoutPhotoXp).toHaveBeenCalledWith("session-1"),
    );
  });

  it("지급되면 획득 XP를 토스트로 알린다", async () => {
    const { onToast, cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("10 XP")),
    );
  });

  it("이미 지급됐으면 XP 문구 없이 인증 완료만 알린다", async () => {
    mocks.awardWorkoutPhotoXp.mockResolvedValue({
      awarded: false,
      reason: "already_awarded",
    });
    const { onToast, cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() => expect(onToast).toHaveBeenCalled());
    expect(onToast).not.toHaveBeenCalledWith(expect.stringContaining("XP"));
  });

  it("XP 청구가 실패해도 사진 인증 자체는 성공으로 둔다", async () => {
    mocks.awardWorkoutPhotoXp.mockRejectedValue(new Error("network"));
    const { onToast, cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("인증 완료")),
    );
  });

  it("업로드가 실패하면 XP를 청구하지 않는다", async () => {
    mocks.uploadWorkoutImage.mockRejectedValue(new Error("업로드 실패"));
    const { onToast, cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining("사진 업로드 실패"),
      ),
    );
    expect(mocks.awardWorkoutPhotoXp).not.toHaveBeenCalled();
  });
});
