import type { RestCountdownBeep } from "@/lib/domain/rest-countdown";

const BEEP_FREQUENCY_HZ = 880;
const BEEP_GAIN = 0.06;
const FADE_IN_SECONDS = 0.01;
const SILENT_GAIN = 0.0001;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let restCountdownAudioContext: AudioContext | null = null;

function getRestCountdownAudioContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    if (restCountdownAudioContext) {
      if (restCountdownAudioContext.state !== "closed") {
        return restCountdownAudioContext;
      }

      restCountdownAudioContext = null;
    }

    const audioWindow = window as AudioContextWindow;
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    restCountdownAudioContext = new AudioContextConstructor();
    return restCountdownAudioContext;
  } catch {
    return null;
  }
}

function ignoreAudioError(): void {
  // Rest countdown audio is optional and must never interrupt the workout flow.
}

function resumeAudioContext(context: AudioContext): void {
  try {
    void context.resume().catch(ignoreAudioError);
  } catch {
    ignoreAudioError();
  }
}

function scheduleRestCountdownBeep(
  context: AudioContext,
  beep: RestCountdownBeep,
): void {
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startTime = context.currentTime;
    const endTime = startTime + beep.durationSeconds;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY_HZ, startTime);
    gain.gain.setValueAtTime(SILENT_GAIN, startTime);
    gain.gain.linearRampToValueAtTime(BEEP_GAIN, startTime + FADE_IN_SECONDS);
    gain.gain.linearRampToValueAtTime(SILENT_GAIN, endTime);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime);
  } catch {
    ignoreAudioError();
  }
}

export function prepareRestCountdownAudio(): void {
  try {
    const context = getRestCountdownAudioContext();

    if (context?.state === "suspended") {
      resumeAudioContext(context);
    }
  } catch {
    ignoreAudioError();
  }
}

export function playRestCountdownBeep(beep: RestCountdownBeep): void {
  try {
    const context = getRestCountdownAudioContext();

    if (!context || context.state === "closed") {
      return;
    }

    if (context.state === "running") {
      scheduleRestCountdownBeep(context, beep);
      return;
    }

    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => scheduleRestCountdownBeep(context, beep))
        .catch(ignoreAudioError);
    }
  } catch {
    ignoreAudioError();
  }
}
