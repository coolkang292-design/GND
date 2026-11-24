/**
 * 접속 환경 분류 — **순수 함수. 브라우저 전역을 읽지 않는다.**
 *
 * 왜 만들었나 (2026-11-09 퍼널 조사): 11/6~7 "유입 증가"의 42개 계정 중 36개가
 * HeadlessChrome이었다. 앱이 접속 환경을 아무데도 남기지 않아서 admin 퍼널은 봇과
 * 사람을 구별하지 못했고, 같은 이유로 "인앱 브라우저에서 소셜 로그인이 막히는가"도
 * 데이터로 답할 수 없었다. 이 값이 `analytics_events.client_kind`에 남는다(0119).
 *
 * ⚠️ **UA 원문을 저장하지 않는다.** 아래 7개 분류 코드만 남긴다(개인정보·핑거프린트 방지).
 * ⚠️ 분류는 추정이다. 틀려도 "퍼널에서 한 줄을 어느 칸에 세느냐"만 바뀐다.
 */

export const CLIENT_KINDS = [
  "automation",
  "inapp_kakao",
  "inapp_instagram",
  "inapp_facebook",
  "inapp_naver",
  "inapp_other",
  "browser",
] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

export function classifyClient(input: {
  userAgent: string | null | undefined;
  /** `navigator.webdriver` — 자동화 도구가 켠다 */
  webdriver?: boolean;
}): ClientKind {
  const ua = input.userAgent ?? "";
  if (input.webdriver === true) return "automation";
  if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(ua)) return "automation";

  if (/KAKAOTALK/i.test(ua)) return "inapp_kakao";
  if (/Instagram/i.test(ua)) return "inapp_instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "inapp_facebook";
  if (/NAVER\(inapp|NAVER\/|naver\(/i.test(ua)) return "inapp_naver";

  // 이름 없는 웹뷰. Android는 `; wv)`, iOS는 `Mobile/…`가 있는데 `Safari/`가 없다.
  if (/; wv\)/.test(ua)) return "inapp_other";
  if (/iPhone|iPad|iPod/.test(ua) && /Mobile\//.test(ua) && !/Safari\//.test(ua)) {
    return "inapp_other";
  }
  return "browser";
}

/** 브라우저에서만 호출한다. 서버 렌더에서는 `browser`를 돌려주지 않고 null을 준다. */
export function detectClientKind(): ClientKind | null {
  if (typeof navigator === "undefined") return null;
  try {
    return classifyClient({
      userAgent: navigator.userAgent,
      webdriver: navigator.webdriver === true,
    });
  } catch {
    return null;
  }
}
