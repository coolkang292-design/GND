import { describe, expect, it } from "vitest";

import {
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
