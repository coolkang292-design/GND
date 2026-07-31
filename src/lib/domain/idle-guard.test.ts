import { describe, expect, it } from "vitest";

import {
  IDLE_LIMIT_SECONDS,
  accumulatedPausedSeconds,
  activeElapsedSeconds,
  idleClockStartMs,
  idlePauseStartMs,
  isIdleTimedOut,
  shouldGuardIdle,
} from "./idle-guard";

const T0 = 1_754_000_000_000; // 고정 기준 시각 (Date.now를 쓰지 않는다)
const LIMIT_MS = IDLE_LIMIT_SECONDS * 1_000;

describe("shouldGuardIdle", () => {
  it("guards a pure weight session", () => {
    expect(
      shouldGuardIdle({ exerciseTypes: ["weight", "weight"], isTabata: false }),
    ).toBe(true);
  });

  it("guards a mixed session with one weight exercise among cardio", () => {
    expect(
      shouldGuardIdle({
        exerciseTypes: ["cardio", "cardio", "weight"],
        isTabata: false,
      }),
    ).toBe(true);
  });

  it("guards bodyweight sessions", () => {
    expect(
      shouldGuardIdle({ exerciseTypes: ["bodyweight"], isTabata: false }),
    ).toBe(true);
  });

  it("skips a cardio-only session", () => {
    expect(
      shouldGuardIdle({
        exerciseTypes: ["cardio", "cardio"],
        isTabata: false,
      }),
    ).toBe(false);
  });

  it("skips tabata even when it is made of weight exercises", () => {
    expect(
      shouldGuardIdle({ exerciseTypes: ["weight"], isTabata: true }),
    ).toBe(false);
  });

  it("skips an empty session", () => {
    expect(shouldGuardIdle({ exerciseTypes: [], isTabata: false })).toBe(false);
  });
});

describe("idleClockStartMs", () => {
  it("uses the last activity when no rest ran", () => {
    expect(idleClockStartMs(T0, null)).toBe(T0);
  });

  it("waits for the rest countdown to end before counting", () => {
    // 세트 체크(T0)로 90초 휴식이 시작됐다 — 무동작 시계는 휴식이 끝나야 흐른다.
    expect(idleClockStartMs(T0, T0 + 90_000)).toBe(T0 + 90_000);
  });

  it("ignores a rest that ended before the last activity", () => {
    expect(idleClockStartMs(T0 + 120_000, T0 + 90_000)).toBe(T0 + 120_000);
  });
});

describe("isIdleTimedOut", () => {
  it("does not fire one second before the limit", () => {
    expect(
      isIdleTimedOut({
        lastActivityMs: T0,
        lastRestEndsAtMs: null,
        nowMs: T0 + LIMIT_MS - 1_000,
      }),
    ).toBe(false);
  });

  it("fires exactly at the limit", () => {
    expect(
      isIdleTimedOut({
        lastActivityMs: T0,
        lastRestEndsAtMs: null,
        nowMs: T0 + LIMIT_MS,
      }),
    ).toBe(true);
  });

  it("does not fire while a long rest is still running", () => {
    // 휴식 10분 설정 — 휴식이 끝나기 전에는 무동작으로 잡지 않는다.
    expect(
      isIdleTimedOut({
        lastActivityMs: T0,
        lastRestEndsAtMs: T0 + 600_000,
        nowMs: T0 + 400_000,
      }),
    ).toBe(false);
  });

  it("fires five minutes after a long rest ended", () => {
    expect(
      isIdleTimedOut({
        lastActivityMs: T0,
        lastRestEndsAtMs: T0 + 600_000,
        nowMs: T0 + 600_000 + LIMIT_MS,
      }),
    ).toBe(true);
  });

  it("catches a twenty minute absence the moment the app returns", () => {
    expect(
      isIdleTimedOut({
        lastActivityMs: T0,
        lastRestEndsAtMs: null,
        nowMs: T0 + 20 * 60_000,
      }),
    ).toBe(true);
  });
});

describe("idlePauseStartMs", () => {
  it("starts the paused stretch five minutes after the idle clock", () => {
    expect(idlePauseStartMs(T0, T0 + 90_000)).toBe(T0 + 90_000 + LIMIT_MS);
  });
});

describe("accumulatedPausedSeconds", () => {
  it("returns the stored total when not paused", () => {
    expect(
      accumulatedPausedSeconds({
        pausedSeconds: 120,
        pausedAtMs: null,
        nowMs: T0,
      }),
    ).toBe(120);
  });

  it("adds the stretch that is still running", () => {
    expect(
      accumulatedPausedSeconds({
        pausedSeconds: 120,
        pausedAtMs: T0,
        nowMs: T0 + 45_000,
      }),
    ).toBe(165);
  });

  it("never goes backwards when the clock jumps", () => {
    expect(
      accumulatedPausedSeconds({
        pausedSeconds: 120,
        pausedAtMs: T0,
        nowMs: T0 - 5_000,
      }),
    ).toBe(120);
  });

  it("counts a twenty minute absence minus the five minute grace", () => {
    // 20분 자리를 비웠고 휴식 90초가 남아 있었다 → 정지 구간은 20분 - 90초 - 5분.
    const pauseStart = idlePauseStartMs(T0, T0 + 90_000);
    const returnedAt = T0 + 20 * 60_000;

    expect(
      accumulatedPausedSeconds({
        pausedSeconds: 0,
        pausedAtMs: pauseStart,
        nowMs: returnedAt,
      }),
    ).toBe(20 * 60 - 90 - IDLE_LIMIT_SECONDS);
  });
});

describe("activeElapsedSeconds", () => {
  it("subtracts the accumulated pause from the wall clock", () => {
    expect(
      activeElapsedSeconds({
        startedAtMs: T0,
        nowMs: T0 + 30 * 60_000,
        pausedSeconds: 600,
        pausedAtMs: null,
      }),
    ).toBe(30 * 60 - 600);
  });

  it("freezes at the moment the pause began", () => {
    const pausedAt = T0 + 10 * 60_000;

    expect(
      activeElapsedSeconds({
        startedAtMs: T0,
        nowMs: pausedAt + 60 * 60_000,
        pausedSeconds: 0,
        pausedAtMs: pausedAt,
      }),
    ).toBe(10 * 60);
  });

  it("never returns a negative elapsed time", () => {
    expect(
      activeElapsedSeconds({
        startedAtMs: T0,
        nowMs: T0 + 10_000,
        pausedSeconds: 999,
        pausedAtMs: null,
      }),
    ).toBe(0);
  });
});
