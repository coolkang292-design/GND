// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

/**
 * ⚠️⚠️ **이 파일이 지키는 것: 어느 화면에도 `https://…`가 글자로 나오지 않는다.**
 *
 * 2026-08-19 이전에는 14곳이 전부 `{x.avatar_url ?? "👤"}`였다. 그 칸에 사진 URL이
 * 들어오면 화면이 주소를 글자로 그린다. 단위 테스트가 아니라 **화면을 열어야**
 * 보이는 종류의 고장이라, 여기서 컴포넌트 수준으로 못 박는다.
 */
describe("Avatar", () => {
  afterEach(cleanup);

  it("사진 URL이면 img로 그린다 — 주소를 글자로 뱉지 않는다", () => {
    const url = "https://x.test/storage/v1/object/public/avatars/u/1.jpg";
    const { container } = render(<Avatar src={url} className="h-8 w-8" />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(url);
    // 주소가 텍스트 노드로 새어 나오면 실패한다
    expect(container.textContent).not.toContain("http");
  });

  it("이모지면 글자로 그린다", () => {
    const { container } = render(<Avatar src="🧔" className="h-8 w-8" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("🧔");
  });

  it("빈 값이면 기본 아이콘 — 기본은 👤", () => {
    const { container } = render(<Avatar src={null} className="h-8 w-8" />);
    expect(container.textContent).toBe("👤");
  });

  it("fallback을 바꿀 수 있다", () => {
    const { container } = render(<Avatar src="" fallback="🙂" />);
    expect(container.textContent).toBe("🙂");
  });

  it("바깥 span에 호출부 className이 그대로 실린다 — 기존 크기·배경을 지킨다", () => {
    const { container } = render(
      <Avatar src="🧔" className="h-9 w-9 rounded-full bg-surface-2 text-lg" />,
    );
    const span = container.firstElementChild;
    expect(span?.className).toContain("h-9");
    expect(span?.className).toContain("bg-surface-2");
  });

  /**
   * 옆에 닉네임이 **글자로** 붙어 있는 자리가 대부분이라 기본은 장식용(`alt=""`)이다.
   * 닉네임이 없는 자리(킹 카드의 시상대 등)만 `label`을 준다.
   */
  it("기본 alt는 빈 문자열, label을 주면 그것을 쓴다", () => {
    const { container: plain } = render(<Avatar src="https://x.test/a.jpg" />);
    expect(plain.querySelector("img")?.getAttribute("alt")).toBe("");

    render(<Avatar src="https://x.test/a.jpg" label="홍길동 프로필 사진" />);
    expect(screen.getByAltText("홍길동 프로필 사진")).toBeTruthy();
  });

  it("사진은 lazy 로딩 — 피드·크루 목록에 여러 장이 한꺼번에 뜬다", () => {
    const { container } = render(<Avatar src="https://x.test/a.jpg" />);
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy");
  });
});
