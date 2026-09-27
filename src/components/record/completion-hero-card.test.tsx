// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompletionHeroCard } from "./completion-hero-card";

afterEach(cleanup);

/**
 * 운동 완료 카드 (2026-09-28 사용자 요청 — 사진 + "오늘도 해냈다" + 기록이 실력이 된다).
 * 문구 자체는 `completionHero()` 테스트가 본다. 여기서는 **보이는가**만 본다.
 */
const hero = {
  image: "/record-assets/workout-complete-hero.webp",
  alt: "오늘도 해냈다 — 오늘의 기록이 쌓여 내일의 실력이 된다",
  progressLine: "운동한 날 21일째, 기록이 쌓이고 있어요",
};

describe("CompletionHeroCard", () => {
  it("완료 이미지(대체 텍스트 포함)·누적일·수치를 보여준다", () => {
    render(
      <CompletionHeroCard
        hero={hero}
        statsLine="1분 · 볼륨 1,755kg · 완료 세트 3개"
        recordNote={null}
      />,
    );
    const img = screen.getByAltText(hero.alt);
    expect(img.getAttribute("src")).toContain("workout-complete-hero");
    expect(screen.getByText(hero.progressLine)).toBeTruthy();
    expect(screen.getByText("1분 · 볼륨 1,755kg · 완료 세트 3개")).toBeTruthy();
  });

  it("옛 🎉 제목 '오늘 운동 완료!'를 글자로 다시 얹지 않는다 — 이미지에 이미 있다", () => {
    render(<CompletionHeroCard hero={hero} statsLine="x" recordNote={null} />);
    expect(screen.queryByText("오늘 운동 완료!")).toBeNull();
    expect(screen.queryByText("🎉")).toBeNull();
  });

  it("기록 갱신이 있을 때만 갱신 줄을 보여준다", () => {
    const { rerender } = render(
      <CompletionHeroCard hero={hero} statsLine="x" recordNote={null} />,
    );
    expect(screen.queryByText(/기록 갱신/)).toBeNull();
    rerender(
      <CompletionHeroCard hero={hero} statsLine="x" recordNote="랫풀다운을 3회 더 하셨어요" />,
    );
    expect(
      screen.getByText(/기록 갱신! 지난번보다 랫풀다운을 3회 더 하셨어요/),
    ).toBeTruthy();
  });

  it("누적일을 모르면 그 줄을 숨긴다", () => {
    render(
      <CompletionHeroCard
        hero={{ ...hero, progressLine: null }}
        statsLine="x"
        recordNote={null}
      />,
    );
    expect(screen.queryByText(/일째/)).toBeNull();
  });
});
