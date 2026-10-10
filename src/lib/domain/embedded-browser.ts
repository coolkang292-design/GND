/**
 * **구글 OAuth가 막히는 브라우저인가** — 순수 함수만 (2026-10-11, Issue #2 P0-3).
 *
 * 구글은 2021년부터 임베디드 웹뷰(iOS WKWebView · Android WebView)의 OAuth 요청을
 * `403 disallowed_useragent`로 차단한다. 인스타·카톡·스레드의 앱 안 브라우저가 여기에
 * 해당한다. 이 오류는 **구글 페이지에서** 나서 `/auth/callback`으로 안 돌아오므로
 * `identity_link_failed`에도 안 잡히고, 사용자는 구글 오류 화면에 갇힌다.
 * 근거: `docs/qa/onboarding-dropoff-first-principles-2026-10-11.md` §2.5
 *
 * ⚠️ **SFSafariViewController(유튜브 iOS 등)와 Chrome Custom Tabs는 막히지 않는다.**
 *    UA가 사파리·크롬과 똑같고 구글도 허용한다. "인앱이면 전부 막기"로 넓히면 멀쩡히
 *    되는 사람의 구글을 뺏는다.
 * ⚠️ 카카오는 웹뷰에서도 된다(아이디·비밀번호를 쳐야 할 수는 있다). 그래서 카카오는 남긴다.
 * ⚠️ 실기기 검증 전이다 — 계획서 S04(인스타 iOS 구글)에서 확인한다.
 */

import type { OAuthProvider } from "@/lib/identity";

/** 앱 표식이 UA에 박혀 있는 웹뷰들 (`install-prompt.ts`의 `IN_APP_MARKERS`와 같은 계열) */
const APP_MARKERS =
  /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Barcelona|Line\/|NAVER\(inapp|DaumApps|everytimeApp/i;

/** 사파리 토큰이 있는 iOS 브라우저 — 사파리·크롬·파폭·엣지 모두 `Safari/`를 단다 */
const IOS_SAFARI_TOKEN = /Safari\//;

export function isEmbeddedWebView(userAgent: string): boolean {
  const ua = userAgent ?? "";
  if (!ua) return false;
  if (APP_MARKERS.test(ua)) return true;

  // 안드로이드 WebView는 `; wv)`를 단다. Custom Tabs는 크롬 UA라 여기 안 걸린다.
  if (/Android/i.test(ua)) return /\bwv\)/.test(ua);

  // ⚠️ iOS WKWebView는 기본 UA에 `Safari/` 토큰이 **없다.** 앱 표식을 안 다는 앱
  //    (운영 DB의 스레드 방문이 이 모양이었다)도 이걸로 잡힌다.
  if (/iPhone|iPad|iPod/i.test(ua)) return !IOS_SAFARI_TOKEN.test(ua);

  return false;
}

/** 이 브라우저에서 실제로 끝까지 갈 수 있는 제공자만 — 순서는 그대로 */
export function providersUsableIn(
  providers: readonly OAuthProvider[],
  userAgent: string,
): OAuthProvider[] {
  if (!isEmbeddedWebView(userAgent)) return [...providers];
  return providers.filter((p) => p !== "google");
}
