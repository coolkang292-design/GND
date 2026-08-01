import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarCoordinatePreview } from "./avatar-coordinate-preview";

describe("AvatarCoordinatePreview", () => {
  it("기본 캐릭터와 장착한 모자를 좌표 비율로 합성한다", () => {
    const html = renderToStaticMarkup(
      <AvatarCoordinatePreview equippedItemIds={["gnd-cap-v2"]} />,
    );

    expect(html).toContain(
      "/_next/image?url=%2Favatar-coordinate-v2%2Fbase%2Favatar-base-master.png",
    );
    expect(html).toContain(
      "/_next/image?url=%2Favatar-coordinate-v2%2Fitems%2Fgnd-cap-v2.png",
    );
    expect(html).toContain("left:28.515625%");
    expect(html).toContain("top:6.510416666666667%");
    expect(html).toContain("z-index:40");
    expect(html).toContain("aspect-ratio:2 / 3");
  });

  it("장착하지 않은 아이템은 렌더하지 않는다", () => {
    const html = renderToStaticMarkup(
      <AvatarCoordinatePreview equippedItemIds={[]} />,
    );
    expect(html).not.toContain(
      "%2Favatar-coordinate-v2%2Fitems%2Fgnd-cap-v2.png",
    );
  });
});
