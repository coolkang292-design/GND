// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntervalSessionOverlay } from "./interval-session-overlay";

afterEach(cleanup);

const NAMES = ["맨몸 스쿼트", "니 푸시업", "데드버그", "마운틴 클라이머"];

function view(elapsedSeconds: number, overrides: Record<string, unknown> = {}) {
  return render(
    <IntervalSessionOverlay
      open
      exerciseNames={NAMES}
      minutes={4}
      elapsedSeconds={elapsedSeconds}
      paused={false}
      onTogglePause={vi.fn()}
      onStop={vi.fn()}
      {...overrides}
    />,
  );
}

describe("IntervalSessionOverlay", () => {
  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <IntervalSessionOverlay
        open={false}
        exerciseNames={NAMES}
        minutes={4}
        elapsedSeconds={0}
        paused={false}
        onTogglePause={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  /**
   * 사용자가 **아무것도 입력하지 않는다** (사용자 지시 2026-08-13).
   * 근력 오버레이의 ± 버튼·세트 입력은 인터벌에서 의미가 없다.
   */
  it("횟수 입력 장치가 하나도 없다", () => {
    view(15);

    expect(screen.queryByText("횟수")).toBeNull();
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
    expect(screen.queryByRole("button", { name: "−" })).toBeNull();
    expect(screen.queryByText(/현재 세트/)).toBeNull();
    // 남는 것은 두 개뿐이다
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("시작 10초는 준비를 보여준다", () => {
    view(0);

    expect(screen.getByTestId("interval-phase").textContent).toBe("준비");
    expect(screen.getByTestId("interval-countdown").textContent).toBe("00:10");
    expect(screen.getByText("다음: 맨몸 스쿼트")).toBeTruthy();
  });

  it("운동 구간에는 종목과 남은 초를 크게 보여준다", () => {
    view(10);

    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
    expect(screen.getByTestId("interval-countdown").textContent).toBe("00:20");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "1라운드 / 8라운드",
    );
    expect(screen.getByText("다음: 니 푸시업")).toBeTruthy();
  });

  it("20초가 지나면 휴식과 다음 종목을 알린다", () => {
    view(30);

    expect(screen.getByTestId("interval-phase").textContent).toBe("휴식");
    expect(screen.getByTestId("interval-countdown").textContent).toBe("00:10");
    expect(screen.getByText("다음: 니 푸시업")).toBeTruthy();
  });

  it("시간만 흐르면 다음 종목으로 넘어간다 — 누르는 것이 없다", () => {
    const first = view(10);
    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
    first.unmount();

    view(40);
    expect(screen.getByTestId("interval-phase").textContent).toBe("니 푸시업");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "2라운드 / 8라운드",
    );
  });

  it("지금 하는 종목을 목록에서 표시한다", () => {
    view(70);

    const current = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("data-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("데드버그");
  });

  it("일시정지 중임을 알리고 버튼 문구가 바뀐다", () => {
    const onTogglePause = vi.fn();
    view(15, { paused: true, onTogglePause });

    expect(screen.getByRole("status").textContent).toContain("일시정지 중");
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });

  it("중단을 부모에게 넘긴다", () => {
    const onStop = vi.fn();
    view(15, { onStop });

    fireEvent.click(screen.getByRole("button", { name: "중단하기" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("음원이 끝나면 완료를 보여준다", () => {
    view(250);

    expect(screen.getByTestId("interval-phase").textContent).toBe("끝났어요");
    expect(screen.getByTestId("interval-round").textContent).toBe(
      "8라운드 완료",
    );
    expect(screen.queryByText(/^다음:/)).toBeNull();
  });

  it("16분 코스는 32라운드를 센다", () => {
    view(260, { minutes: 16 });

    expect(screen.getByTestId("interval-round").textContent).toBe(
      "9라운드 / 32라운드",
    );
    expect(screen.getByTestId("interval-phase").textContent).toBe("맨몸 스쿼트");
  });
});
