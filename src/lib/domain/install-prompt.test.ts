import { describe, expect, it } from "vitest";

import {
  MAX_DISMISS,
  OFFER_COOLDOWN_MS,
  canOfferInstall,
  detectInstallEnv,
  isStandaloneDisplay,
  markInstallOfferPending,
  needsBrowserEscape,
  needsReloginAfterInstall,
  readOfferState,
  recordDismiss,
  recordDone,
  shouldOfferInstall,
  takeInstallOfferPending,
  type InstallStorage,
} from "./install-prompt";

/** 실제로 관측된 UA들 — 지어내지 않는다 */
const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosKakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.2.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidKakao:
    "Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function env(userAgent: string, over: Partial<{ standalone: boolean; hasPromptEvent: boolean }> = {}) {
  return detectInstallEnv({
    userAgent,
    standalone: over.standalone ?? false,
    hasPromptEvent: over.hasPromptEvent ?? false,
  });
}

/** localStorage 대역 — 진짜 저장소 없이 정책을 검사한다 */
function memoryStorage(): InstallStorage & { dump: () => Record<string, string> } {
  const box: Record<string, string> = {};
  return {
    getItem: (k) => box[k] ?? null,
    setItem: (k, v) => {
      box[k] = v;
    },
    removeItem: (k) => {
      delete box[k];
    },
    dump: () => ({ ...box }),
  };
}

/** 저장을 전부 거부하는 저장소 (사파리 프라이빗 모드) */
const brokenStorage: InstallStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("detectInstallEnv", () => {
  it("이미 설치했으면 무엇보다 먼저 installed다", () => {
    // 어떤 UA든, 이벤트가 와 있든 상관없다
    expect(env(UA.iosSafari, { standalone: true })).toBe("installed");
    expect(env(UA.androidChrome, { standalone: true, hasPromptEvent: true })).toBe(
      "installed",
    );
    expect(env(UA.iosKakao, { standalone: true })).toBe("installed");
  });

  it("⚠️ 카톡 인앱은 iOS 사파리로 오인되면 안 된다 — UA에 iPhone이 들어 있다", () => {
    // 이 순서가 뒤집히면 설치가 불가능한 곳에 "공유 → 홈 화면에 추가"를 안내한다
    expect(UA.iosKakao).toMatch(/iPhone/);
    expect(env(UA.iosKakao)).toBe("inapp-ios");
  });

  it("안드로이드 카톡도 크롬으로 오인되면 안 된다", () => {
    expect(UA.androidKakao).toMatch(/Chrome/);
    expect(env(UA.androidKakao, { hasPromptEvent: true })).toBe("inapp-android");
  });

  it("iOS 사파리는 ios-safari", () => {
    expect(env(UA.iosSafari)).toBe("ios-safari");
  });

  it("iOS 크롬은 사파리와 구분한다 — 안내 화면이 다르다", () => {
    expect(env(UA.iosChrome)).toBe("ios-other");
  });

  it("안드로이드는 beforeinstallprompt 수신 여부로 갈린다", () => {
    expect(env(UA.androidChrome, { hasPromptEvent: true })).toBe("android-prompt");
    expect(env(UA.androidChrome, { hasPromptEvent: false })).toBe("android-manual");
  });

  it("PC는 desktop", () => {
    expect(env(UA.desktop, { hasPromptEvent: true })).toBe("desktop");
  });

  it("UA가 비어도 죽지 않는다", () => {
    expect(env("")).toBe("desktop");
  });
});

describe("환경별 처방", () => {
  it("인앱과 iOS 비사파리만 탈출 안내를 받는다", () => {
    expect(needsBrowserEscape(env(UA.iosKakao))).toBe(true);
    expect(needsBrowserEscape(env(UA.androidKakao))).toBe(true);
    expect(needsBrowserEscape(env(UA.iosChrome))).toBe(true);
    // 설치가 가능한 곳에 탈출 안내를 띄우면 안 된다
    expect(needsBrowserEscape(env(UA.iosSafari))).toBe(false);
    expect(needsBrowserEscape(env(UA.androidChrome, { hasPromptEvent: true }))).toBe(
      false,
    );
  });

  it("인앱 브라우저에는 설치 안내를 띄우지 않는다 — 거기선 설치가 불가능하다", () => {
    expect(canOfferInstall(env(UA.iosKakao))).toBe(false);
    expect(canOfferInstall(env(UA.androidKakao))).toBe(false);
  });

  it("설치 안내를 받는 곳은 사파리와 안드로이드뿐이다", () => {
    expect(canOfferInstall(env(UA.iosSafari))).toBe(true);
    expect(canOfferInstall(env(UA.androidChrome, { hasPromptEvent: true }))).toBe(true);
    expect(canOfferInstall(env(UA.androidChrome))).toBe(true);
    expect(canOfferInstall(env(UA.desktop))).toBe(false);
    expect(canOfferInstall(env(UA.iosSafari, { standalone: true }))).toBe(false);
  });

  it("⚠️ 재로그인 안내는 iOS에만 — 안드로이드는 로그인이 유지된다", () => {
    expect(needsReloginAfterInstall(env(UA.iosSafari))).toBe(true);
    expect(needsReloginAfterInstall(env(UA.iosKakao))).toBe(true);
    expect(needsReloginAfterInstall(env(UA.androidChrome, { hasPromptEvent: true }))).toBe(
      false,
    );
    expect(needsReloginAfterInstall(env(UA.androidChrome))).toBe(false);
  });
});

describe("노출 정책", () => {
  const base = { env: "ios-safari" as const, loggedIn: true, now: 1_000_000 };

  it("아무것도 안 한 로그인 사용자에게는 뜬다", () => {
    expect(shouldOfferInstall({ ...base, state: readOfferState(null) })).toBe(true);
  });

  it("⚠️ 로그인 안 한 사람에게는 안 뜬다 — 익명 계정으로 설치하면 기록이 갈린다", () => {
    expect(
      shouldOfferInstall({ ...base, loggedIn: false, state: readOfferState(null) }),
    ).toBe(false);
  });

  it("'다 했어요'를 누르면 다시 안 뜬다", () => {
    const s = memoryStorage();
    recordDone(s);
    expect(shouldOfferInstall({ ...base, state: readOfferState(s) })).toBe(false);
  });

  it("닫으면 유예 동안 안 뜨고, 유예가 지나면 다시 뜬다", () => {
    const s = memoryStorage();
    const closedAt = 1_000_000;
    recordDismiss(s, closedAt);
    const state = readOfferState(s);

    expect(shouldOfferInstall({ ...base, state, now: closedAt + 1 })).toBe(false);
    expect(
      shouldOfferInstall({ ...base, state, now: closedAt + OFFER_COOLDOWN_MS - 1 }),
    ).toBe(false);
    expect(
      shouldOfferInstall({ ...base, state, now: closedAt + OFFER_COOLDOWN_MS }),
    ).toBe(true);
  });

  it(`${MAX_DISMISS}번 닫으면 유예가 지나도 영영 안 뜬다 — 성가심의 상한`, () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_DISMISS; i += 1) recordDismiss(s, 1_000 * (i + 1));
    const state = readOfferState(s);
    expect(state.dismissCount).toBe(MAX_DISMISS);
    expect(
      shouldOfferInstall({ ...base, state, now: 1_000 + OFFER_COOLDOWN_MS * 10 }),
    ).toBe(false);
  });

  it("저장된 값이 깨져 있어도 앱을 세우지 않는다", () => {
    const s = memoryStorage();
    s.setItem("gnd:install-offer", "{망가진 JSON");
    expect(readOfferState(s)).toEqual({
      dismissedAt: null,
      dismissCount: 0,
      done: false,
    });
    expect(readOfferState(brokenStorage)).toEqual({
      dismissedAt: null,
      dismissCount: 0,
      done: false,
    });
  });
});

describe("로그인 성공 표식", () => {
  it("심으면 한 번만 꺼내진다 — 새로고침해도 다시 안 뜨게", () => {
    const s = memoryStorage();
    markInstallOfferPending(s);
    expect(takeInstallOfferPending(s)).toBe(true);
    expect(takeInstallOfferPending(s)).toBe(false);
  });

  it("심은 적 없으면 false", () => {
    expect(takeInstallOfferPending(memoryStorage())).toBe(false);
    expect(takeInstallOfferPending(null)).toBe(false);
  });

  it("저장소가 막혀 있어도 예외가 새지 않는다", () => {
    expect(() => markInstallOfferPending(brokenStorage)).not.toThrow();
    expect(takeInstallOfferPending(brokenStorage)).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  it("표준 display-mode로 판정한다", () => {
    expect(
      isStandaloneDisplay({ matchMedia: () => ({ matches: true }) }),
    ).toBe(true);
  });

  it("⚠️ 구형 iOS의 navigator.standalone도 본다 — 하나만 보면 설치자에게 또 뜬다", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      }),
    ).toBe(true);
  });

  it("둘 다 아니면 false", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      }),
    ).toBe(false);
    expect(isStandaloneDisplay(undefined)).toBe(false);
    expect(isStandaloneDisplay({})).toBe(false);
  });
});
