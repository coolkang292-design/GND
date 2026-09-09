// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivePhotoButton } from "./active-photo-button";

const mocks = vi.hoisted(() => ({
  uploadWorkoutImage: vi.fn(),
  listSessionPhotoRows: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock("@/lib/workout", () => ({
  uploadWorkoutImage: mocks.uploadWorkoutImage,
  listSessionPhotoRows: mocks.listSessionPhotoRows,
}));
vi.mock("@/lib/image", () => ({ compressImage: mocks.compressImage }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compressImage.mockImplementation(async (file: Blob) => file);
  mocks.listSessionPhotoRows.mockResolvedValue([]);
  mocks.uploadWorkoutImage.mockResolvedValue({ id: "img-1", sort_order: 0 });
});

afterEach(() => cleanup());

function setup(over: Partial<Parameters<typeof ActivePhotoButton>[0]> = {}) {
  const onToast = vi.fn();
  const onCountChange = vi.fn();
  const { container } = render(
    <ActivePhotoButton
      userId="user-1"
      sessionId="session-1"
      onToast={onToast}
      onCountChange={onCountChange}
      {...over}
    />,
  );
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  return { onToast, onCountChange, input, container };
}

function pick(input: HTMLInputElement) {
  fireEvent.change(input, {
    target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
  });
}

describe("ActivePhotoButton — 운동 중 촬영", () => {
  it("카메라 입력에 capture=environment 가 걸려 있다 (바로 촬영으로 열린다)", () => {
    const { input } = setup();
    expect(input.getAttribute("capture")).toBe("environment");
  });

  it("사진 수를 `0/5` 로 보여준다", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("0/5")).toBeTruthy());
  });

  it("이미 올라간 사진이 있으면 그 수로 시작한다 (새로고침 복구)", async () => {
    mocks.listSessionPhotoRows.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    setup();
    await waitFor(() => expect(screen.getByText("2/5")).toBeTruthy());
  });

  it("촬영하면 저장을 부른다 — source 는 camera", async () => {
    const { input } = setup();
    pick(input);
    await waitFor(() =>
      expect(mocks.uploadWorkoutImage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          sessionId: "session-1",
          source: "camera",
        }),
      ),
    );
  });

  it("촬영 시각을 담는다 (앨범이 아니라 지금 찍은 것이다)", async () => {
    const { input } = setup();
    pick(input);
    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    expect(
      mocks.uploadWorkoutImage.mock.calls[0][0].clientCapturedAt,
    ).toBeInstanceOf(Date);
  });

  it("올리면 수가 늘고 부모에게 알린다", async () => {
    const { input, onCountChange } = setup();
    pick(input);
    await waitFor(() => expect(screen.getByText("1/5")).toBeTruthy());
    expect(onCountChange).toHaveBeenCalledWith(1);
  });

  /**
   * ⚠️⚠️ 계획 §7의 핵심. 운동 중에 업로드가 끝날 때까지 기다리게 하면
   *    세트 사이 쉬는 시간을 잡아먹는다. 촬영 직후 바로 운동으로 돌아가야 한다.
   */
  it("업로드가 끝나기 전에도 버튼이 잠기지 않는다 (기다리게 하지 않는다)", async () => {
    let release: (v: unknown) => void = () => {};
    mocks.uploadWorkoutImage.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    const { input } = setup();
    pick(input);

    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    // 업로드가 아직 안 끝났는데도 버튼은 눌리는 상태여야 한다
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
    release({ id: "img-1" });
  });

  it("올리는 중이라는 것은 보여 준다 (조용히 실패하면 안 된다)", async () => {
    let release: (v: unknown) => void = () => {};
    mocks.uploadWorkoutImage.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    const { input } = setup();
    pick(input);
    await waitFor(() => expect(screen.getByText(/올리는 중/)).toBeTruthy());
    release({ id: "img-1" });
  });

  it("실패하면 토스트로 알리고 수를 늘리지 않는다", async () => {
    mocks.uploadWorkoutImage.mockRejectedValue(new Error("network"));
    const { input, onToast } = setup();
    pick(input);
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining("사진")),
    );
    expect(screen.getByText("0/5")).toBeTruthy();
  });

  it("5장을 채우면 버튼이 잠긴다", async () => {
    mocks.listSessionPhotoRows.mockResolvedValue([1, 2, 3, 4, 5].map((n) => ({ id: `p${n}` })));
    setup();
    await waitFor(() => expect(screen.getByText("5/5")).toBeTruthy());
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  /**
   * ⚠️ 업로드가 아직 안 끝난 사진도 자리를 차지한다. 안 세면 4장에서 두 번
   *    연달아 찍었을 때 6번째를 시도하게 되고, DB 가 23505 로 막아 사용자에게는
   *    이유 없는 실패로 보인다.
   */
  it("올리는 중인 사진도 장수에 센다 (연달아 찍어도 6번째로 안 넘어간다)", async () => {
    mocks.listSessionPhotoRows.mockResolvedValue([1, 2, 3, 4].map((n) => ({ id: `p${n}` })));
    let release: (v: unknown) => void = () => {};
    mocks.uploadWorkoutImage.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    const { input } = setup();
    await waitFor(() => expect(screen.getByText("4/5")).toBeTruthy());

    pick(input);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true));
    release({ id: "img-5" });
  });

  it("인증을 여기서 확정하지 않는다 — 운동 중에는 저장만 한다", async () => {
    const { input } = setup();
    pick(input);
    await waitFor(() => expect(mocks.uploadWorkoutImage).toHaveBeenCalled());
    // finalizeWorkoutVerification 은 목에 아예 없다. 부르면 TypeError 로 죽는다.
    // (set_workout_verification 은 completed 세션만 받으므로 여기서 부르면 안 된다)
    expect(screen.getByText("1/5")).toBeTruthy();
  });
});
