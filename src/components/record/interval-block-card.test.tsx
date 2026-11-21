// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntervalBlockCard } from "./interval-block-card";

afterEach(cleanup);

const NAMES = ["푸시업", "버피", "점핑잭", "크런치"];

describe("IntervalBlockCard — 목록 안의 인터벌 한 장", () => {
  it("코스와 4종목 이름, 종목당 횟수를 보여 준다", () => {
    render(<IntervalBlockCard minutes={8} names={NAMES} done={false} />);
    expect(screen.getByText(/전신 인터벌 8분/)).toBeTruthy();
    expect(screen.getByText("푸시업 · 버피 · 점핑잭 · 크런치")).toBeTruthy();
    expect(screen.getByText(/종목마다 4회로 기록돼요/)).toBeTruthy();
  });

  it("시작 전: 순서·빼기 버튼이 있고, 시작 버튼은 없다", () => {
    const onMoveUp = vi.fn();
    const onRemove = vi.fn();
    render(
      <IntervalBlockCard
        minutes={4}
        names={NAMES}
        done={false}
        onMoveUp={onMoveUp}
        onMoveDown={undefined}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "인터벌 위로" }));
    fireEvent.click(screen.getByRole("button", { name: "인터벌 빼기" }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    // 맨 아래라 내릴 수 없다
    expect((screen.getByRole("button", { name: "인터벌 아래로" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("interval-block-start")).toBeNull();
  });

  it("운동 중 · 내 차례: 시작 버튼만 있고 순서·빼기는 없다 (시작한 뒤에는 못 옮긴다)", () => {
    const onStart = vi.fn();
    render(<IntervalBlockCard minutes={8} names={NAMES} done={false} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("interval-block-start"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "인터벌 위로" })).toBeNull();
    expect(screen.queryByRole("button", { name: "인터벌 빼기" })).toBeNull();
  });

  it("끝나면 완료 표시가 뜨고 시작 버튼은 사라진다", () => {
    render(<IntervalBlockCard minutes={8} names={NAMES} done onStart={vi.fn()} />);
    expect(screen.getByText("인터벌 완료")).toBeTruthy();
    expect(screen.queryByTestId("interval-block-start")).toBeNull();
    expect(screen.getByTestId("interval-block-card").getAttribute("data-done")).toBe("true");
  });
});
