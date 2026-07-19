// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { playRestCountdownBeep, prepareRestCountdownAudio } from "@/lib/rest-countdown-audio";

import { useRestCountdown } from "./use-rest-countdown";

vi.mock("@/lib/rest-countdown-audio", () => ({
  playRestCountdownBeep: vi.fn(),
  prepareRestCountdownAudio: vi.fn(),
}));

const playBeep = vi.mocked(playRestCountdownBeep);
const prepareAudio = vi.mocked(prepareRestCountdownAudio);

function advanceSeconds(seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    act(() => vi.advanceTimersByTime(1_000));
  }
}

describe("useRestCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays the short-short-long pattern once each at 3, 2, and 1", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 3));
    advanceSeconds(3);

    expect(prepareAudio).not.toHaveBeenCalled();
    expect(playBeep).toHaveBeenNthCalledWith(1, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(2, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(3, { durationSeconds: 0.35 });
    expect(playBeep).toHaveBeenCalledTimes(3);
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("does not run a stale tick or beep after skip", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 4));
    act(() => result.current.stopRest());
    advanceSeconds(5);

    expect(result.current.remainingSeconds).toBeNull();
    expect(playBeep).not.toHaveBeenCalled();
  });

  it("clears rest permanently when the workout becomes inactive", () => {
    const onRestComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }) => useRestCountdown(active, onRestComplete),
      { initialProps: { active: true } },
    );

    act(() => result.current.startRest("squat:set-1", 4));
    rerender({ active: false });
    rerender({ active: true });
    advanceSeconds(5);

    expect(result.current.remainingSeconds).toBeNull();
    expect(playBeep).not.toHaveBeenCalled();
    expect(onRestComplete).not.toHaveBeenCalled();
  });

  it("keeps the extended time and can play the pattern again", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 3));
    act(() => result.current.extendRest());
    expect(result.current.remainingSeconds).toBe(33);

    advanceSeconds(30);

    expect(result.current.remainingSeconds).toBe(3);
    expect(playBeep).toHaveBeenCalledTimes(2);
    expect(playBeep).toHaveBeenLastCalledWith({ durationSeconds: 0.12 });
  });

  it("restarts the countdown when a new source starts with the same seconds", () => {
    const onRestComplete = vi.fn();
    const { result } = renderHook(() =>
      useRestCountdown(true, onRestComplete),
    );

    act(() => result.current.startRest("squat:set-1", 60));
    act(() => result.current.startRest("bench:set-1", 60));
    advanceSeconds(57);

    expect(result.current.remainingSeconds).toBe(3);

    advanceSeconds(3);

    expect(playBeep).toHaveBeenNthCalledWith(1, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(2, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(3, { durationSeconds: 0.35 });
    expect(playBeep).toHaveBeenCalledTimes(3);
    expect(result.current.remainingSeconds).toBeNull();
    expect(onRestComplete).toHaveBeenCalledOnce();
  });

  it("only cancels rest when the same source set is unchecked", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 5));
    act(() => result.current.startRest("bench:set-1", 5));
    act(() => result.current.cancelRestForSource("squat:set-1"));

    expect(result.current.remainingSeconds).toBe(5);

    act(() => result.current.cancelRestForSource("bench:set-1"));

    expect(result.current.remainingSeconds).toBeNull();
  });

  it("does not play after the workout stop path", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 4));
    act(() => result.current.stopRest());
    advanceSeconds(5);

    expect(playBeep).not.toHaveBeenCalled();
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("does not duplicate a beep for one remaining value in StrictMode", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    act(() => result.current.startRest("squat:set-1", 3));

    expect(playBeep).toHaveBeenCalledOnce();
    expect(playBeep).toHaveBeenCalledWith({ durationSeconds: 0.12 });
  });
});
