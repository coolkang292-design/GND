# GND Launch Motivation Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 GND 실행 세션마다 블랙·골드 배틀로프 대표 이미지와 “오늘 1도를 틀면, 1년뒤 도착지가 바뀐다” 문구를 1.5초간 한 번 보여주고, 터치하면 즉시 건너뛰게 한다.

**Architecture:** 일반 탭 레이아웃에 클라이언트 오버레이 하나를 마운트하고, 실행 세션 중복 방지는 `sessionStorage`와 메모리 폴백을 함께 쓰는 작은 도메인 게이트가 맡는다. 이미지·타이머·오류·접근성 상태는 `LaunchMotivationSplash` 내부에만 두며 DB, 인증, 서비스 워커에는 손대지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Next Image, Vitest 4, Testing Library, ImageGen

---

## 실행 전제

- 설계 원문: `docs/superpowers/specs/2026-08-17-gnd-launch-motivation-splash-design.md`
- 현재 기본 작업 폴더에는 사용자 소유의 추적되지 않은 파일이 많다. 실행 시작 시
  `superpowers:using-git-worktrees`를 사용해 `main`의 격리된 worktree를 만든다.
- 이미지·테스트·코드·문서는 아래에서 명시한 파일만 스테이징한다. `git add .`는
  사용하지 않는다.
- 배포는 이 계획의 범위가 아니다. 개발 서버 실화면 확인과 전체 검증을 마친 뒤
  별도로 사용자 승인을 받아야 한다.
- **이미지 승인 관문:** 아래 Task 0에서 실제 시안을 생성해 사용자에게 보여주고
  명시적으로 승인받기 전에는 Task 1 이하의 코드·앱 자산을 수정하지 않는다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `public/splash/gnd-launch-motivation.png` | GND와 승인 문구가 포함된 9:16 블랙·골드 배틀로프 완성 이미지 |
| `src/lib/domain/launch-splash.ts` | 세션 키와 저장소/메모리 기반 1회 노출 게이트 |
| `src/lib/domain/launch-splash.test.ts` | 저장 성공·기존 키·저장소 오류·메모리 폴백 단위 테스트 |
| `src/components/launch-motivation-splash.tsx` | 이미지 준비, 문구, 타이머, 터치 종료, 오류·접근성 UI |
| `src/components/launch-motivation-splash.test.tsx` | 이미지·시간·터치·오류·reduced-motion 컴포넌트 테스트 |
| `src/app/(tabs)/layout.tsx` | 일반 탭 화면에서 스플래시를 한 번 마운트 |
| `src/app/(tabs)/layout.test.tsx` | 탭 셸에 스플래시가 정확히 한 번 연결됐는지 확인 |
| `PROGRESS.md` | 구현·화면 확인·검증·미검증·다음 할 일 기록 |

---

### Task 0: 앱을 건드리기 전에 대표 이미지 시안을 생성하고 승인받는다

**Files:**
- No app file changes before approval

- [x] **Step 1: ImageGen 스킬로 시안을 생성한다**

실행 시 `imagegen` 스킬을 먼저 읽고 다음 프롬프트를 사용한다. 이 단계의 결과는
대화에 시안으로만 표시하며 아직 `public/`에 넣지 않는다.

```text
Create an original vertical 9:16 cinematic fitness campaign photograph for a Korean workout app called GND. Nighttime outdoor training immediately after heavy rain. A visibly adult athletic woman and adult athletic man stand side by side, each powerfully whipping battle ropes toward the foreground. Wet black asphalt reflects restrained warm gold rim lighting. Cold rain droplets remain in the air while visible steam rises naturally from their shoulders and muscular bodies. Their faces must be obscured by deep backlit shadow so no person is recognizable, while their strong athletic physiques and explosive motion remain clear. Premium black-and-gold color grade, deep charcoal clothing, high contrast, realistic anatomy, realistic rope physics, low camera angle, intense forward energy, generous clean dark space at the top center for a GND wordmark and at the bottom for two lines of Korean copy. No text, no letters, no numbers, no logos, no Netflix marks, no Physical 100 marks, no celebrity likeness, no crowd, no extra limbs, no sexualized posing.
```

- [x] **Step 2: 생성 결과를 직접 검수해 명백한 실패 시안은 먼저 거른다**

로컬 이미지 보기 도구로 생성 결과를 열고 다음을 확인한다.

- 성인 남녀 두 명, 각자 배틀로프를 잡은 장면인가
- 얼굴은 식별되지 않고 몸과 동작은 선명한가
- 젖은 검은 바닥, 수증기, 비말, 절제된 골드 조명이 보이는가
- 상단 GND와 하단 두 줄 문구를 얹을 어두운 여백이 있는가
- 글자·타 브랜드·유명인·추가 팔다리·뒤틀린 로프가 없는가

명백한 실패가 있으면 그 실패만 구체적으로 적어 다시 생성하고 다시 검수한다.

- [x] **Step 3: 실제 시안을 사용자에게 보여주고 명시적 승인을 기다린다**

생성된 이미지를 대화에 렌더링하고 다음 한 가지를 요청한다.

```text
이 이미지를 GND 시작 화면의 대표 이미지로 적용해도 될까요?
```

Expected: 사용자가 이미지를 실제로 본 뒤 승인하거나 수정 요청을 남김.

**최종 승인 결과:** 사용자가 2026-08-17에 카피를 변경한
`exec-fde32003-f522-4671-b4de-8234e2e45478.png`를 최종 승인했다. 이 승인본에는
`GND`와 `오늘 1도를 틀면, 1년뒤 도착지가 바뀐다` 문구까지 완성되어 있으므로
앱에서 보이는 HTML 문구를 중복해서 얹지 않는다.

---

### Task 1: 실행 세션 1회 노출 게이트를 TDD로 만든다

**Files:**
- Create: `src/lib/domain/launch-splash.ts`
- Create: `src/lib/domain/launch-splash.test.ts`

- [ ] **Step 1: 실패하는 단위 테스트를 작성한다**

`src/lib/domain/launch-splash.test.ts`를 다음 내용으로 만든다.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  LAUNCH_SPLASH_STORAGE_KEY,
  createLaunchSplashGate,
  type LaunchSplashStorage,
} from "./launch-splash";

function memoryStorage(initial?: Record<string, string>): LaunchSplashStorage {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("launch splash session gate", () => {
  it("새 실행 세션을 한 번만 claim하고 세션 키를 기록한다", () => {
    const storage = memoryStorage();
    const gate = createLaunchSplashGate();

    expect(gate.claim(storage)).toBe(true);
    expect(gate.claim(storage)).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      LAUNCH_SPLASH_STORAGE_KEY,
      "1",
    );
  });

  it("다른 컴포넌트 인스턴스여도 같은 세션 키가 있으면 건너뛴다", () => {
    const storage = memoryStorage({ [LAUNCH_SPLASH_STORAGE_KEY]: "1" });

    expect(createLaunchSplashGate().claim(storage)).toBe(false);
  });

  it("세션 키가 사라진 새 실행에서는 다시 표시한다", () => {
    const firstSession = memoryStorage();
    const secondSession = memoryStorage();

    expect(createLaunchSplashGate().claim(firstSession)).toBe(true);
    expect(createLaunchSplashGate().claim(secondSession)).toBe(true);
  });

  it("저장소가 예외를 내도 현재 실행의 메모리 플래그로 한 번만 표시한다", () => {
    const brokenStorage: LaunchSplashStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(),
    };
    const gate = createLaunchSplashGate();

    expect(gate.claim(brokenStorage)).toBe(true);
    expect(gate.claim(brokenStorage)).toBe(false);
  });

  it("저장소 자체를 얻지 못해도 현재 실행에서는 한 번만 표시한다", () => {
    const gate = createLaunchSplashGate();

    expect(gate.claim(null)).toBe(true);
    expect(gate.claim(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 올바른 이유로 실패하는지 확인한다**

Run:

```powershell
pnpm exec vitest run src/lib/domain/launch-splash.test.ts
```

Expected: FAIL — `./launch-splash` 모듈이 없다는 오류.

- [ ] **Step 3: 최소 도메인 구현을 작성한다**

`src/lib/domain/launch-splash.ts`를 다음 내용으로 만든다.

```ts
export const LAUNCH_SPLASH_STORAGE_KEY = "gnd:launch-splash:shown";

export type LaunchSplashStorage = Pick<Storage, "getItem" | "setItem">;

export type LaunchSplashGate = {
  claim(storage: LaunchSplashStorage | null): boolean;
};

export function createLaunchSplashGate(): LaunchSplashGate {
  let claimedInMemory = false;

  return {
    claim(storage) {
      if (claimedInMemory) return false;

      if (storage) {
        try {
          if (storage.getItem(LAUNCH_SPLASH_STORAGE_KEY) === "1") {
            claimedInMemory = true;
            return false;
          }
          storage.setItem(LAUNCH_SPLASH_STORAGE_KEY, "1");
        } catch {
          // 저장소가 막혀도 현재 JS 실행의 메모리 플래그로 중복을 막는다.
        }
      }

      claimedInMemory = true;
      return true;
    },
  };
}

export const launchSplashGate = createLaunchSplashGate();
```

- [ ] **Step 4: 단위 테스트를 다시 실행한다**

Run:

```powershell
pnpm exec vitest run src/lib/domain/launch-splash.test.ts
```

Expected: `5 passed`, `0 failed`.

- [ ] **Step 5: 도메인 로직만 커밋한다**

```powershell
git add -- src/lib/domain/launch-splash.ts src/lib/domain/launch-splash.test.ts
git diff --cached --check
git commit -m "feat: 실행 세션 스플래시 게이트 추가"
```

Expected: 위 두 파일만 포함된 커밋 1개.

---

### Task 2: 승인된 대표 이미지만 앱 자산으로 확정한다

**Files:**
- Create: `public/splash/gnd-launch-motivation.png`

- [ ] **Step 1: 승인된 PNG를 바이트 변경 없이 앱 자산으로 복사한다**

승인 원본
`C:\Users\SAMSUNG\.codex\generated_images\01a00e30-700a-7db3-8985-3271be4850fd\exec-fde32003-f522-4671-b4de-8234e2e45478.png`를
`public/splash/gnd-launch-motivation.png`로 복사한다. 승인되지 않은 후보를 고르거나
재생성·재압축·재편집하지 않는다. Next Image가 기기별 전송 크기를 최적화하게 한다.

- [ ] **Step 2: 생성 이미지를 직접 본다**

Run: 로컬 이미지 보기 도구로 아래 파일을 연다.

```text
C:\Users\SAMSUNG\workout-app\.worktrees\gnd-launch-splash\public\splash\gnd-launch-motivation.png
```

Expected:

- 성인 남녀가 각각 배틀로프를 잡고 나란히 운동한다.
- 얼굴은 식별되지 않지만 신체·동작은 선명하다.
- 젖은 검은 바닥, 수증기, 비말, 골드 윤곽과 반사가 보인다.
- 상단 `GND`와 하단 `오늘 1도를 틀면, 1년뒤 도착지가 바뀐다`가 승인본 그대로 보인다.
- 승인 문구 외 다른 브랜드 표식·의도하지 않은 글자·해부학 오류가 없다.

하나라도 어긋나면 같은 프롬프트에서 실패 요소만 명시해 다시 생성하고 다시 본다.

- [ ] **Step 3: 원본과 앱 자산의 무결성을 확인한다**

Run:

```powershell
$source = Get-FileHash 'C:\Users\SAMSUNG\.codex\generated_images\01a00e30-700a-7db3-8985-3271be4850fd\exec-fde32003-f522-4671-b4de-8234e2e45478.png' -Algorithm SHA256
$asset = Get-FileHash 'public\splash\gnd-launch-motivation.png' -Algorithm SHA256
$source.Hash
$asset.Hash
```

Expected: 두 SHA256 값이 정확히 같다.

- [ ] **Step 4: 검수한 자산만 커밋한다**

```powershell
git add -- public/splash/gnd-launch-motivation.png
git diff --cached --check
git commit -m "feat: GND 실행 동기부여 이미지 추가"
```

Expected: 대표 이미지 한 파일만 포함된 커밋 1개.

---

### Task 3: 스플래시 화면의 실패 테스트를 먼저 작성한다

**Files:**
- Create: `src/components/launch-motivation-splash.test.tsx`

- [ ] **Step 1: 컴포넌트 테스트를 작성한다**

`src/components/launch-motivation-splash.test.tsx`를 다음 내용으로 만든다.

```tsx
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchSplashGate } from "@/lib/domain/launch-splash";
import { LaunchMotivationSplash } from "./launch-motivation-splash";

vi.mock("next/image", () => ({
  default: (
    props: ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
    },
  ) => {
    const { fill, priority, ...imageProps } = props;
    void fill;
    void priority;
    return <img {...imageProps} />;
  },
}));

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function settleSessionDecision() {
  act(() => vi.advanceTimersByTime(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReducedMotion(false);
  vi.spyOn(launchSplashGate, "claim").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LaunchMotivationSplash", () => {
  it("새 실행이면 승인 이미지와 화면 밖 브랜드 문구를 준비한다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    expect(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeTruthy();
    expect(screen.getByTestId("launch-splash-image").getAttribute("src")).toBe(
      "/splash/gnd-launch-motivation.png",
    );
    expect(
      screen.getByText("GND. 오늘 1도를 틀면, 1년뒤 도착지가 바뀐다").className,
    ).toContain("sr-only");
  });

  it("이미 본 실행 세션이면 덮개를 즉시 없앤다", () => {
    vi.mocked(launchSplashGate.claim).mockReturnValue(false);
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지가 준비된 뒤 1.5초를 채우고 180ms 페이드 후 사라진다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    act(() => vi.advanceTimersByTime(1_499));
    expect(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }).className,
    ).toContain("opacity-0");

    act(() => vi.advanceTimersByTime(180));
    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("사용자가 터치하면 기다리지 않고 사라진다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    fireEvent.click(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    );
    act(() => vi.advanceTimersByTime(180));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지 실패 시 검은 GND 대체 화면을 보여주고 자동 종료한다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.error(screen.getByTestId("launch-splash-image"));

    expect(screen.getByText("GND")).toBeTruthy();
    expect(screen.getByText("오늘 1도를 틀면,")).toBeTruthy();
    expect(screen.getByText("1년뒤 도착지가 바뀐다")).toBeTruthy();
    expect(screen.getByTestId("launch-splash-copy").className).toContain(
      "opacity-100",
    );
    act(() => vi.advanceTimersByTime(1_680));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("이미지 상태가 오지 않아도 3초 뒤 앱 진입을 풀어준다", () => {
    render(<LaunchMotivationSplash />);
    settleSessionDecision();

    act(() => vi.advanceTimersByTime(3_000));

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });

  it("reduced motion에서는 터치 즉시 페이드 없이 사라진다", () => {
    mockReducedMotion(true);
    render(<LaunchMotivationSplash />);
    settleSessionDecision();
    fireEvent.load(screen.getByTestId("launch-splash-image"));

    fireEvent.click(
      screen.getByRole("button", { name: "시작 화면 건너뛰기" }),
    );

    expect(
      screen.queryByRole("button", { name: "시작 화면 건너뛰기" }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 컴포넌트가 없어서 실패하는지 확인한다**

Run:

```powershell
pnpm exec vitest run src/components/launch-motivation-splash.test.tsx
```

Expected: FAIL — `./launch-motivation-splash` 모듈이 없다는 오류.

---

### Task 4: 스플래시 컴포넌트를 최소 구현하고 테스트를 통과시킨다

**Files:**
- Create: `src/components/launch-motivation-splash.tsx`
- Test: `src/components/launch-motivation-splash.test.tsx`

- [ ] **Step 1: 타이머·오류·접근성을 포함한 컴포넌트를 작성한다**

`src/components/launch-motivation-splash.tsx`를 다음 내용으로 만든다.

```tsx
"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  launchSplashGate,
  type LaunchSplashStorage,
} from "@/lib/domain/launch-splash";

const DISPLAY_MS = 1_500;
const FADE_MS = 180;
const MAX_BLOCK_MS = 3_000;

type Phase =
  | "checking"
  | "loading"
  | "showing"
  | "fallback"
  | "fading"
  | "hidden";

export function LaunchMotivationSplash() {
  const [phase, setPhase] = useState<Phase>("checking");
  const decisionTimer = useRef<number | null>(null);
  const displayTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const dismissing = useRef(false);

  const clearTimers = useCallback(() => {
    for (const timer of [
      decisionTimer,
      displayTimer,
      fadeTimer,
      safetyTimer,
    ]) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;

    if (displayTimer.current !== null) {
      window.clearTimeout(displayTimer.current);
      displayTimer.current = null;
    }
    if (safetyTimer.current !== null) {
      window.clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }

    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion) {
      setPhase("hidden");
      return;
    }

    setPhase("fading");
    fadeTimer.current = window.setTimeout(() => setPhase("hidden"), FADE_MS);
  }, []);

  useEffect(() => {
    decisionTimer.current = window.setTimeout(() => {
      let storage: LaunchSplashStorage | null = null;
      try {
        storage = window.sessionStorage;
      } catch {
        storage = null;
      }

      if (!launchSplashGate.claim(storage)) {
        setPhase("hidden");
        return;
      }

      setPhase("loading");
      safetyTimer.current = window.setTimeout(() => {
        dismissing.current = true;
        setPhase("hidden");
      }, MAX_BLOCK_MS);
    }, 0);

    return clearTimers;
  }, [clearTimers]);

  function startDisplay(nextPhase: "showing" | "fallback") {
    if (dismissing.current) return;
    setPhase(nextPhase);
    displayTimer.current = window.setTimeout(dismiss, DISPLAY_MS);
  }

  if (phase === "hidden") return null;

  const imageVisible = phase === "showing" || phase === "fading";

  return (
    <button
      type="button"
      aria-label="시작 화면 건너뛰기"
      aria-describedby="launch-splash-description"
      onClick={dismiss}
      className={`absolute inset-0 z-[100] overflow-hidden bg-bg p-0 text-left transition-opacity duration-200 motion-reduce:transition-none ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      {phase !== "checking" && (
        <Image
          data-testid="launch-splash-image"
          src="/splash/gnd-launch-motivation.png"
          alt=""
          fill
          priority
          sizes="(max-width: 430px) 100vw, 430px"
          onLoad={() => startDisplay("showing")}
          onError={() => startDisplay("fallback")}
          className={`object-contain object-center transition-opacity duration-200 ${
            imageVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      <span id="launch-splash-description" className="sr-only">
        GND. 오늘 1도를 틀면, 1년뒤 도착지가 바뀐다
      </span>

      {phase === "fallback" && (
        <span
          data-testid="launch-splash-copy"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 opacity-100"
        >
          <span className="text-4xl font-black tracking-[0.28em] text-accent">
            GND
          </span>
          <span className="text-center text-3xl font-black leading-tight text-text">
            <span className="block">오늘 1도를 틀면,</span>
            <span className="block text-accent">1년뒤 도착지가 바뀐다</span>
          </span>
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: 컴포넌트 테스트를 실행한다**

Run:

```powershell
pnpm exec vitest run src/components/launch-motivation-splash.test.tsx
```

Expected: `7 passed`, `0 failed`.

- [ ] **Step 3: 도메인 테스트와 함께 회귀 확인한다**

Run:

```powershell
pnpm exec vitest run src/lib/domain/launch-splash.test.ts src/components/launch-motivation-splash.test.tsx
```

Expected: `12 passed`, `0 failed`.

- [ ] **Step 4: 컴포넌트와 테스트를 커밋한다**

```powershell
git add -- src/components/launch-motivation-splash.tsx src/components/launch-motivation-splash.test.tsx
git diff --cached --check
git commit -m "feat: 실행 동기부여 스플래시 구현"
```

Expected: 컴포넌트와 해당 테스트만 포함된 커밋 1개.

---

### Task 5: 일반 탭 레이아웃에 정확히 한 번 연결한다

**Files:**
- Modify: `src/app/(tabs)/layout.tsx:1-16`
- Create: `src/app/(tabs)/layout.test.tsx`

- [ ] **Step 1: 실패하는 레이아웃 연결 테스트를 작성한다**

`src/app/(tabs)/layout.test.tsx`를 다음 내용으로 만든다.

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabsLayout from "./layout";

vi.mock("@/components/launch-motivation-splash", () => ({
  LaunchMotivationSplash: () => <div data-testid="launch-splash" />,
}));
vi.mock("@/components/onboarding-gate", () => ({
  OnboardingGate: () => <div data-testid="onboarding-gate" />,
}));
vi.mock("@/components/cheer-banner", () => ({
  CheerBanner: () => <div data-testid="cheer-banner" />,
}));
vi.mock("@/components/tab-bar", () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}));

afterEach(cleanup);

describe("TabsLayout", () => {
  it("일반 앱 셸에 실행 스플래시를 정확히 한 번 마운트한다", () => {
    render(
      <TabsLayout>
        <div>현재 화면</div>
      </TabsLayout>,
    );

    expect(screen.getAllByTestId("launch-splash")).toHaveLength(1);
    expect(screen.getByText("현재 화면")).toBeTruthy();
    expect(screen.getByTestId("onboarding-gate")).toBeTruthy();
    expect(screen.getByTestId("cheer-banner")).toBeTruthy();
    expect(screen.getByTestId("tab-bar")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 현재 레이아웃에서 실패하는지 확인한다**

Run:

```powershell
pnpm exec vitest run "src/app/(tabs)/layout.test.tsx"
```

Expected: FAIL — `launch-splash` 요소를 찾지 못함.

- [ ] **Step 3: 탭 레이아웃 맨 앞에 스플래시를 연결한다**

`src/app/(tabs)/layout.tsx`를 다음 최종 형태로 바꾼다.

```tsx
import { TabBar } from "@/components/tab-bar";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CheerBanner } from "@/components/cheer-banner";
import { LaunchMotivationSplash } from "@/components/launch-motivation-splash";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <LaunchMotivationSplash />
      <OnboardingGate />
      <CheerBanner />
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6">{children}</main>
      <TabBar />
    </>
  );
}
```

- [ ] **Step 4: 레이아웃과 전체 신규 테스트를 실행한다**

Run:

```powershell
pnpm exec vitest run "src/app/(tabs)/layout.test.tsx" src/lib/domain/launch-splash.test.ts src/components/launch-motivation-splash.test.tsx
```

Expected: `13 passed`, `0 failed`.

- [ ] **Step 5: 레이아웃 연결을 커밋한다**

```powershell
git add -- "src/app/(tabs)/layout.tsx" "src/app/(tabs)/layout.test.tsx"
git diff --cached --check
git commit -m "feat: 일반 앱 실행에 동기부여 화면 연결"
```

Expected: 탭 레이아웃과 연결 테스트만 포함된 커밋 1개.

---

### Task 6: 개발 서버에서 실제 사용자 흐름을 조작한다

**Files:**
- No code changes

- [ ] **Step 1: 개발 서버를 실행한다**

입력 프로그램: PowerShell

현재 폴더: 격리된 GND worktree 루트

Run:

```powershell
pnpm dev
```

Expected: `http://localhost:3000`에서 Next.js 개발 서버가 준비됨. 기존 3000 포트
프로세스가 있으면 그것이 이 worktree의 서버인지 먼저 확인하고, 다른 작업의 서버면
종료하지 말고 다른 포트를 사용한다.

- [ ] **Step 2: 브라우저에서 첫 실행과 자동 종료를 확인한다**

`browser:control-in-app-browser` 스킬로 새 브라우저 탭/새 페이지 세션을 만들고
`http://localhost:3000/home`을 연다.

| 확인 항목 | 정상 결과 |
|---|---|
| 스플래시 수 | 1개 |
| 이미지 | 남녀 배틀로프, 젖은 바닥, 수증기, 얼굴 그림자 |
| 색 | 블랙 중심, 골드 윤곽·반사 |
| 브랜드 | 상단 중앙 큰 골드 `GND` |
| 문구 | `오늘 1도를 틀면,` / `1년뒤 도착지가 바뀐다` 두 줄 |
| 폰트 | 승인 이미지 안의 앞으로 기울어진 굵은 글자 |
| 자동 종료 | 이미지가 보인 뒤 약 1.5초 후 홈 화면 |
| 개수 | 인물 2명, GND 1개, 메인 문구 1세트 |

단순 HTTP 200이나 스크린샷 한 장으로 대체하지 않는다. 이미지가 실제로 나타났다
사라지는 순서를 눈으로 확인한다.

- [ ] **Step 3: 터치 건너뛰기와 같은 세션 중복 방지를 확인한다**

1. 브라우저 탭을 완전히 닫고 새 탭에서 `/home`을 다시 연다.
2. 이미지가 나타나자마자 화면 중앙을 클릭한다.
3. 1.5초를 기다리지 않고 홈이 보이는지 확인한다.
4. 같은 탭에서 `/record`와 `/challenge`로 이동한다.
5. 같은 탭을 새로고침한다.

Expected: 새 탭에서는 다시 1회 보이고, 클릭하면 즉시 사라지며, 같은 탭의 이동과
새로고침에서는 다시 나타나지 않는다.

- [ ] **Step 4: 실제 휴대폰 개발 서버에서 PWA 재실행을 확인한다**

개발 서버를 `pnpm exec next dev -H 0.0.0.0`으로 다시 시작하고, 사용자가 같은
네트워크의 휴대폰에서 프로젝트 문서의 개발 주소로 접속한다. 설치형 GND를 완전히
종료한 뒤 아이콘으로 두 번 새로 실행한다.

| 조작 | 정상 결과 |
|---|---|
| 첫 아이콘 실행 | 스플래시 1회 → 홈 |
| 앱을 완전히 종료하고 재실행 | 스플래시가 다시 1회 |
| 다른 앱으로 잠깐 이동 후 복귀 | 스플래시 미표시 |
| 스플래시 터치 | 즉시 홈 |
| 노치가 있는 세로 화면 | GND와 문구가 가려지지 않음 |

브라우저를 조작할 수 없거나 휴대폰 확인을 하지 못하면 이 항목을 `[미검증]`으로
남기고 배포 단계로 넘어가지 않는다.

- [ ] **Step 5: 개발 서버를 종료한다**

PowerShell의 개발 서버 터미널에서 `Ctrl+C`를 입력한다.

Expected: 3000 포트의 이 worktree 개발 서버가 종료됨. build 전에 반드시 수행한다.

---

### Task 7: 전체 검증, 문서 기록, 최종 커밋을 한다

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 자산 크기와 변경 범위를 확인한다**

Run:

```powershell
Get-FileHash 'public\splash\gnd-launch-motivation.png' -Algorithm SHA256
git diff --check
git status --short
```

Expected: Task 2에서 확인한 승인 원본 SHA256과 같고, whitespace 오류가 없으며,
계획에 명시된 파일과 `PROGRESS.md` 외 예상하지 않은 변경이 없음.

- [ ] **Step 2: 프로젝트 전체 검증을 한 번 실행한다**

Run, in order:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: 각 명령 exit code 0, 전체 테스트 `0 failed`, Next.js build 성공.

실패하면 실패 항목의 직접 원인을 수정하고 관련 테스트만 다시 실행한 뒤, 마지막에
위 네 명령을 다시 한 번 실행한다. 실패를 숨기거나 옛 테스트 수를 기록하지 않는다.

- [ ] **Step 3: `PROGRESS.md`를 작업 마지막에 한 번 갱신한다**

문서 끝에 날짜가 포함된 `GND 실행 동기부여 스플래시` 섹션을 추가하고 아래 사실을
실제 결과 그대로 기록한다.

- 대표 이미지의 장면과 승인 카피 `오늘 1도를 틀면, 1년뒤 도착지가 바뀐다`
- `sessionStorage` 기준 새 실행 세션 1회, 백그라운드 복귀 미표시
- 생성·수정 파일 목록
- 개발 서버에서 직접 조작한 흐름과 결과
- 실제 휴대폰 PWA 확인 여부
- lint, typecheck, 전체 test의 실제 통과 수, build 결과
- DB 변경 없음, 배포 안 함
- 다음 할 일 1개: 사용자 배포 승인 후 Vercel CLI 배포 및 프로덕션 실물 확인

- [ ] **Step 4: 최종 문서와 남은 변경을 정확히 스테이징한다**

먼저 `git status --short`로 앞선 커밋 이후 남은 파일을 확인한다. 정상 경로에서는
`PROGRESS.md`만 남아야 한다.

```powershell
git add -- PROGRESS.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: 실행 동기부여 화면 검증 기록"
```

Expected: `PROGRESS.md`만 포함된 문서 커밋 1개.

- [ ] **Step 5: 완료 상태를 최종 확인한다**

Run:

```powershell
git log -5 --oneline
git status --short
```

Expected: 이 계획의 도메인, 이미지, 컴포넌트, 레이아웃, 문서 커밋이 보이고,
격리 worktree에 계획 밖 변경이 없음.

완료 보고에는 다음을 짧게 쓴다.

- 사용자 화면 변화
- 새 실행/백그라운드 복귀 동작
- 이미지·주요 파일
- 개발 서버 실조작 결과
- lint/typecheck/test/build 실제 결과
- `[미검증]` 항목
- 배포하지 않았으며 다음 단계가 사용자 배포 승인이라는 사실
