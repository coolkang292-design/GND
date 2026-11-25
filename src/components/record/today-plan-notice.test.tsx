// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayPlanNotice } from "./today-plan-notice";

afterEach(cleanup);

describe("TodayPlanNotice — 내 방법 날의 달력 계획 안내 (2026-11-26)", () => {
  it("계획이 있다고 말하고 종목을 3개까지 보여 준다", () => {
    render(<TodayPlanNotice names={["스쿼트", "런지", "풀업", "벤치프레스"]} onStart={() => {}} />);
    expect(screen.getByText("달력에 오늘 계획이 있어요")).toBeTruthy();
    expect(screen.getByText("스쿼트 · 런지 · 풀업 외 1")).toBeTruthy();
  });

  it("누르면 계획으로 시작한다", () => {
    const onStart = vi.fn();
    render(<TodayPlanNotice names={["스쿼트"]} onStart={onStart} />);
    fireEvent.click(screen.getByTestId("today-plan-notice"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("처리 중이면 눌리지 않는다", () => {
    const onStart = vi.fn();
    render(<TodayPlanNotice names={["스쿼트"]} onStart={onStart} disabled />);
    fireEvent.click(screen.getByTestId("today-plan-notice"));
    expect(onStart).not.toHaveBeenCalled();
  });
});
