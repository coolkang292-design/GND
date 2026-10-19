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

  it("실제 주간 성장 정보가 있으면 숫자로 성취를 강조하고 누적 기록은 보존한다", () => {
    render(<CompletionHeroCard hero={hero} achievementLine="지난주보다 1일 더 운동했어요." statsLine="x" recordNote={null} />);
    expect(screen.getByLabelText("이번 운동의 성취").textContent).toContain("지난주보다 1일");
    expect(screen.getByText(hero.progressLine)).toBeTruthy();
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

  /**
   * 이슈 #16 P0-A (2026-10-19 사용자 결정) — 큰 숫자 세 칸 = 운동 시간 · 운동한 날 · XP.
   * 볼륨·세트는 접힘 영역(기록 상세)으로 내려간다.
   */
  it("세 칸은 운동 시간·운동한 날·XP다", () => {
    render(
      <CompletionHeroCard
        hero={hero}
        statsLine="45분 · 운동한 날 24일째 · +120 XP"
        stats={{ minutes: 45, workoutDays: 24, xp: 120 }}
        recordNote={null}
      />,
    );
    const cells = screen.getByTestId("hero-stats");
    expect(cells.textContent).toContain("45");
    expect(cells.textContent).toContain("24");
    expect(cells.textContent).toContain("+120");
    expect(cells.textContent).not.toMatch(/KG|SETS/);
  });

  it("모르는 값은 칸을 빼고 0을 지어내지 않는다", () => {
    render(
      <CompletionHeroCard
        hero={{ ...hero, progressLine: null }}
        statsLine="45분"
        stats={{ minutes: 45, workoutDays: null, xp: null }}
        recordNote={null}
      />,
    );
    const cells = screen.getByTestId("hero-stats");
    expect(cells.children).toHaveLength(1);
    expect(cells.textContent).not.toContain("XP");
  });

  it("운동한 날 칸이 있으면 누적일 문장을 또 쓰지 않는다 — 같은 숫자 두 번", () => {
    render(
      <CompletionHeroCard
        hero={hero}
        statsLine="x"
        stats={{ minutes: 45, workoutDays: 21, xp: 120 }}
        recordNote={null}
      />,
    );
    expect(screen.queryByText(hero.progressLine)).toBeNull();
  });
});

