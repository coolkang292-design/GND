import { afterEach, describe, expect, it, vi } from "vitest";

type TestAudioContextState = AudioContextState | "interrupted";

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
    const destination = {};

    class FakeAudioContext {
      static instances: FakeAudioContext[] = [];

      state: AudioContextState = "running";
      currentTime = 10;
      destination = destination;
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
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 10);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      1,
      10.01,
    );
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      2,
      0.0001,
      10.12,
    );
    expect(oscillator.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(destination);
  });

  it.each(["suspended", "interrupted"] as const)(
    "resumes %s audio during preparation",
    async (state) => {
      class FakeAudioContext {
        static instances: FakeAudioContext[] = [];

        state: TestAudioContextState = state;
        resume = vi.fn(() => Promise.resolve());

        constructor() {
          FakeAudioContext.instances.push(this);
        }
      }

      vi.stubGlobal("window", { AudioContext: FakeAudioContext });

      const { prepareRestCountdownAudio } = await import("./rest-countdown-audio");

      prepareRestCountdownAudio();

      expect(FakeAudioContext.instances).toHaveLength(1);
      expect(FakeAudioContext.instances[0]?.resume).toHaveBeenCalledOnce();
    },
  );

  // 2026-08-01: 예전에는 이 비프를 버렸다. 다른 앱을 쓰다 GND로 돌아오면 iOS가
  // 컨텍스트를 interrupted로 만들어 두기 때문에, 돌아온 뒤 비프가 통째로 사라졌다.
  it.each(["suspended", "interrupted"] as const)(
    "schedules the %s beep once the context has resumed",
    async (state) => {
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

        state: TestAudioContextState = state;
        currentTime = 10;
        destination = {};
        createOscillator = vi.fn(() => oscillator);
        createGain = vi.fn(() => gain);
        // 진짜 resume은 성공하면 state를 running으로 바꾼다.
        resume = vi.fn(() => {
          this.state = "running";
          return Promise.resolve();
        });

        constructor() {
          FakeAudioContext.instances.push(this);
        }
      }

      vi.stubGlobal("window", { AudioContext: FakeAudioContext });

      const { playRestCountdownBeep } = await import("./rest-countdown-audio");

      playRestCountdownBeep({ durationSeconds: 0.12 });

      expect(FakeAudioContext.instances[0]?.resume).toHaveBeenCalledOnce();
      expect(oscillator.start).not.toHaveBeenCalled();

      await Promise.resolve();
      await Promise.resolve();

      expect(oscillator.start).toHaveBeenCalledOnce();
      expect(oscillator.start).toHaveBeenCalledWith(10);
      expect(oscillator.stop).toHaveBeenCalledWith(10.12);
    },
  );

  it("drops the beep when the context never resumes", async () => {
    const oscillator = {
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    class StuckAudioContext {
      state: TestAudioContextState = "interrupted";
      currentTime = 10;
      destination = {};
      createOscillator = vi.fn(() => oscillator);
      createGain = vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }));
      resume = vi.fn(() => Promise.resolve());
    }

    vi.stubGlobal("window", { AudioContext: StuckAudioContext });

    const { playRestCountdownBeep } = await import("./rest-countdown-audio");

    playRestCountdownBeep({ durationSeconds: 0.12 });
    await Promise.resolve();
    await Promise.resolve();

    expect(oscillator.start).not.toHaveBeenCalled();
  });

  it("declares a transient audio session during preparation when supported", async () => {
    class FakeAudioContext {
      state: AudioContextState = "running";
      resume = vi.fn(() => Promise.resolve());
    }

    const audioSession = { type: "auto" };

    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      navigator: { audioSession },
    });

    const { prepareRestCountdownAudio } = await import("./rest-countdown-audio");

    prepareRestCountdownAudio();

    expect(audioSession.type).toBe("transient");
  });

  it("still prepares audio when setting the audio session type fails", async () => {
    class FakeAudioContext {
      static instances: FakeAudioContext[] = [];

      state: AudioContextState = "running";
      resume = vi.fn(() => Promise.resolve());

      constructor() {
        FakeAudioContext.instances.push(this);
      }
    }

    const audioSession = {};
    Object.defineProperty(audioSession, "type", {
      get: () => "auto",
      set: () => {
        throw new Error("Audio session is locked");
      },
    });

    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      navigator: { audioSession },
    });

    const { prepareRestCountdownAudio } = await import("./rest-countdown-audio");

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("does not throw when audio resume is rejected", async () => {
    class RejectingAudioContext {
      state: AudioContextState = "suspended";
      resume = vi.fn(() => Promise.reject(new Error("Audio resume failed")));
    }

    vi.stubGlobal("window", { AudioContext: RejectingAudioContext });

    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(() => playRestCountdownBeep({ durationSeconds: 0.12 })).not.toThrow();
    await Promise.resolve();
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
