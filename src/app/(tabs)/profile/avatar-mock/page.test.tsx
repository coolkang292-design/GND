import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AvatarMockPage from "./page";

describe("AvatarMockPage", () => {
  it("좌표 합성 미리보기와 6개 아이템을 렌더한다", () => {
    const html = renderToStaticMarkup(<AvatarMockPage />);
    expect(html).toContain("캐릭터 아이템 상점");
    expect(html).toContain("개발 목업");
    expect(html).toContain("GND 캡");
    expect(html).toContain("블랙 선글라스");
    expect(html).toContain("GND 후드");
    expect(html).toContain("블랙 조거팬츠");
    expect(html).toContain("GND 하이탑");
    expect(html).toContain("블랙 스포츠 워치");
  });
});
