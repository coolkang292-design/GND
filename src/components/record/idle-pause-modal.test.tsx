// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdlePauseModal } from "./idle-pause-modal";

afterEach(cleanup);

describe("일시정지 팝업의 운동 취소", () => {
  const base = { pausedSeconds: 12, busy: false, onResume: vi.fn(), onFinish: vi.fn() };

  it("운동 취소 버튼을 누르면 취소 함수가 호출된다", () => {
    const onCancel = vi.fn();
    render(<IdlePauseModal {...base} manual onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /운동 취소/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("취소 함수가 없으면 버튼도 없다", () => {
    render(<IdlePauseModal {...base} manual />);
    expect(screen.queryByRole("button", { name: /운동 취소/ })).toBeNull();
  });
});
