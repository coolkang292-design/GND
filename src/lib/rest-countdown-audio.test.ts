import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("rest countdown audio", () => {
  it("creates the first audio context and plays a beep while it is running", async () => {
    const oscillator = {
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    class FakeAudioContext {
      static instances: FakeAudioContext[] = [];

      state: AudioContextState = "running";
      currentTime = 10;
      destination = {};
      createOscillator = vi.fn(() => oscillator);
      createGain = vi.fn(() => gain);
      resume = vi.fn(() => Promise.resolve());

      constructor() {
        FakeAudioContext.instances.push(this);
      }
    }

    vi.stubGlobal("window", { AudioContext: FakeAudioContext });

    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    prepareRestCountdownAudio();

    expect(FakeAudioContext.instances).toHaveLength(1);

    playRestCountdownBeep({ durationSeconds: 0.12 });

    expect(oscillator.start).toHaveBeenCalledWith(10);
    expect(oscillator.stop).toHaveBeenCalledWith(10.12);
  });

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
