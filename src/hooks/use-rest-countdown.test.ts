// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestCountdown } from "./use-rest-countdown";

// jsdom에 AudioContext가 없다. 비프는 이 테스트의 관심사가 아니다.
vi.mock("@/lib/rest-countdown-audio", () => ({
  playRestCountdownBeep: vi.fn(),
  prepareRestCountdownAudio: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00+09:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * ① 운동 중 휴식시간 수정 (2026-08-04, 사용자 결정 = 진행 중 휴식에도 즉시 반영).
 *
 * 설정값만 바꾸고 돌고 있는 휴식을 그대로 두면 "10초 줄였다"가 두 가지 뜻이 된다.
 * 남은 시간은 `endsAtMs`에서 **계산**하므로, 조정도 그 종료 시각을 옮기는 일이다.
 */
describe("useRestCountdown — adjustRest (진행 중 휴식 조정)", () => {
  const setup = () =>
    renderHook(() => useRestCountdown(true, vi.fn()));

  it("휴식 중에 줄이면 남은 시간이 그만큼 즉시 줄어든다", () => {
    const { result } = setup();

    act(() => result.current.startRest("ex:set-1", 60));
    expect(result.current.remainingSeconds).toBe(60);

    act(() => result.current.adjustRest(-10));
    expect(result.current.remainingSeconds).toBe(50);
  });

  it("휴식 중에 늘리면 남은 시간이 그만큼 즉시 늘어난다", () => {
    const { result } = setup();

    act(() => result.current.startRest("ex:set-1", 60));
    act(() => result.current.adjustRest(10));

    expect(result.current.remainingSeconds).toBe(70);
  });

  it("남은 시간보다 많이 줄여도 최소 1초는 남긴다 — 건너뛰기가 되면 안 된다", () => {
    const { result } = setup();

    act(() => result.current.startRest("ex:set-1", 5));
    act(() => result.current.adjustRest(-10));

    expect(result.current.remainingSeconds).toBe(1);
  });

  it("돌고 있는 휴식이 없으면 아무 일도 하지 않는다", () => {
    const { result } = setup();

    act(() => result.current.adjustRest(-10));

    expect(result.current.remainingSeconds).toBeNull();
  });

  it("조정해도 휴식이 취소되지 않는다 — 무동작 감지가 쓰는 종료 시각이 남는다", () => {
    const { result } = setup();

    act(() => result.current.startRest("ex:set-1", 60));
    const before = result.current.lastRestEndsAtMs;
    act(() => result.current.adjustRest(-10));

    expect(result.current.lastRestEndsAtMs).toBe(before! - 10_000);
  });

  it("시간이 흐른 뒤 조정해도 실제 남은 시간 기준으로 계산한다 (벽시계)", () => {
    const { result } = setup();

    act(() => result.current.startRest("ex:set-1", 60));
    act(() => {
      vi.advanceTimersByTime(20_000); // 20초 경과 → 40초 남음
    });
    expect(result.current.remainingSeconds).toBe(40);

    act(() => result.current.adjustRest(-10));
    expect(result.current.remainingSeconds).toBe(30);
  });
});
