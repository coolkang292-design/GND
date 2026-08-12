// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalExercise } from "@/lib/workout";
import { ExerciseCard } from "./exercise-card";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

const exercise: LocalExercise = {
  key: "bench-press",
  name: "벤치 프레스",
  bodyPart: "가슴",
  exerciseType: "weight",
  measure: null,
  isCustom: false,
  sets: [
    {
      key: "set-1",
      weightKg: 60,
      reps: 8,
      distanceKm: 0,
      durationMin: 0,
      done: false,
      effortFeedback: null,
    },
  ],
};

type CardOptions = {
  active?: boolean;
  loadingLast?: boolean;
  loadLastDisabled?: boolean;
  /** 다른 종목으로 바꿔 그릴 때 (자세 안내 등) */
  item?: LocalExercise;
  onOpenGuide?: (name: string) => void;
  handlers?: {
    onUpdateSet?: () => void;
    onToggleDone?: () => void;
    onRemoveExercise?: () => void;
  };
};

function cardElement({
  active = false,
  loadingLast = false,
  loadLastDisabled = false,
  item,
  onOpenGuide,
  handlers = {},
}: CardOptions = {}) {
  return (
    <ExerciseCard
      exercise={item ?? exercise}
      index={0}
      active={active}
      loadingLast={loadingLast}
      loadLastDisabled={loadLastDisabled}
      onLoadLast={vi.fn()}
      onUpdateSet={handlers.onUpdateSet ?? vi.fn()}
      onToggleDone={handlers.onToggleDone ?? vi.fn()}
      onLongPress={vi.fn()}
      onAddSet={vi.fn()}
      onRemoveSet={vi.fn()}
      onRemoveExercise={handlers.onRemoveExercise ?? vi.fn()}
      onOpenGuide={onOpenGuide}
    />
  );
}

function renderCard(options: CardOptions = {}) {
  return renderToStaticMarkup(cardElement(options));
}

function loadLastButton(html: string): string {
  const button = html.match(
    /<button[^>]*aria-label="벤치 프레스 직전 기록 불러오기"[^>]*>/,
  );
  expect(button).not.toBeNull();
  return button![0];
}

describe("ExerciseCard 직전 기록 불러오기", () => {
  it("운동 시작 전에는 종목별 불러오기 버튼을 활성화한다", () => {
    const html = renderCard();

    expect(html).toContain("↻ 불러오기");
    expect(html).toContain('aria-label="벤치 프레스 직전 기록 불러오기"');
    expect(loadLastButton(html)).not.toContain('disabled=""');
  });

  it("운동 중에는 직전 기록 불러오기 버튼을 비활성화한다", () => {
    const html = renderCard({ active: true });

    expect(loadLastButton(html)).toContain('disabled=""');
  });

  it("직전 기록을 조회하는 동안 문구를 바꾸고 버튼을 비활성화한다", () => {
    const html = renderCard({ loadingLast: true, loadLastDisabled: true });

    expect(html).toContain("불러오는 중…");
    expect(loadLastButton(html)).toContain('disabled=""');
  });

  it("다른 종목의 직전 기록을 조회하는 동안에도 버튼을 비활성화한다", () => {
    const html = renderCard({ loadLastDisabled: true });

    expect(html).toContain("↻ 불러오기");
    expect(html).not.toContain("불러오는 중…");
    expect(loadLastButton(html)).toContain('disabled=""');
  });
});

/**
 * 자세 안내 진입 (계획 2026-08-12 Task 3).
 *
 * 안내가 **있는 종목에만** 버튼을 낸다. 없는 종목에 버튼을 내면 눌러도 빈 시트가
 * 열리거나 아무 일도 안 일어나는 죽은 버튼이 된다.
 */
const guided: LocalExercise = {
  ...exercise,
  key: "shoulder-press",
  name: "숄더프레스",
  bodyPart: "어깨",
};

describe("ExerciseCard — 자세 안내", () => {
  it("안내가 있는 종목에는 자세 안내 버튼이 있다", () => {
    render(cardElement({ item: guided, onOpenGuide: vi.fn() }));

    expect(screen.getByRole("button", { name: "숄더프레스 자세 안내" })).toBeTruthy();
  });

  it("안내가 없는 종목에는 버튼을 숨긴다", () => {
    // 기본 픽스처 '벤치 프레스'는 띄어쓰기가 달라 카탈로그·안내와 맞지 않는다.
    render(cardElement({ onOpenGuide: vi.fn() }));

    expect(screen.queryByRole("button", { name: /자세 안내/ })).toBeNull();
  });

  it("커스텀 종목에는 버튼을 숨긴다", () => {
    render(
      cardElement({
        item: { ...guided, name: "내가 만든 운동", isCustom: true },
        onOpenGuide: vi.fn(),
      }),
    );

    expect(screen.queryByRole("button", { name: /자세 안내/ })).toBeNull();
  });

  it("onOpenGuide를 안 넘긴 화면에는 버튼이 없다", () => {
    render(cardElement({ item: guided }));

    expect(screen.queryByRole("button", { name: /자세 안내/ })).toBeNull();
  });

  it("누르면 종목 이름으로 호출한다", () => {
    const onOpenGuide = vi.fn();
    render(cardElement({ item: guided, onOpenGuide }));

    fireEvent.click(screen.getByRole("button", { name: "숄더프레스 자세 안내" }));

    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    expect(onOpenGuide).toHaveBeenCalledWith("숄더프레스");
  });

  it("눌러도 세트 완료·입력·삭제가 함께 일어나지 않는다", () => {
    const handlers = {
      onUpdateSet: vi.fn(),
      onToggleDone: vi.fn(),
      onRemoveExercise: vi.fn(),
    };
    render(cardElement({ item: guided, onOpenGuide: vi.fn(), handlers }));

    fireEvent.click(screen.getByRole("button", { name: "숄더프레스 자세 안내" }));

    expect(handlers.onUpdateSet).not.toHaveBeenCalled();
    expect(handlers.onToggleDone).not.toHaveBeenCalled();
    expect(handlers.onRemoveExercise).not.toHaveBeenCalled();
  });

  it("운동 중에도 안내를 열 수 있다", () => {
    render(cardElement({ item: guided, onOpenGuide: vi.fn(), active: true }));

    expect(screen.getByRole("button", { name: "숄더프레스 자세 안내" })).toBeTruthy();
  });
});
