// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLongPress } from "./use-long-press";

function pointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers once after holding 500ms", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useLongPress(onTrigger));

    act(() => result.current.onPointerDown(pointerEvent(10, 10)));
    act(() => vi.advanceTimersByTime(500));

    expect(onTrigger).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1000));
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("does not trigger when released early", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useLongPress(onTrigger));

    act(() => result.current.onPointerDown(pointerEvent(10, 10)));
    act(() => vi.advanceTimersByTime(450));
    act(() => result.current.onPointerUp());
    act(() => vi.advanceTimersByTime(1000));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("cancels when the pointer moves more than 10px (scroll)", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useLongPress(onTrigger));

    act(() => result.current.onPointerDown(pointerEvent(10, 10)));
    act(() => result.current.onPointerMove(pointerEvent(10, 25)));
    act(() => vi.advanceTimersByTime(1000));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("keeps the timer within the 10px slop", () => {
    const onTrigger = vi.fn();
    const { result } = renderHook(() => useLongPress(onTrigger));

    act(() => result.current.onPointerDown(pointerEvent(10, 10)));
    act(() => result.current.onPointerMove(pointerEvent(14, 16)));
    act(() => vi.advanceTimersByTime(500));

    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it.each(["onPointerLeave", "onPointerCancel"] as const)(
    "cancels on %s",
    (handler) => {
      const onTrigger = vi.fn();
      const { result } = renderHook(() => useLongPress(onTrigger));

      act(() => result.current.onPointerDown(pointerEvent(10, 10)));
      act(() => result.current[handler]());
      act(() => vi.advanceTimersByTime(1000));

      expect(onTrigger).not.toHaveBeenCalled();
    },
  );

  it("clears a pending timer on unmount", () => {
    const onTrigger = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onTrigger));

    act(() => result.current.onPointerDown(pointerEvent(10, 10)));
    unmount();
    act(() => vi.advanceTimersByTime(1000));

    expect(onTrigger).not.toHaveBeenCalled();
  });
});
