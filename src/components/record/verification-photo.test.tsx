// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationPhoto } from "./verification-photo";

// vi.mock은 호이스팅되므로 모의 함수도 hoisted로 만들어야 참조 시점이 맞는다.
const mocks = vi.hoisted(() => ({
  uploadWorkoutImage: vi.fn(),
  finalizeWorkoutVerification: vi.fn(),
  awardWorkoutPhotoXp: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock("@/lib/workout", () => ({
  uploadWorkoutImage: mocks.uploadWorkoutImage,
  finalizeWorkoutVerification: mocks.finalizeWorkoutVerification,
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
  mocks.finalizeWorkoutVerification.mockResolvedValue({});
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

  /**
   * ⚠️ 이 단언이 0103의 가장 조용한 회귀를 지킨다. `uploadWorkoutImage`는 이제
   *    **저장만** 한다 — 확정을 따로 부르지 않으면 사진은 올라가는데 달력·피드
   *    스탬프가 영영 안 찍힌다. 화면에는 "업로드 완료"가 떠서 아무도 모른다.
   */
  it("업로드 뒤 인증을 따로 확정한다 (저장과 확정은 다른 일)", async () => {
    const { cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledWith(
        "session-1",
      ),
    );
  });

  it("업로드가 실패하면 인증을 확정하지 않는다", async () => {
    mocks.uploadWorkoutImage.mockRejectedValue(new Error("업로드 실패"));
    const { cameraInput } = setup();
    pickPhoto(cameraInput);

    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    expect(mocks.finalizeWorkoutVerification).not.toHaveBeenCalled();
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

/**
 * ③ 사진첩에서 고르기 (2026-08-04, 사용자 결정 = 대안 B).
 *
 * 2026-08-01에 지운 앨범 버튼을 되살린다. **촬영일 검사는 하지 않는다** —
 * EXIF도 파일시각도 조작 가능해서 "당일 촬영"을 보장할 수 없다는 검토 결론이다.
 * 대신 등급으로만 나눈다: 촬영 = camera(🔥), 앨범 = album(●).
 */
describe("VerificationPhoto — 앨범에서 고르기", () => {
  function setupBoth() {
    const onToast = vi.fn();
    const { container, getByRole } = render(
      <VerificationPhoto
        userId="user-1"
        sessionId="session-1"
        durationMinutes={65}
        completedAtMs={Date.parse("2026-07-26T12:00:00+09:00")}
        onToast={onToast}
      />,
    );
    const inputs = Array.from(
      container.querySelectorAll("input[type=file]"),
    ) as HTMLInputElement[];
    return {
      onToast,
      getByRole,
      cameraInput: inputs.find((i) => i.hasAttribute("capture"))!,
      albumInput: inputs.find((i) => !i.hasAttribute("capture"))!,
    };
  }

  it("촬영 버튼과 앨범 버튼을 둘 다 보여준다", () => {
    const { getByRole } = setupBoth();

    expect(getByRole("button", { name: /지금 촬영/ })).toBeTruthy();
    expect(getByRole("button", { name: /앨범/ })).toBeTruthy();
  });

  it("앨범 입력에는 capture를 걸지 않는다 — 걸면 카메라가 열려 앨범을 못 고른다", () => {
    const { albumInput } = setupBoth();

    expect(albumInput).toBeTruthy();
    expect(albumInput.hasAttribute("capture")).toBe(false);
  });

  it("앨범으로 고르면 source를 album으로 올린다", async () => {
    const { albumInput } = setupBoth();
    pickPhoto(albumInput);

    await waitFor(() =>
      expect(mocks.uploadWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({ source: "album" }),
      ),
    );
  });

  it("앨범 사진의 clientCapturedAt은 null이다 — 파일 시각은 촬영일이 아니다", async () => {
    // 제거 전 코드는 여기에 file.lastModified를 넣었다. 그 값은 메신저 저장·
    // 다운로드에서 '지금'으로 갱신되므로 촬영일이 아니다. 틀린 값을 넣느니 없앤다.
    const { albumInput } = setupBoth();
    pickPhoto(albumInput);

    await waitFor(() =>
      expect(mocks.uploadWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({ clientCapturedAt: null }),
      ),
    );
  });

  it("촬영은 여전히 camera로 올리고 촬영 시각을 담는다", async () => {
    const { cameraInput } = setupBoth();
    pickPhoto(cameraInput);

    await waitFor(() =>
      expect(mocks.uploadWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({ source: "camera" }),
      ),
    );
    const call = mocks.uploadWorkoutImage.mock.calls[0][0];
    expect(call.clientCapturedAt).toBeInstanceOf(Date);
  });

  it("앨범 업로드 완료 문구는 카메라 인증과 구분된다", async () => {
    const { onToast } = setupBoth();
    const { albumInput } = setupBoth();
    pickPhoto(albumInput);

    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    expect(onToast).not.toHaveBeenCalledWith(
      expect.stringContaining("카메라 인증"),
    );
  });
});

/**
 * 이슈 #16 P0-B (2026-10-19) — 인증 대기면 사진 인증이 단 하나의 강한 CTA,
 * 반복 설명은 접고, 실패하면 사진을 잃지 않고 다시 시도한다.
 */
describe("VerificationPhoto — 인증 상태와 실패 복구", () => {
  function setupMode(emphasis?: "required" | "optional") {
    const onToast = vi.fn();
    const onUploaded = vi.fn();
    const utils = render(
      <VerificationPhoto
        userId="user-1"
        sessionId="session-1"
        durationMinutes={65}
        completedAtMs={Date.parse("2026-07-26T12:00:00+09:00")}
        onToast={onToast}
        onUploaded={onUploaded}
        emphasis={emphasis}
      />,
    );
    const cameraInput = utils.container.querySelector("input[capture]") as HTMLInputElement;
    return { ...utils, onToast, onUploaded, cameraInput };
  }

  it("인증 대기(required)면 '사진 인증하기'가 주 버튼, 앨범은 보조", () => {
    const { getByRole } = setupMode("required");
    expect(getByRole("button", { name: /사진 인증하기/ }).className).toContain("bg-accent");
    expect(getByRole("button", { name: /앨범에서 선택/ }).className).not.toContain("bg-accent");
  });

  it("선택(optional)이면 강한 버튼을 쓰지 않는다 — 다른 CTA와 겨루지 않는다", () => {
    const { getByRole } = setupMode("optional");
    expect(getByRole("button", { name: /지금 촬영/ }).className).not.toContain("bg-accent");
  });

  it("사진이 없을 때 빈 미리보기 칸을 그리지 않는다", () => {
    const { queryByText } = setupMode();
    expect(queryByText("사진을 올리면 여기에 표시돼요")).toBeNull();
  });

  it("등급·압축·달력 스탬프 설명은 '도움말' 안에 접혀 있다", () => {
    const { container, getByText } = setupMode();
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details!.open).toBe(false);
    expect(getByText("도움말")).toBeTruthy();
    expect(details!.textContent).toContain("달력");
  });

  it("업로드가 실패하면 그 자리에 '다시 시도'가 생기고, 같은 사진으로 다시 올린다", async () => {
    mocks.uploadWorkoutImage.mockRejectedValueOnce(new Error("network"));
    const { cameraInput, findByRole, onUploaded, queryByText } = setupMode("required");
    pickPhoto(cameraInput);

    const retry = await findByRole("button", { name: /다시 시도/ });
    expect(queryByText(/인증 완료/)).toBeNull();
    expect(onUploaded).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(mocks.uploadWorkoutImage).toHaveBeenCalledTimes(2);
    expect(mocks.compressImage).toHaveBeenCalledTimes(1);
  });

  it("저장은 됐는데 인증 확정만 실패하면, 다시 시도는 확정만 다시 한다 — 사진이 두 장 되지 않는다", async () => {
    mocks.finalizeWorkoutVerification.mockRejectedValueOnce(new Error("rpc"));
    const { cameraInput, findByRole, onUploaded } = setupMode("required");
    pickPhoto(cameraInput);

    fireEvent.click(await findByRole("button", { name: /다시 시도/ }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(mocks.uploadWorkoutImage).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeWorkoutVerification).toHaveBeenCalledTimes(2);
  });
});
