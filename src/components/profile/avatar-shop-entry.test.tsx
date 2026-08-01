import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarShopEntry } from "./avatar-shop-entry";

describe("AvatarShopEntry", () => {
  it("캐릭터 아이템 상점 목업으로 연결한다", () => {
    const html = renderToStaticMarkup(<AvatarShopEntry />);
    expect(html).toContain('href="/profile/avatar-mock"');
    expect(html).toContain("캐릭터 아이템 상점");
    expect(html).toContain("실제 포인트 차감 없음");
  });
});
