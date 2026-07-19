import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("rest countdown audio", () => {
  it("does not throw when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(() => playRestCountdownBeep({ durationSeconds: 0.12 })).not.toThrow();
  });

  it("does not throw when AudioContext construction fails", async () => {
    class ThrowingAudioContext {
      constructor() {
        throw new Error("Audio is unavailable");
      }
    }

    vi.stubGlobal("window", { AudioContext: ThrowingAudioContext });

    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(() => playRestCountdownBeep({ durationSeconds: 0.12 })).not.toThrow();
  });
});
