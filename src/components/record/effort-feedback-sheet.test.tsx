// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EffortFeedbackSheet } from "./effort-feedback-sheet";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

function setup(
  overrides: Partial<React.ComponentProps<typeof EffortFeedbackSheet>> = {},
) {
  const props = {
    exerciseName: "숄더프레스",
    isLastSet: false,
    onAnswer: vi.fn(),
    onClose: vi.fn(),
    onPain: vi.fn(),
    ...overrides,
  };
  render(<EffortFeedbackSheet {...props} />);
  return props;
}

describe("EffortFeedbackSheet — 세 버튼", () => {
  it("정확히 세 가지 체감만 고르게 한다", () => {
    setup();

    expect(screen.getByRole("button", { name: "너무 가벼움" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "적당함 · 1~2회 여유" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "너무 무거움 · 자세 무너짐" }),
    ).toBeTruthy();
  });

  it("각 버튼이 저장될 값을 그대로 올려 보낸다", () => {
    const { onAnswer } = setup();

    fireEvent.click(screen.getByRole("button", { name: "너무 가벼움" }));
    expect(onAnswer).toHaveBeenCalledWith("too_light");

    fireEvent.click(screen.getByRole("button", { name: "적당함 · 1~2회 여유" }));
    expect(onAnswer).toHaveBeenCalledWith("on_target");

    fireEvent.click(
      screen.getByRole("button", { name: "너무 무거움 · 자세 무너짐" }),
    );
    expect(onAnswer).toHaveBeenCalledWith("too_heavy");
  });

  it("종목 이름을 제목에 넣는다", () => {
    setup();

    expect(screen.getByRole("heading", { name: /숄더프레스/ })).toBeTruthy();
  });

  it("접근성 있는 대화상자다", () => {
    setup();

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });
});

/**
 * ⚠️ 통증은 **체감이 아니다.** `too_heavy`로 저장하면 "무게를 조금 낮추면 되는
 *    일"로 기록된다. 통증은 운동을 멈출 신호라 다른 길로 보낸다.
 */
describe("EffortFeedbackSheet — 통증", () => {
  it("통증 버튼은 체감으로 저장하지 않는다", () => {
    const { onAnswer, onPain } = setup();

    fireEvent.click(screen.getByRole("button", { name: /통증이 있어요/ }));

    expect(onPain).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("EffortFeedbackSheet — 닫기", () => {
  it("닫으면 아무 체감도 저장하지 않는다", () => {
    const { onAnswer, onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "체감을 남기지 않고 닫기" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("Esc로도 닫히고 체감을 저장하지 않는다", () => {
    const { onAnswer, onClose } = setup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("EffortFeedbackSheet — 첫 세트와 마지막 세트의 안내가 다르다", () => {
  it("첫 세트는 남은 세트 무게를 맞춘다고 말한다", () => {
    setup({ isLastSet: false });

    expect(screen.getByText(/남은 세트/)).toBeTruthy();
  });

  it("마지막 세트는 다음 회차에 반영된다고 말한다", () => {
    setup({ isLastSet: true });

    expect(screen.getByText(/다음 회차/)).toBeTruthy();
  });
});
