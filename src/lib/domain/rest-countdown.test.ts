import { describe, expect, it } from "vitest";

import { getRestCountdownBeep } from "./rest-countdown";

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
