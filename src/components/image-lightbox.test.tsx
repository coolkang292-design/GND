// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "./image-lightbox";

afterEach(cleanup);

function open(onClose = vi.fn()) {
  const { container } = render(
    <ImageLightbox
      src="https://cdn.example/friend.jpg"
      alt="스칼레또님 프로필 사진"
      onClose={onClose}
    />,
  );
  const backdrop = container.querySelector("[aria-hidden]");
  return { onClose, backdrop };
}

describe("ImageLightbox", () => {
  it("사진과 설명을 그린다", () => {
    open();
    const img = screen.getByAltText("스칼레또님 프로필 사진");
    expect(img.getAttribute("src")).toBe("https://cdn.example/friend.jpg");
  });

  /**
   * ⚠️⚠️ **이 단언을 완화하지 마라.** 프로필 사진은 업로드 때 긴 변 512px로
   * 압축돼 저장되고(`lib/avatar.ts`) 원본은 서버에 없다. `max-w`를 키우면
   * 브라우저가 없는 화소를 늘려 그려서 **더 크게, 더 흐리게** 보인다.
   * "꽉 차게 해 달라"는 요청이 오면 화면을 넓히는 게 아니라 업로드 상한을
   * 올리는 것이 먼저다(그래도 이미 올라간 사진은 안 바뀐다).
   */
  it("표시 폭이 원본 상한인 512px에서 잠겨 있다", () => {
    open();
    const img = screen.getByAltText("스칼레또님 프로필 사진");
    expect(img.className).toContain("max-w-[min(90vw,512px)]");
  });

  it("배경을 누르면 닫힌다", () => {
    const { onClose, backdrop } = open();
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼으로 닫힌다", () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "사진 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape로 닫힌다", () => {
    const { onClose } = open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** 시트(z-50) 위에 떠야 한다 — 아래로 내리면 아무것도 안 보인다 */
  it("프로필 시트보다 위 층에 그린다", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("z-[70]");
  });
});
