# Rest Countdown Beeps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 중 세트 사이 휴식이 3초, 2초, 1초 남았을 때 `짧게`, `짧게`, `길게` 비프음을 재생한다.

**Architecture:** 남은 초를 비프음 길이로 바꾸는 규칙은 순수 도메인 함수로 분리한다. 브라우저 오디오 모듈은 `AudioContext` 생성·재사용·오류 격리를 맡고, 기록 페이지는 세트 완료 클릭에서 오디오를 준비한 뒤 휴식 초가 바뀔 때 해당 모듈을 호출한다. 타이머, 저장 구조, 화면 UI는 변경하지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Web Audio API, Vitest

---

### Task 1: Define The Countdown Beep Pattern

**Files:**
- Create: `src/lib/domain/rest-countdown.ts`
- Create: `src/lib/domain/rest-countdown.test.ts`

- [ ] **Step 1: Write the failing pattern tests**

Create `src/lib/domain/rest-countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRestCountdownBeep } from "./rest-countdown";

describe("getRestCountdownBeep", () => {
  it.each([
    [3, { durationSeconds: 0.12 }],
    [2, { durationSeconds: 0.12 }],
    [1, { durationSeconds: 0.35 }],
  ] as const)("%i초에 정해진 비프음 길이를 반환한다", (seconds, expected) => {
    expect(getRestCountdownBeep(seconds)).toEqual(expected);
  });

  it.each([null, 0, 4, 10])("마지막 3초가 아니면 소리를 선택하지 않는다", (seconds) => {
    expect(getRestCountdownBeep(seconds)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm test -- src/lib/domain/rest-countdown.test.ts
```

Expected: FAIL because `src/lib/domain/rest-countdown.ts` does not exist.

- [ ] **Step 3: Implement the beep pattern**

Create `src/lib/domain/rest-countdown.ts`:

```ts
export type RestCountdownBeep = {
  durationSeconds: number;
};

const SHORT_BEEP_SECONDS = 0.12;
const LONG_BEEP_SECONDS = 0.35;

export function getRestCountdownBeep(
  remainingSeconds: number | null,
): RestCountdownBeep | null {
  if (remainingSeconds === 3 || remainingSeconds === 2) {
    return { durationSeconds: SHORT_BEEP_SECONDS };
  }
  if (remainingSeconds === 1) {
    return { durationSeconds: LONG_BEEP_SECONDS };
  }
  return null;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm test -- src/lib/domain/rest-countdown.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit the countdown rule**

```powershell
git add -- src/lib/domain/rest-countdown.ts src/lib/domain/rest-countdown.test.ts
git commit -m "feat: define rest countdown beep pattern"
```

---

### Task 2: Add A Safe Browser Beep Player

**Files:**
- Create: `src/lib/rest-countdown-audio.ts`
- Create: `src/lib/rest-countdown-audio.test.ts`
- Read: `src/lib/domain/rest-countdown.ts`

- [ ] **Step 1: Write failing audio-safety tests**

Create `src/lib/rest-countdown-audio.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("rest countdown audio", () => {
  it("브라우저가 아니어도 준비와 재생이 오류를 던지지 않는다", async () => {
    vi.stubGlobal("window", undefined);
    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(() => playRestCountdownBeep({ durationSeconds: 0.12 })).not.toThrow();
  });

  it("오디오 생성이 실패해도 운동 흐름으로 오류를 전파하지 않는다", async () => {
    class BrokenAudioContext {
      constructor() {
        throw new Error("audio blocked");
      }
    }
    vi.stubGlobal("window", { AudioContext: BrokenAudioContext });
    const { playRestCountdownBeep, prepareRestCountdownAudio } = await import(
      "./rest-countdown-audio"
    );

    expect(() => prepareRestCountdownAudio()).not.toThrow();
    expect(() => playRestCountdownBeep({ durationSeconds: 0.35 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm test -- src/lib/rest-countdown-audio.test.ts
```

Expected: FAIL because `src/lib/rest-countdown-audio.ts` does not exist.

- [ ] **Step 3: Implement the browser audio module**

Create `src/lib/rest-countdown-audio.ts`:

```ts
import type { RestCountdownBeep } from "@/lib/domain/rest-countdown";

type AudioContextConstructor = new () => AudioContext;
type AudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

const BEEP_FREQUENCY_HZ = 880;
const BEEP_GAIN = 0.06;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext?.state === "closed") audioContext = null;
  if (audioContext) return audioContext;

  const AudioContextClass =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext = new AudioContextClass();
  return audioContext;
}

function scheduleBeep(
  context: AudioContext,
  beep: RestCountdownBeep,
): void {
  const startAt = context.currentTime;
  const endAt = startAt + beep.durationSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(BEEP_FREQUENCY_HZ, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(BEEP_GAIN, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

export function prepareRestCountdownAudio(): void {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  } catch {
    // 소리는 보조 기능이므로 실패해도 운동 기록 흐름을 막지 않는다.
  }
}

export function playRestCountdownBeep(beep: RestCountdownBeep): void {
  try {
    const context = getAudioContext();
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => scheduleBeep(context, beep))
        .catch(() => undefined);
      return;
    }
    scheduleBeep(context, beep);
  } catch {
    // 오디오 API 오류는 타이머와 세트 저장에 영향을 주지 않는다.
  }
}
```

- [ ] **Step 4: Run audio and domain tests**

Run:

```powershell
pnpm test -- src/lib/rest-countdown-audio.test.ts src/lib/domain/rest-countdown.test.ts
```

Expected: 2 test files and 9 tests pass.

- [ ] **Step 5: Commit the audio module**

```powershell
git add -- src/lib/rest-countdown-audio.ts src/lib/rest-countdown-audio.test.ts
git commit -m "feat: add safe rest countdown beep player"
```

---

### Task 3: Connect Beeps To The Active Rest Timer

**Files:**
- Modify: `src/app/(tabs)/record/page.tsx:14-22`
- Modify: `src/app/(tabs)/record/page.tsx:204-216`
- Modify: `src/app/(tabs)/record/page.tsx:361-370`

- [ ] **Step 1: Import the countdown rule and audio functions**

Add these imports to `src/app/(tabs)/record/page.tsx`:

```ts
import { getRestCountdownBeep } from "@/lib/domain/rest-countdown";
import {
  playRestCountdownBeep,
  prepareRestCountdownAudio,
} from "@/lib/rest-countdown-audio";
```

- [ ] **Step 2: Prepare audio from the set-complete user action**

Update the successful completion path in `toggleDone`:

```ts
const willDone = !ex?.sets[si]?.done;
if (willDone) prepareRestCountdownAudio();
updateSet(exKey, si, { done: willDone });
if (willDone) setRestRemaining(draft.restSeconds);
```

This call must remain inside the button-triggered handler so mobile browsers can unlock audio from a direct user action.

- [ ] **Step 3: Play one beep when the remaining second changes**

Add a separate effect immediately after the existing rest countdown effect:

```ts
useEffect(() => {
  if (!active) return;
  const beep = getRestCountdownBeep(restRemaining);
  if (beep) playRestCountdownBeep(beep);
}, [active, restRemaining]);
```

The effect does not change timer state. Skipping or ending rest sets `restRemaining` to `null`, so no later beep is selected.

- [ ] **Step 4: Run focused and full static verification**

Run:

```powershell
pnpm test -- src/lib/rest-countdown-audio.test.ts src/lib/domain/rest-countdown.test.ts
pnpm typecheck
pnpm lint
```

Expected: focused tests and typecheck pass; lint has zero errors. Record the existing `scripts/briefing-integration-test.mjs:23` warning separately if it remains.

- [ ] **Step 5: Commit the page integration**

```powershell
git add -- "src/app/(tabs)/record/page.tsx"
git commit -m "feat: play beeps before rest ends"
```

---

### Task 4: Verify The Complete Countdown Flow

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-rest-countdown-beeps.md`

- [ ] **Step 1: Run all automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all tests, typecheck, and build pass; lint has zero errors. Keep unrelated existing warnings visible in the completion report.

- [ ] **Step 2: Verify the visual timer on mobile width**

Open `http://localhost:3000/record` at 390×844, start a test workout with a 10-second rest, complete one set, and confirm the rest bar counts down without horizontal overflow. Skip or cancel the test workout afterward so no test session remains active.

- [ ] **Step 3: Verify the audible pattern with the user**

On the user's phone with earphones connected:

1. Set rest to 10 seconds before starting the workout.
2. Start the workout and complete one set.
3. Confirm 3 seconds and 2 seconds produce short `삠` sounds.
4. Confirm 1 second produces a longer `삐임` sound.
5. Confirm there is no spoken narration.
6. Press `건너뛰기` on another rest and confirm no later beep plays.

Expected: `짧게`, `짧게`, `길게` only. This audible check cannot be proven by automated browser tests and must be reported as unverified until the user confirms it on the phone.

- [ ] **Step 4: Mark this plan complete and commit verification state**

Change completed checklist entries in this file from `[ ]` to `[x]`, then run:

```powershell
git add -- docs/superpowers/plans/2026-07-19-rest-countdown-beeps.md
git commit -m "docs: record rest countdown beep verification"
```

Do not deploy. Production deployment requires separate explicit user approval.
