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
 * 내부 테스트 브라우저 표시. `?gnd_internal=1`로 한 번 열면 이 브라우저는 제외되고
 * `?gnd_internal=0`으로 푼다. 인증이 아니라 **편의**다 — 누가 켜도 자기 자신만 빠진다.
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
