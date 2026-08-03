import { describe, expect, it } from "vitest";

import {
  adjustedRestEndsAtMs,
  nextRestSeconds,
  getRestCompletionCatchUpBeep,
  getRestCountdownBeep,
  getRestCountdownTogglePlan,
  shouldStartRestCountdown,
} from "./rest-countdown";

describe("getRestCountdownBeep", () => {
  it("returns a heads-up beep with ten seconds remaining", () => {
    expect(getRestCountdownBeep(10)).toEqual({ durationSeconds: 0.2 });
  });

  it.each([5, 4, 3, 2])(
    "returns a short beep with %i seconds remaining",
    (remainingSeconds) => {
      expect(getRestCountdownBeep(remainingSeconds)).toEqual({
        durationSeconds: 0.12,
      });
    },
  );

  it("returns a longer beep with one second remaining", () => {
    expect(getRestCountdownBeep(1)).toEqual({ durationSeconds: 0.35 });
  });

  it.each([null, 0, 6, 9, 11, 30])(
    "returns null outside the countdown range: %s",
    (remainingSeconds) => {
      expect(getRestCountdownBeep(remainingSeconds)).toBeNull();
    },
  );
});

describe("getRestCompletionCatchUpBeep", () => {
  it("plays a long beep when the final second was skipped in the background", () => {
    expect(getRestCompletionCatchUpBeep(false)).toEqual({
      durationSeconds: 0.35,
    });
  });

  it("stays silent when the final beep already played", () => {
    expect(getRestCompletionCatchUpBeep(true)).toBeNull();
  });
});

describe("shouldStartRestCountdown", () => {
  it.each([
    ["weight", true],
    ["bodyweight", true],
    ["cardio", false],
  ] as const)(
    "returns whether %s exercises use rest countdowns",
    (exerciseType, expected) => {
      expect(shouldStartRestCountdown(exerciseType)).toBe(expected);
    },
  );
});

describe("getRestCountdownTogglePlan", () => {
  it.each(["weight", "bodyweight"] as const)(
    "prepares and starts rest when completing a %s set",
    (exerciseType) => {
      expect(getRestCountdownTogglePlan(exerciseType, true)).toEqual({
        prepareAudio: true,
        timerAction: "start",
      });
    },
  );

  it.each(["weight", "bodyweight"] as const)(
    "cancels the matching rest when unchecking a %s set",
    (exerciseType) => {
      expect(getRestCountdownTogglePlan(exerciseType, false)).toEqual({
        prepareAudio: false,
        timerAction: "cancel",
      });
    },
  );

  it.each([true, false])(
    "keeps the existing rest unchanged when cardio done becomes %s",
    (willDone) => {
      expect(getRestCountdownTogglePlan("cardio", willDone)).toEqual({
        prepareAudio: false,
        timerAction: "keep",
      });
    },
  );
});

/**
 * ① 운동 중 휴식시간 수정 (2026-08-04).
 *
 * 기능은 원래 있었고 `disabled={active}`로 잠겨 있었다. 잠금을 풀면서 두 가지가
 * 필요해졌다 — 설정값의 증감 규칙과, **이미 돌고 있는 휴식**을 옮기는 규칙.
 */
describe("nextRestSeconds — 설정값 10초 증감", () => {
  it("10초 단위로 늘리고 줄인다", () => {
    expect(nextRestSeconds(90, 10)).toBe(100);
    expect(nextRestSeconds(90, -10)).toBe(80);
  });

  it("하한 10초 아래로는 안 내려간다", () => {
    expect(nextRestSeconds(10, -10)).toBe(10);
    expect(nextRestSeconds(15, -10)).toBe(10);
  });

  it("상한 600초 위로는 안 올라간다", () => {
    expect(nextRestSeconds(600, 10)).toBe(600);
    expect(nextRestSeconds(595, 10)).toBe(600);
  });
});

describe("adjustedRestEndsAtMs — 진행 중인 휴식 옮기기", () => {
  const now = 1_000_000;

  it("남은 시간을 delta만큼 늘린다", () => {
    // 60초 남은 휴식에 +10 → 70초 남음
    expect(
      adjustedRestEndsAtMs({ endsAtMs: now + 60_000, deltaSeconds: 10, nowMs: now }),
    ).toBe(now + 70_000);
  });

  it("남은 시간을 delta만큼 줄인다", () => {
    expect(
      adjustedRestEndsAtMs({ endsAtMs: now + 60_000, deltaSeconds: -10, nowMs: now }),
    ).toBe(now + 50_000);
  });

  it("줄여도 최소 1초는 남긴다 — 0으로 만들면 '줄였더니 갑자기 끝났다'가 된다", () => {
    expect(
      adjustedRestEndsAtMs({ endsAtMs: now + 5_000, deltaSeconds: -10, nowMs: now }),
    ).toBe(now + 1_000);
  });

  it("이미 1초 미만이어도 과거로 밀지 않는다", () => {
    expect(
      adjustedRestEndsAtMs({ endsAtMs: now + 500, deltaSeconds: -10, nowMs: now }),
    ).toBe(now + 1_000);
  });

  it("늘리는 쪽에는 상한을 두지 않는다 — 기존 +30초와 규칙을 맞춘다", () => {
    expect(
      adjustedRestEndsAtMs({ endsAtMs: now + 600_000, deltaSeconds: 10, nowMs: now }),
    ).toBe(now + 610_000);
  });
});
