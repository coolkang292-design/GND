import type { RestCountdownBeep } from "@/lib/domain/rest-countdown";

const BEEP_FREQUENCY_HZ = 880;
// 음악 재생 중에도 비프음이 묻히지 않도록 키운 음량.
// 0.06 → 0.25(2026-07-19) → 0.5(2026-07-21, 음악에 여전히 가려진다는 사용자 신고)
// → 1.0(2026-08-01, 사용자가 "2배로 키워달라" 요청).
// 사인파 단일 오실레이터라 1.0에서도 클리핑이 없다. 이보다 키우면 왜곡이 생긴다.
const BEEP_GAIN = 1.0;
const FADE_IN_SECONDS = 0.01;
const SILENT_GAIN = 0.0001;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    navigator?: Navigator & {
      audioSession?: {
        type:
          | "auto"
          | "playback"
          | "transient"
          | "transient-solo"
          | "ambient"
          | "play-and-record";
      };
    };
  };
type ResumableAudioContextState = AudioContextState | "interrupted";

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

function resumeAudioContext(
  context: AudioContext,
  onResumed?: () => void,
): void {
  try {
    void Promise.resolve(context.resume())
      .then(() => onResumed?.())
      .catch(ignoreAudioError);
  } catch {
    ignoreAudioError();
  }
}

function isResumableAudioContextState(
  state: ResumableAudioContextState,
): boolean {
  return state === "suspended" || state === "interrupted";
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

function declareTransientAudioSession(): void {
  try {
    if (typeof window === "undefined") {
      return;
    }

    // iOS는 기본적으로 무음 스위치가 Web Audio를 통째로 음소거한다.
    // 짧은 알림음 세션(transient, iOS 17+)은 무음 모드에서도 소리를 내면서
    // 재생 중인 다른 음악을 중단시키지 않는다("playback"은 음악을 끊는다).
    const audioSession = (window as AudioContextWindow).navigator?.audioSession;

    if (audioSession) {
      audioSession.type = "transient";
    }
  } catch {
    ignoreAudioError();
  }
}

export function prepareRestCountdownAudio(): void {
  try {
    declareTransientAudioSession();

    const context = getRestCountdownAudioContext();

    if (
      context &&
      isResumableAudioContextState(context.state as ResumableAudioContextState)
    ) {
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

    const state = context.state as ResumableAudioContextState;

    if (state === "running") {
      scheduleRestCountdownBeep(context, beep);
      return;
    }

    // iOS는 다른 앱으로 전환하면 컨텍스트를 interrupted로 만든다. 예전에는 여기서
    // resume만 하고 **이 비프를 버려서**, 앱으로 돌아온 뒤 5·4·3·2·1이 통째로
    // 사라졌다(2026-08-01 사용자 신고). 이제는 resume이 끝나면 그 비프를 낸다.
    if (isResumableAudioContextState(state)) {
      resumeAudioContext(context, () => {
        if (context.state === "running") {
          scheduleRestCountdownBeep(context, beep);
        }
      });
    }
  } catch {
    ignoreAudioError();
  }
}
