import { describe, expect, it } from "vitest";

import {
  getRestCountdownBeep,
  shouldStartRestCountdown,
} from "./rest-countdown";

describe("getRestCountdownBeep", () => {
  it("returns a short beep with three seconds remaining", () => {
    expect(getRestCountdownBeep(3)).toEqual({ durationSeconds: 0.12 });
  });

  it("returns a short beep with two seconds remaining", () => {
    expect(getRestCountdownBeep(2)).toEqual({ durationSeconds: 0.12 });
  });

  it("returns a longer beep with one second remaining", () => {
    expect(getRestCountdownBeep(1)).toEqual({ durationSeconds: 0.35 });
  });

  it.each([null, 0, 4, 10])("returns null outside the countdown range: %s", (remainingSeconds) => {
    expect(getRestCountdownBeep(remainingSeconds)).toBeNull();
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
