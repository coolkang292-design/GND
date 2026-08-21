/**
 * **홈 화면 설치 안내** — 환경 판정과 노출 정책 (설계:
 * `docs/superpowers/plans/2026-08-21-pwa-install-prompt-pipeline.md`).
 *
 * 화면 없이 검사할 수 있게 순수 함수로 둔다. `window`를 직접 읽지 않고 인자로
 * 받는다 — 그래야 "아이폰 카톡에서 뭐가 뜨는가"를 테스트로 잠글 수 있다.
 *
 * ── 왜 플랫폼마다 다른 물건이 필요한가 ───────────────────────
 * · **iOS 사파리에는 설치 API가 없다.** `공유 → 홈 화면에 추가`를 사람이 눌러야
 *   한다. 우리가 띄울 수 있는 건 팝업이 아니라 **그림 안내**뿐이다.
 * · **안드로이드 크롬에는 있다.** `beforeinstallprompt`를 붙들었다가
 *   사용자 제스처 안에서 `prompt()`를 부르면 시스템 설치창이 뜬다.
 *   여기에 3단계 안내를 보여주면 **틀린 안내**가 된다.
 * · **인앱 브라우저(카톡·인스타·라인…)에서는 설치가 아예 불가능하다.**
 *
 * ⚠️⚠️ **인앱 안내는 로그인보다 먼저 떠야 한다.** 인앱 브라우저는 사파리와도
 *    저장소가 다르다 — 카톡 안에서 한 로그인은 사파리로 안 넘어간다. 순서를
 *    틀리면 iOS 사용자가 로그인을 **세 번**(카톡·사파리·설치본) 하게 된다.
 */

/** 설치 안내를 정할 때 필요한 환경 — `window`에서 뽑아 넣는다 */
export type InstallInput = {
  userAgent: string;
  /** 이미 홈 화면 앱으로 실행 중인가 (`display-mode: standalone` 또는 `navigator.standalone`) */
  standalone: boolean;
  /** `beforeinstallprompt`를 실제로 받았는가 — UA 추측보다 이게 진실이다 */
  hasPromptEvent: boolean;
};

export type InstallEnv =
  /** 이미 설치해서 쓰는 중 — 무엇도 띄우지 않는다 */
  | "installed"
  /** iOS 인앱 브라우저(카톡 등) — 사파리로 내보낸다 */
  | "inapp-ios"
  /** 안드로이드 인앱 브라우저 — 크롬으로 내보낸다 */
  | "inapp-android"
  /** iOS 사파리 — `···` → 공유 → 홈 화면에 추가 4단계 안내 */
  | "ios-safari"
  /** iOS의 크롬·파이어폭스 등 — 사파리로 옮기라고 안내한다 */
  | "ios-other"
  /** 안드로이드 + `beforeinstallprompt` 받음 — 버튼 하나 */
  | "android-prompt"
  /** 안드로이드인데 이벤트가 안 왔다 — `⋮ → 홈 화면에 추가` 2단계 안내 */
  | "android-manual"
  /** PC — 이 앱은 폰용이라 띄우지 않는다 */
  | "desktop";

/**
 * 인앱 브라우저 표식.
 *
 * ⚠️ 여기 없는 앱은 "일반 브라우저"로 취급돼 **불가능한 설치 안내**를 보게 된다.
 *    새 유입 경로가 생기면(밴드·당근 등) 여기에 추가해라.
 * ⚠️ `NAVER`는 네이버앱, `DaumApps`는 다음앱이다. 카카오톡은 `KAKAOTALK`.
 */
const IN_APP_MARKERS =
  /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|wv\)/i;

/** iOS에서 사파리가 **아닌** 브라우저들 (전부 WebKit이라 UA로만 갈린다) */
const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|Whale/i;

export function detectInstallEnv(input: InstallInput): InstallEnv {
  const ua = input.userAgent ?? "";

  // ⚠️ 이 판정이 **가장 먼저**다. 이미 설치한 사람에게 설치를 권하는 것만큼
  //    앱이 멍청해 보이는 일이 없다.
  if (input.standalone) return "installed";

  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);

  // ⚠️ 인앱 판정이 플랫폼 분기보다 먼저다. 카톡 인앱 브라우저의 UA에도
  //    `iPhone`이 들어 있어서, 순서를 뒤집으면 설치할 수 없는 곳에
  //    "공유 → 홈 화면에 추가"를 안내하게 된다.
  if (IN_APP_MARKERS.test(ua)) {
    if (ios) return "inapp-ios";
    if (android) return "inapp-android";
    return "desktop"; // 데스크톱 인앱(슬랙 등) — 어차피 안 띄운다
  }

  if (ios) return IOS_NON_SAFARI.test(ua) ? "ios-other" : "ios-safari";

  if (android) {
    // 이벤트가 진실이다. 크롬이라도 설치 조건을 못 채우면 이벤트가 안 온다
    // (매니페스트·서비스워커·HTTPS). 그때는 손으로 하는 길을 알려준다.
    return input.hasPromptEvent ? "android-prompt" : "android-manual";
  }

  return "desktop";
}

/** 인앱 브라우저에서 빠져나오라고 안내해야 하는 환경인가 */
export function needsBrowserEscape(env: InstallEnv): boolean {
  return env === "inapp-ios" || env === "inapp-android" || env === "ios-other";
}

/**
 * 설치 안내(시트 A·B)를 띄울 수 있는 환경인가.
 *
 * ⚠️ 인앱 브라우저는 **false**다 — 거기서는 설치가 불가능하니 설치 안내가 아니라
 *    탈출 안내(`needsBrowserEscape`)를 띄워야 한다.
 */
export function canOfferInstall(env: InstallEnv): boolean {
  return (
    env === "ios-safari" || env === "android-prompt" || env === "android-manual"
  );
}

/**
 * **설치 후 다시 로그인해야 하는 환경인가.**
 *
 * iOS는 홈 화면 앱과 사파리의 저장소가 갈려서 설치본이 로그아웃 상태로 열린다.
 * 안드로이드 크롬은 WebAPK가 크롬 프로필을 그대로 쓰므로 로그인이 유지된다.
 *
 * ⚠️ 이 한 줄이 안내 문구를 가른다. 안드로이드에 "다시 로그인하세요"를 띄우면
 *    멀쩡히 로그인된 사람에게 로그인을 시키는 셈이다.
 * ⚠️ 안드로이드 쪽은 아직 **실기기 미검증**이다(계획서 P0-3).
 */
export function needsReloginAfterInstall(env: InstallEnv): boolean {
  return env === "ios-safari" || env === "ios-other" || env === "inapp-ios";
}

// ── 노출 정책 ────────────────────────────────────────────────

export const INSTALL_OFFER_KEY = "gnd:install-offer";
export const INSTALL_PENDING_KEY = "gnd:install-offer:pending";

/**
 * **닫기 이력의 판 번호.**
 *
 * ⚠️ 올리면 **모든 사람의 닫기 이력이 한 번 무효**가 된다. 함부로 올리지 마라.
 *    2(2026-08-22): 1판에는 **되돌아올 문이 없었다** — `다 했어요`를 한 번 누르면
 *    영영 안 뜨는데 다시 여는 방법이 아예 없었다. 그 상태에서 눌린 기록은
 *    사용자의 뜻이 아니라 우리 결함이므로 한 번 지운다. 이미 설치한 사람은
 *    `standalone` 판정에서 걸러지므로 이 초기화로 성가셔지지 않는다.
 */
export const OFFER_STATE_VERSION = 2;

/** 닫은 뒤 다시 물어보기까지 기다리는 시간 */
export const OFFER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** 이만큼 닫으면 더 묻지 않는다 — 내 정보 탭의 상시 진입점만 남는다 */
export const MAX_DISMISS = 3;

export type OfferState = {
  /** 마지막으로 닫은 시각(ms). 한 번도 안 닫았으면 null */
  dismissedAt: number | null;
  dismissCount: number;
  /** 사용자가 "다 했어요"를 눌렀다 — 다시 묻지 않는다 */
  done: boolean;
};

export type InstallStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const EMPTY: OfferState = { dismissedAt: null, dismissCount: 0, done: false };

export function readOfferState(storage: InstallStorage | null): OfferState {
  if (!storage) return EMPTY;
  try {
    const raw = storage.getItem(INSTALL_OFFER_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const o = parsed as Partial<OfferState> & { v?: number };
    // 판이 다르면 못 본 것으로 친다 (위 상수의 주석)
    if (o.v !== OFFER_STATE_VERSION) return EMPTY;
    return {
      dismissedAt: typeof o.dismissedAt === "number" ? o.dismissedAt : null,
      dismissCount: typeof o.dismissCount === "number" ? o.dismissCount : 0,
      done: o.done === true,
    };
  } catch {
    // 저장소가 막혔거나 값이 깨졌다 — 안 본 것으로 친다.
    // ⚠️ 여기서 던지면 시트가 아니라 **앱 전체**가 멈춘다.
    return EMPTY;
  }
}

function write(storage: InstallStorage | null, next: OfferState): OfferState {
  try {
    storage?.setItem(
      INSTALL_OFFER_KEY,
      JSON.stringify({ ...next, v: OFFER_STATE_VERSION }),
    );
  } catch {
    // 사파리 프라이빗 모드 등 — 이번 세션에서만 닫힌 것으로 둔다
  }
  return next;
}

export function recordDismiss(
  storage: InstallStorage | null,
  now: number,
): OfferState {
  const prev = readOfferState(storage);
  return write(storage, {
    ...prev,
    dismissedAt: now,
    dismissCount: prev.dismissCount + 1,
  });
}

export function recordDone(storage: InstallStorage | null): OfferState {
  return write(storage, { ...readOfferState(storage), done: true });
}

/**
 * 지금 설치 안내를 띄울 것인가 (설치 안내 전용 — 익명 판단은 `decideGuide`가 한다).
 */
export function shouldOfferInstall(args: {
  env: InstallEnv;
  state: OfferState;
  loggedIn: boolean;
  now: number;
}): boolean {
  const { env, state, loggedIn, now } = args;
  if (!canOfferInstall(env)) return false;
  if (!loggedIn) return false;
  return withinPolicy(state, now);
}

/** 닫기 이력이 지금 안내를 막고 있는가 */
function withinPolicy(state: OfferState, now: number): boolean {
  if (state.done) return false;
  if (state.dismissCount >= MAX_DISMISS) return false;
  if (state.dismissedAt !== null && now - state.dismissedAt < OFFER_COOLDOWN_MS)
    return false;
  return true;
}

/** 지금 무엇을 보여줄 것인가 */
export type GuideKind =
  /** 아무것도 안 보여준다 */
  | "none"
  /** 신원이 없다 — 설치보다 로그인이 먼저다 */
  | "login-first"
  /** 인앱 브라우저다 — 사파리·크롬으로 내보낸다 */
  | "escape"
  /** 설치 안내 */
  | "install";

/**
 * **안내의 단일 결정 지점.**
 *
 * ⚠️⚠️ **익명이라고 침묵하지 않는다** (2026-08-22 사장님 지시 — *"로그인을 했든
 *    안 했든 앱이 안 깔려 있으면 나가게 세팅된 게 아닌가?"*).
 *
 *    옛 판은 신원이 없으면 **아무것도** 안 띄웠다. 익명 계정으로 설치하면
 *    설치본에서 그 계정으로 못 돌아와 기록이 갈리기 때문인데, **막는 것은 답이
 *    아니었다.** 안 깔린 사람에게는 전부 말을 걸되, 익명이면 *"먼저 로그인"*
 *    을 먼저 보여주면 된다. 설치도 늘고 계정도 지켜진다.
 *
 * ⚠️ `manual`은 사용자가 **직접 눌러서** 연 경우다(내 정보 탭의 상시 진입점).
 *    이때는 닫기 이력을 보지 않는다 — "다 했어요"를 한 번 누르면 영영 못 보는
 *    상태가 되는 것이 실제로 문제가 됐다(사장님 사파리, 2026-08-22).
 */
export function decideGuide(args: {
  env: InstallEnv;
  linked: boolean;
  state: OfferState;
  now: number;
  manual?: boolean;
}): GuideKind {
  const { env, linked, state, now, manual = false } = args;

  // 이미 설치했거나 PC면 할 말이 없다
  if (env === "installed" || env === "desktop") return "none";

  // 인앱 브라우저의 탈출 안내는 닫기 이력을 보지 않는다 — 카톡으로 다시 들어올
  // 때마다 필요한 안내다. 반복 노출은 세션 단위로 막는다(게이트 담당).
  if (linked && needsBrowserEscape(env)) return "escape";

  if (!manual && !withinPolicy(state, now)) return "none";

  if (!linked) return "login-first";
  return canOfferInstall(env) ? "install" : "none";
}

/**
 * **로그인 성공을 시트에 알리는 표식.**
 *
 * ⚠️ 리액트 상태로는 못 넘긴다 — 로그인 성공 이동이 `window.location.assign`
 *    **전체 페이지 로드**라 메모리가 통째로 날아간다(`login/page.tsx`의 주석 참고).
 *    그래서 저장소에 표식을 심고 착지한 화면이 꺼내 쓴다.
 */
export function markInstallOfferPending(storage: InstallStorage | null): void {
  try {
    storage?.setItem(INSTALL_PENDING_KEY, "1");
  } catch {
    // 저장 못 하면 이번 로그인에서는 안 뜬다. 유예 뒤 다시 기회가 온다.
  }
}

/** 표식을 **꺼내면서 지운다** — 새로고침마다 다시 뜨지 않게 */
export function takeInstallOfferPending(
  storage: InstallStorage | null,
): boolean {
  try {
    if (storage?.getItem(INSTALL_PENDING_KEY) !== "1") return false;
    storage.removeItem(INSTALL_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

// ── 브라우저에서 값 뽑기 ─────────────────────────────────────

type StandaloneWindow = {
  matchMedia?: (q: string) => { matches: boolean };
  /**
   * ⚠️ `unknown`인 이유: `navigator.standalone`은 **표준 `Navigator` 타입에 없는**
   *    iOS 전용 속성이다. `{ standalone?: boolean }`으로 적으면 진짜 `window`를
   *    넘길 때 "공통 속성이 없다"고 컴파일이 막힌다.
   */
  navigator?: unknown;
};

/**
 * 홈 화면 앱으로 실행 중인가.
 *
 * ⚠️ **두 가지를 다 본다.** `display-mode: standalone`은 표준이고,
 *    `navigator.standalone`은 iOS의 옛 방식이다. 하나만 보면 구형 iOS에서
 *    설치한 사람에게 설치 안내가 또 뜬다.
 */
export function isStandaloneDisplay(win: StandaloneWindow | undefined): boolean {
  if (!win) return false;
  const media = win.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const nav = win.navigator as { standalone?: unknown } | undefined | null;
  const legacy = nav?.standalone === true;
  return media || legacy;
}
