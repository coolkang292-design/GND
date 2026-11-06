import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageCarousel } from "./stage-carousel";
import { NextStagePreview } from "./next-stage-preview";
import { StageGuideSheet } from "./stage-guide-sheet";

/** next/image가 만든 src(`/_next/image?url=…`)에서 원본 경로를 꺼낸다. */
function paths(html: string): string[] {
  return Array.from(html.matchAll(/src="([^"]+)"/g))
    .map((m) => decodeURIComponent(m[1].replace(/&amp;/g, "&")))
    .map((s) => /\/characters\/[^&\s"]*char-\d+\.png/.exec(s)?.[0])
    .filter((x): x is string => !!x);
}

describe("character variant 렌더", () => {
  it("female이면 캐러셀 7장이 모두 female 폴더를 가리킨다", () => {
    const p = paths(
      renderToStaticMarkup(
        <StageCarousel currentStage={2} variant="female" onHelpClick={() => {}} />,
      ),
    );
    expect(p).toHaveLength(7);
    p.forEach((x) => expect(x).toContain("/characters/female/char-"));
  });
  it("기본(male)은 기존 경로 그대로", () => {
    const p = paths(
      renderToStaticMarkup(
        <StageCarousel currentStage={2} onHelpClick={() => {}} />,
      ),
    );
    expect(p).toHaveLength(7);
    p.forEach((x) => expect(x).not.toContain("/female/"));
  });
  it("다음 단계 미리보기·안내 시트도 variant를 따른다", () => {
    expect(
      paths(
        renderToStaticMarkup(
          <NextStagePreview currentStage={2} totalXp={100} variant="female" />,
        ),
      )[0],
    ).toBe("/characters/female/char-3.png");
    const g = paths(
      renderToStaticMarkup(
        <StageGuideSheet currentStage={2} totalXp={100} variant="female" onClose={() => {}} />,
      ),
    );
    expect(g).toHaveLength(7);
    g.forEach((x) => expect(x).toContain("/female/"));
  });
});
