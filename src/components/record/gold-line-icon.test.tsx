import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_GOLD_ICON_NAMES, GoldLineIcon } from "./gold-line-icon";

describe("GoldLineIcon", () => {
  it("지원하는 모든 아이콘을 장식용 SVG로 렌더한다", () => {
    for (const name of ALL_GOLD_ICON_NAMES) {
      const markup = renderToStaticMarkup(<GoldLineIcon name={name} />);

      expect(markup).toContain("<svg");
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain("currentColor");
    }
  });
});
