/**
 * 프로필 소개 · SNS 링크 정규화와 검증 (2026-08-31).
 *
 * ── 방어의 역할 분담 ──
 *
 * | | 무엇을 막나 |
 * |---|---|
 * | **DB CHECK** (0085) | 위험한 스킴(`javascript:`·`data:`)과 **길이** |
 * | **여기(클라이언트)** | Instagram/YouTube **실제 도메인** 검증 |
 *
 * ⚠️ DB만으로는 부족하고 여기만으로도 부족하다. 앱 화면을 거치지 않고 Supabase
 *    REST를 직접 부르는 경로가 있어서 **DB가 스킴·길이를 막아야 하고**,
 *    DB CHECK는 `https://`까지만 보므로 `https://evil.com`은 저장된다 —
 *    **도메인은 여기가 막는다.**
 *
 * ⚠️ 그래도 `https://evil.com`이 DB에 남을 수 있다는 사실은 바뀌지 않는다
 *    (다른 클라이언트가 넣으면). 그래서 **그리는 쪽도 `noopener noreferrer` +
 *    새 탭**을 반드시 쓴다. 세 겹이다.
 *
 * 순수 함수다. 조회하지 않는다.
 */

/** `profiles.bio`의 CHECK가 120자다 (0085). 화면도 같은 값을 쓴다 */
export const BIO_MAX_LENGTH = 120;
/** `profiles.*_url`의 CHECK가 200자다 (0085) */
export const LINK_MAX_LENGTH = 200;

export type LinkKind = "instagram" | "youtube";

/**
 * 허용 호스트. `endsWith`가 아니라 **정확히 일치하거나 점으로 이어진 하위 도메인**만
 * 통과시킨다.
 *
 * ⚠️ `host.endsWith("instagram.com")`으로 쓰면 **`evilinstagram.com`이 통과한다.**
 *    그래서 `=== h` 또는 `.` + h 로 검사한다.
 */
const ALLOWED_HOSTS: Record<LinkKind, string[]> = {
  instagram: ["instagram.com", "instagr.am"],
  youtube: ["youtube.com", "youtu.be", "m.youtube.com"],
};

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** 공백만 있으면 null — 빈 문자열과 null을 하나로 접는다 */
export function normalizeText(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isValidBio(raw: string | null | undefined): boolean {
  const value = normalizeText(raw);
  return value === null || value.length <= BIO_MAX_LENGTH;
}

export type LinkCheck =
  | { ok: true; value: string | null }
  | { ok: false; reason: "scheme" | "host" | "length" | "malformed" };

/**
 * 저장해도 되는 링크인가. 통과하면 **정규화된 값**을 돌려준다.
 *
 * ⚠️ `https:`만 허용한다. `javascript:`·`data:`는 물론이고 **`http:`도 막는다** —
 *    DB CHECK가 `https://`로 시작하는지 보기 때문에, 여기서 통과시켜도 저장이
 *    실패해서 사용자는 이유를 모른 채 저장이 안 되는 화면을 본다.
 */
export function checkProfileLink(
  kind: LinkKind,
  raw: string | null | undefined,
): LinkCheck {
  const value = normalizeText(raw);
  if (value === null) return { ok: true, value: null };
  if (value.length > LINK_MAX_LENGTH) return { ok: false, reason: "length" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // ⚠️ `startsWith("https://")` 문자열 검사로 바꾸지 마라. `URL`이 파싱한
  //    protocol을 봐야 `https:/\evil.com` 같은 변형에 안 속는다.
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (!hostMatches(url.hostname, ALLOWED_HOSTS[kind])) {
    return { ok: false, reason: "host" };
  }

  return { ok: true, value: url.toString() };
}

const REASON_MESSAGE: Record<
  Exclude<LinkCheck & { ok: false }, { ok: true }>["reason"],
  string
> = {
  scheme: "https:// 로 시작하는 주소만 넣을 수 있어요",
  host: "주소가 맞는지 확인해 주세요",
  length: `${LINK_MAX_LENGTH}자까지 넣을 수 있어요`,
  malformed: "주소 형식이 아니에요",
};

export function linkErrorMessage(kind: LinkKind, check: LinkCheck): string {
  if (check.ok) return "";
  if (check.reason === "host") {
    return kind === "instagram"
      ? "Instagram 주소를 넣어 주세요 (instagram.com/…)"
      : "YouTube 주소를 넣어 주세요 (youtube.com/… 또는 youtu.be/…)";
  }
  return REASON_MESSAGE[check.reason];
}

/** 버튼에 쓸 짧은 표시 — `@handle` 또는 호스트 */
export function linkLabel(kind: LinkKind, url: string): string {
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split("/").filter(Boolean)[0];
    if (!first) return kind === "instagram" ? "Instagram" : "YouTube";
    return first.startsWith("@") ? first : `@${first}`;
  } catch {
    return kind === "instagram" ? "Instagram" : "YouTube";
  }
}
