// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
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

/**
 * 백그라운드 스로틀링 재현 — 벽시계는 `seconds`만큼 흐르지만 틱은 한 번만 깨어난다.
 * 브라우저가 백그라운드 탭의 타이머를 늦출 때 실제로 일어나는 일이다.
 */
function sleepInBackground(seconds: number) {
  act(() => {
    vi.setSystemTime(Date.now() + seconds * 1_000);
    vi.advanceTimersByTime(1_000);
  });
}

describe("useRestCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // vitest globals가 꺼져 있어 RTL 자동 정리가 돌지 않는다. 안 지우면 이전
    // 테스트의 훅이 살아남아 visibilitychange 리스너가 겹쳐 잡힌다.
    cleanup();
    vi.useRealTimers();
  });

  it("plays four short beeps and one long beep once each at 5 through 1", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 5));
    advanceSeconds(5);

    expect(prepareAudio).not.toHaveBeenCalled();
    expect(playBeep).toHaveBeenNthCalledWith(1, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(2, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(3, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(4, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(5, { durationSeconds: 0.35 });
    expect(playBeep).toHaveBeenCalledTimes(5);
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("plays the heads-up beep once at ten seconds remaining", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 12));
    advanceSeconds(2);

    expect(result.current.remainingSeconds).toBe(10);
    expect(playBeep).toHaveBeenCalledOnce();
    expect(playBeep).toHaveBeenCalledWith({ durationSeconds: 0.2 });
  });

  it("counts down by wall clock even when the tick wakes up late", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 60));
    // 다른 앱을 20초 쓰는 동안 틱은 한 번만 깨어났다 (+ 그 틱 자체의 1초).
    sleepInBackground(20);

    expect(result.current.remainingSeconds).toBe(39);
  });

  it("completes with one long beep when the rest ended in the background", () => {
    const onRestComplete = vi.fn();
    const { result } = renderHook(() => useRestCountdown(true, onRestComplete));

    act(() => result.current.startRest("squat:set-1", 60));
    act(() => {
      vi.setSystemTime(Date.now() + 70_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(prepareAudio).toHaveBeenCalledOnce();
    expect(playBeep).toHaveBeenCalledOnce();
    expect(playBeep).toHaveBeenCalledWith({ durationSeconds: 0.35 });
    expect(onRestComplete).toHaveBeenCalledOnce();
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("does not beep again on return when the final beep already played", () => {
    const onRestComplete = vi.fn();
    const { result } = renderHook(() => useRestCountdown(true, onRestComplete));

    act(() => result.current.startRest("squat:set-1", 5));
    advanceSeconds(5);
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(playBeep).toHaveBeenCalledTimes(5);
    expect(onRestComplete).toHaveBeenCalledOnce();
  });

  it("does not run a stale tick or beep after skip", () => {
    const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

    act(() => result.current.startRest("squat:set-1", 20));
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

    act(() => result.current.startRest("squat:set-1", 20));
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
    // 3(시작) · 10 · 5 · 4 · 3
    expect(playBeep).toHaveBeenCalledTimes(5);
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

    expect(playBeep).toHaveBeenNthCalledWith(1, { durationSeconds: 0.2 });
    expect(playBeep).toHaveBeenNthCalledWith(2, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(3, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(4, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(5, { durationSeconds: 0.12 });
    expect(playBeep).toHaveBeenNthCalledWith(6, { durationSeconds: 0.35 });
    expect(playBeep).toHaveBeenCalledTimes(6);
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

    act(() => result.current.startRest("squat:set-1", 20));
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
