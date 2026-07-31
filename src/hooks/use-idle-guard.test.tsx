// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIdleGuard, type IdleGuardSnapshot } from "./use-idle-guard";

const T0 = 1_754_000_000_000;
const LIMIT_MS = 300_000;

/** 페이지와 같은 모양 — onChange가 곧 draft 갱신이다. */
function useHarness(props: {
  active: boolean;
  guarded: boolean;
  lastRestEndsAtMs: number | null;
}) {
  const [snapshot, setSnapshot] = useState<IdleGuardSnapshot>({
    pausedSeconds: 0,
    pausedAtMs: null,
    lastActivityMs: null,
  });
  const guard = useIdleGuard({ ...props, snapshot, onChange: setSnapshot });
  return { guard, snapshot };
}

function setup(
  props: Partial<Parameters<typeof useHarness>[0]> = {},
) {
  return renderHook(() =>
    useHarness({
      active: true,
      guarded: true,
      lastRestEndsAtMs: null,
      ...props,
    }),
  );
}

/** 다른 앱을 `ms`만큼 쓰는 사이 — 벽시계만 흐르고 틱은 한 번만 깨어난다 */
function sleepInBackground(ms: number) {
  act(() => {
    vi.setSystemTime(Date.now() + ms - 1_000);
    vi.advanceTimersByTime(1_000); // 돌아온 뒤 첫 틱
  });
}

describe("useIdleGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("treats the start of the workout as the first activity", () => {
    const { result } = setup();

    expect(result.current.snapshot.lastActivityMs).toBe(T0);
    expect(result.current.guard.paused).toBe(false);
  });

  it("does not pause one second before the limit", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(LIMIT_MS - 1_000));

    expect(result.current.guard.paused).toBe(false);
  });

  it("pauses exactly at the limit", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(LIMIT_MS));

    expect(result.current.guard.paused).toBe(true);
    expect(result.current.snapshot.pausedAtMs).toBe(T0 + LIMIT_MS);
  });

  it("blames only the time past the grace period after a long absence", () => {
    const { result } = setup();

    sleepInBackground(20 * 60_000);

    expect(result.current.guard.paused).toBe(true);
    // 자리를 비운 20분 중 앞의 5분은 정상 운동 시간으로 인정한다.
    expect(result.current.snapshot.pausedAtMs).toBe(T0 + LIMIT_MS);
    expect(result.current.guard.totalPausedSeconds()).toBe(20 * 60 - 300);
  });

  it("never pauses a session it does not guard", () => {
    const { result } = setup({ guarded: false });

    sleepInBackground(60 * 60_000);

    expect(result.current.guard.paused).toBe(false);
    expect(result.current.snapshot.pausedAtMs).toBeNull();
  });

  it("never pauses before the workout starts", () => {
    const { result } = setup({ active: false });

    sleepInBackground(60 * 60_000);

    expect(result.current.guard.paused).toBe(false);
    expect(result.current.snapshot.lastActivityMs).toBeNull();
  });

  // 2026-08-01 개발 서버 확인에서 발견: 준비 중(운동 추가·세트 편집)의 동작이
  // 무동작 시계를 켜 버려서, 운동을 시작하자마자 정지되는 일이 있었다.
  it("ignores preparation activity so the clock starts with the workout", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useHarness({ active, guarded: true, lastRestEndsAtMs: null }),
      { initialProps: { active: false } },
    );

    // 준비 중 — 운동을 추가하고 세트를 만졌다.
    act(() => result.current.guard.markActivity());
    expect(result.current.snapshot.lastActivityMs).toBeNull();

    // 20초 뒤에 운동을 시작한다.
    act(() => vi.advanceTimersByTime(20_000));
    rerender({ active: true });

    expect(result.current.snapshot.lastActivityMs).toBe(T0 + 20_000);
    expect(result.current.guard.paused).toBe(false);

    act(() => vi.advanceTimersByTime(LIMIT_MS - 1_000));
    expect(result.current.guard.paused).toBe(false);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.guard.paused).toBe(true);
  });

  it("does not count the rest countdown as idle time", () => {
    // 휴식 10분 — 휴식이 도는 동안에는 무동작으로 잡지 않는다.
    const { result } = setup({ lastRestEndsAtMs: T0 + 600_000 });

    act(() => vi.advanceTimersByTime(600_000 + LIMIT_MS - 1_000));
    expect(result.current.guard.paused).toBe(false);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.guard.paused).toBe(true);
    expect(result.current.snapshot.pausedAtMs).toBe(T0 + 600_000 + LIMIT_MS);
  });

  it("restarts the idle clock on activity", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(200_000));
    act(() => result.current.guard.markActivity());

    expect(result.current.snapshot.lastActivityMs).toBe(T0 + 200_000);

    act(() => vi.advanceTimersByTime(LIMIT_MS - 1_000));
    expect(result.current.guard.paused).toBe(false);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.guard.paused).toBe(true);
  });

  it("accumulates the paused stretch when the user resumes", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(LIMIT_MS));
    expect(result.current.guard.paused).toBe(true);

    // 모달을 200초 동안 열어 뒀다.
    act(() => vi.advanceTimersByTime(200_000));
    act(() => result.current.guard.resumeFromPause());

    expect(result.current.guard.paused).toBe(false);
    expect(result.current.snapshot.pausedSeconds).toBe(200);
    expect(result.current.snapshot.lastActivityMs).toBe(T0 + LIMIT_MS + 200_000);
    expect(result.current.guard.totalPausedSeconds()).toBe(200);
  });

  it("adds up two separate paused stretches", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(LIMIT_MS));
    act(() => vi.advanceTimersByTime(100_000));
    act(() => result.current.guard.resumeFromPause());

    act(() => vi.advanceTimersByTime(LIMIT_MS));
    act(() => vi.advanceTimersByTime(50_000));

    expect(result.current.guard.paused).toBe(true);
    expect(result.current.guard.totalPausedSeconds()).toBe(150);
  });

  it("ignores activity while paused — only the modal can resume", () => {
    const { result } = setup();

    act(() => vi.advanceTimersByTime(LIMIT_MS));
    act(() => result.current.guard.markActivity());

    expect(result.current.guard.paused).toBe(true);
  });

  it("catches the timeout on return without waiting for a tick", () => {
    const { result } = setup();

    act(() => {
      vi.setSystemTime(T0 + 10 * 60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.guard.paused).toBe(true);
  });
});
