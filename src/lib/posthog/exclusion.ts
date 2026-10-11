/**
 * 분석에서 **빼는 대상** — 관리자, QA 화면, 지정한 내부 테스트 계정·브라우저.
 *
 * 숫자를 오염시키는 가장 흔한 원인이 만든 사람 본인의 클릭이다.
 */

/** 이 경로(와 그 하위)에서는 아무것도 보내지 않는다. */
const EXCLUDED_PATH_PREFIXES = ["/admin", "/challenge-result-qa", "/image-local-qa"];

export function isExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export const INTERNAL_FLAG_KEY = "gnd-analytics-internal";

/**
 * 내부 테스트 브라우저 표시. `?gnd_internal=1`로 한 번 열면 이 브라우저가 내부(QA)로
 * 표시되고 `?gnd_internal=0`으로 푼다. 인증이 아니라 **편의**다 — 누가 켜도 자기 자신만 바뀐다.
 *
 * ⚠️ 2026-10-11부터 **빼지 않고 표시한다**(사용자 결정). 내부 브라우저의 이벤트도 나가되
 *    이벤트·사람 속성 `is_internal=true`가 붙는다. QA가 Preview에서 PostHog로 직접
 *    확인할 수 있게 하려는 것이다. 숫자에서 빼는 일은 PostHog의
 *    "Filter out internal and test users"가 한다 — 설정법: docs/analytics/posthog-funnel-v2.md
 */
export function applyInternalFlagFromSearch(search: string): void {
  try {
    const v = new URLSearchParams(search).get("gnd_internal");
    if (v === "1") window.localStorage.setItem(INTERNAL_FLAG_KEY, "1");
    else if (v === "0") window.localStorage.removeItem(INTERNAL_FLAG_KEY);
  } catch {
    // 저장소가 막혀도 앱은 계속 돈다
  }
}

export function isInternalBrowser(): boolean {
  try {
    return window.localStorage.getItem(INTERNAL_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 제외할 계정 id 목록 — `NEXT_PUBLIC_ANALYTICS_EXCLUDE_USER_IDS="uuid,uuid"`.
 * (⚠️ 통째로 적어야 Next가 치환한다. Vercel 환경변수 추가는 사용자 승인 후.)
 */
export function excludedUserIds(): string[] {
  return (process.env.NEXT_PUBLIC_ANALYTICS_EXCLUDE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isExcludedUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return excludedUserIds().includes(userId.toLowerCase());
}

/**
 * 자동화·크롤러로 보이는 브라우저 — **전송 자체를 하지 않는다**(사용자 결정 2026-10-11).
 *
 * 왜 막나: 전송은 동의 버튼을 눌러야만 시작되므로 일반 크롤러는 원래 0건이다. 남는 것은
 * Playwright 같은 자동화(우리 QA 포함)인데, 그것이 운영 숫자에 섞일 이유가 없다.
 *
 * ⚠️ UA 원문은 **어디에도 보내지 않는다.** 여기서 true/false만 만들고 끝낸다.
 * ⚠️ 판정이 애매하면 사람으로 본다. 인스타·카톡·네이버 인앱 UA를 봇으로 오인하면
 *    퍼널의 주인공(SNS 유입)이 통째로 사라진다 — 그래서 `bot` 같은 짧은 단어는
 *    단어 경계로만 잡는다(`CUBOT` 같은 휴대폰 모델명이 있다).
 */
const BOT_UA =
  /headless|phantomjs|lighthouse|googlebot|adsbot|mediapartners-google|bingbot|bingpreview|yandex(bot|images)|duckduckbot|baiduspider|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp\/|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|bytespider|gptbot|chatgpt-user|claudebot|anthropic-ai|ccbot|perplexitybot|\byeti\/|daumoa|kakaotalk-scrap|pingdom|uptimerobot|python-requests|python-urllib|\bcurl\/|\bwget\/|axios\/|node-fetch|go-http-client|\bbot\b|crawler|spider/i;

export function isLikelyBot(
  nav: { webdriver?: boolean; userAgent?: string } | undefined = typeof navigator ===
  "undefined"
    ? undefined
    : navigator,
): boolean {
  try {
    if (!nav) return false;
    if (nav.webdriver === true) return true;
    return BOT_UA.test(nav.userAgent ?? "");
  } catch {
    return false;
  }
}
