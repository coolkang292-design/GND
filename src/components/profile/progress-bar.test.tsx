import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("진행률을 width %로, 상태 색을 반영한다", () => {
    const html = renderToStaticMarkup(<ProgressBar progress={0.7} state="active" />);
    expect(html).toContain("70%");
  });
  it("100%를 넘겨도 100%로 고정", () => {
    const html = renderToStaticMarkup(<ProgressBar progress={1.5} state="earned" />);
    expect(html).toContain("100%");
    expect(html).not.toContain("150%");
  });
});
