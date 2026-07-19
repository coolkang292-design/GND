import { describe, expect, it } from "vitest";

import {
  getRestCountdownBeep,
  getRestCountdownTogglePlan,
  shouldStartRestCountdown,
} from "./rest-countdown";

describe("getRestCountdownBeep", () => {
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

  it.each([null, 0, 6, 10])(
    "returns null outside the countdown range: %s",
    (remainingSeconds) => {
      expect(getRestCountdownBeep(remainingSeconds)).toBeNull();
    },
  );
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
