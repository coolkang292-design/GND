// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestBar } from "./rest-bar";

afterEach(cleanup);

/**
 * ① 운동 중 휴식시간 수정 (2026-08-04).
 *
 * 휴식이 도는 중에도 10초 단위로 줄이고 늘릴 수 있어야 한다. 기존 `+30초`와
 * `건너뛰기`는 **없애지 않는다** — 이미 쓰던 기능을 요구사항에 없이 빼지 않는다.
 */
function setup() {
  const onAdjust = vi.fn();
  const onExtend = vi.fn();
  const onSkip = vi.fn();
  render(
    <RestBar
      remainingSeconds={75}
      onAdjust={onAdjust}
      onExtend={onExtend}
      onSkip={onSkip}
    />,
  );
  return { onAdjust, onExtend, onSkip };
}

describe("RestBar — 휴식 중 10초 증감", () => {
  it("남은 시간을 분:초로 보여준다", () => {
    setup();

    expect(screen.getByText("01:15")).toBeTruthy();
  });

  it("10초 줄이기 버튼이 있다", () => {
    const { onAdjust } = setup();

    fireEvent.click(screen.getByRole("button", { name: "휴식 10초 줄이기" }));

    expect(onAdjust).toHaveBeenCalledWith(-10);
  });

  it("10초 늘리기 버튼이 있다", () => {
    const { onAdjust } = setup();

    fireEvent.click(screen.getByRole("button", { name: "휴식 10초 늘리기" }));

    expect(onAdjust).toHaveBeenCalledWith(10);
  });

  it("기존 +30초와 건너뛰기는 그대로 남는다", () => {
    const { onExtend, onSkip } = setup();

    fireEvent.click(screen.getByRole("button", { name: /\+30초/ }));
    expect(onExtend).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /건너뛰기/ }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("타이머 역할과 이름을 유지한다 — 스크린리더가 읽던 것이 사라지면 안 된다", () => {
    setup();

    expect(screen.getByRole("timer", { name: "세트 사이 휴식" })).toBeTruthy();
  });
});

/**
 * ② 휴식 화면에서 다음 진행 항목 미리 보기 (2026-08-04).
 *
 * 요구: "휴식 타이머 화면에서 다음 운동 또는 다음 진행 항목을 미리 확인할 수
 * 있어야 함". 무엇이 다음인지는 `nextUpSet`이 정하고 여기서는 그리기만 한다.
 */
describe("RestBar — 다음 진행 항목", () => {
  function renderWithNext(nextUp: {
    exerciseName: string;
    setNumber: number;
    amount: string;
  } | null) {
    render(
      <RestBar
        remainingSeconds={60}
        nextUp={nextUp}
        onAdjust={vi.fn()}
        onExtend={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
  }

  it("다음 종목·세트·수량을 보여준다", () => {
    renderWithNext({
      exerciseName: "벤치 프레스",
      setNumber: 2,
      amount: "60kg 8회",
    });

    expect(screen.getByText(/벤치 프레스/)).toBeTruthy();
    expect(screen.getByText(/2세트/)).toBeTruthy();
    expect(screen.getByText(/60kg 8회/)).toBeTruthy();
  });

  it("남은 세트가 없으면 다 했다고 알린다 — 빈 칸을 남기지 않는다", () => {
    renderWithNext(null);

    expect(screen.getByText(/마지막 세트|다 했어요/)).toBeTruthy();
  });

  it("다음 항목이 있어도 남은 시간과 조절 버튼은 그대로다", () => {
    renderWithNext({
      exerciseName: "스쿼트",
      setNumber: 1,
      amount: "80kg 5회",
    });

    expect(screen.getByText("01:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "휴식 10초 줄이기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /건너뛰기/ })).toBeTruthy();
  });
});
