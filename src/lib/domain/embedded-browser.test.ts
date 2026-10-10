import { describe, expect, it } from "vitest";

import { isEmbeddedWebView, providersUsableIn } from "./embedded-browser";

/**
 * **구글 OAuth가 막히는 브라우저인가** (2026-10-11, Issue #2 P0-3).
 *
 * 구글은 임베디드 웹뷰(WKWebView·Android WebView)의 OAuth를 `403 disallowed_useragent`로
 * 막는다. 이 오류는 **구글 페이지에서** 나서 우리 콜백으로 안 돌아온다 — 사용자는 막다른
 * 화면에 갇히고 우리 계측에도 안 잡힌다. 그래서 누르기 전에 버튼을 안 보여준다.
 *
 * ⚠️ SFSafariViewController(유튜브 iOS 등)·Chrome Custom Tabs는 **막히지 않는다** —
 *    UA가 사파리·크롬과 같고, 구글도 허용한다. 이걸 막으면 멀쩡한 사람의 구글을 뺏는다.
 */
const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  iosInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22H31 Instagram 450.0.0.0.0 (iPhone15,3; iOS 18_7; ko_KR; ko; scale=3.00; 1290x2796; 0)",
  iosKakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.2.1",
  /** 스레드 — 운영 DB에서 실제로 이 모양(사파리 토큰 없음, 앱 표식 없음)이었다 */
  iosThreads:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("isEmbeddedWebView", () => {
  it("인스타·카톡·스레드 같은 앱 안 브라우저는 웹뷰다", () => {
    expect(isEmbeddedWebView(UA.iosInstagram)).toBe(true);
    expect(isEmbeddedWebView(UA.iosKakao)).toBe(true);
    expect(isEmbeddedWebView(UA.iosThreads)).toBe(true);
    expect(isEmbeddedWebView(UA.androidInstagram)).toBe(true);
  });

  it("⚠️ 사파리·크롬(그리고 같은 UA를 쓰는 SFSafariViewController·Custom Tabs)은 웹뷰가 아니다", () => {
    expect(isEmbeddedWebView(UA.iosSafari)).toBe(false);
    expect(isEmbeddedWebView(UA.iosChrome)).toBe(false);
    expect(isEmbeddedWebView(UA.androidChrome)).toBe(false);
    expect(isEmbeddedWebView(UA.desktop)).toBe(false);
  });

  it("UA가 비어도 죽지 않는다 — 모르면 막지 않는다", () => {
    expect(isEmbeddedWebView("")).toBe(false);
  });
});

describe("providersUsableIn", () => {
  it("웹뷰에서는 구글을 뺀다 — 카카오는 남긴다", () => {
    expect(providersUsableIn(["kakao", "google"], UA.iosInstagram)).toEqual(["kakao"]);
  });

  it("일반 브라우저에서는 그대로다", () => {
    expect(providersUsableIn(["kakao", "google"], UA.iosSafari)).toEqual([
      "kakao",
      "google",
    ]);
  });

  it("켜진 제공자 순서를 바꾸지 않는다", () => {
    expect(providersUsableIn(["google", "kakao"], UA.androidChrome)).toEqual([
      "google",
      "kakao",
    ]);
  });
});
