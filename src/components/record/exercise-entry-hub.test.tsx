// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExerciseEntryHub } from "./exercise-entry-hub";

afterEach(cleanup);

describe("ExerciseEntryHub", () => {
  it("프로그램과 직접 고르기를 먼저, 빠른 시작을 그 아래에 보여준다", () => {
    render(
      <ExerciseEntryHub
        hasPast
        routineCount={2}
        onPrograms={vi.fn()}
        onSearch={vi.fn()}
        onPast={vi.fn()}
        onRoutine={vi.fn()}
        onInterval={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("프로그램으로 시작하기"),
      expect.stringContaining("운동 직접 고르기"),
      expect.stringContaining("지난 운동"),
      expect.stringContaining("내 루틴"),
      expect.stringContaining("4분부터 시작하는 전신 인터벌"),
    ]);
    expect(screen.getByText("GND 추천")).toBeTruthy();
    expect(
      screen.getByText("목표만 고르면 6주 운동을 달력에 담아요"),
    ).toBeTruthy();
    expect(
      screen.getByText("검색·상황·부위별로 오늘 운동을 추가해요"),
    ).toBeTruthy();
    expect(screen.getByText("빠른 시작")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /^상황별 추천/ }),
    ).toBeNull();
  });

  it("각 카드는 대응하는 동작만 한 번 호출한다", () => {
    const handlers = {
      onPrograms: vi.fn(),
      onSearch: vi.fn(),
      onPast: vi.fn(),
      onRoutine: vi.fn(),
      onInterval: vi.fn(),
    };
    render(
      <ExerciseEntryHub hasPast routineCount={1} {...handlers} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /프로그램으로 시작하기/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /운동 직접 고르기/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /지난 운동/ }));
    fireEvent.click(screen.getByRole("button", { name: /내 루틴/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /4분부터 시작하는 전신 인터벌/,
      }),
    );

    for (const handler of Object.values(handlers)) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it("사용할 수 없는 빠른 시작과 프로그램 경로는 렌더하지 않는다", () => {
    render(
      <ExerciseEntryHub
        hasPast={false}
        routineCount={0}
        onSearch={vi.fn()}
        onPast={vi.fn()}
        onRoutine={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /프로그램으로 시작하기/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /지난 운동/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /내 루틴/ })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /4분부터 시작하는 전신 인터벌/,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /운동 직접 고르기/ }),
    ).toBeTruthy();
  });

  it("장식 이미지는 접근성 이름을 중복하지 않는다", () => {
    const { container } = render(
      <ExerciseEntryHub
        hasPast
        routineCount={1}
        onPrograms={vi.fn()}
        onSearch={vi.fn()}
        onPast={vi.fn()}
        onRoutine={vi.fn()}
        onInterval={vi.fn()}
      />,
    );

    const images = [...container.querySelectorAll("img")];
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((image) => image.getAttribute("alt") === "")).toBe(true);
    expect(container.querySelector("button button")).toBeNull();
  });
});
