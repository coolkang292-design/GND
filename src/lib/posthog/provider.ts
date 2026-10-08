/**
 * 로그인 제공자 이름을 **허용된 값**으로 줄인다. (`events.ts`의 enum과 같은 집합)
 *
 * 방금 연결·로그인한 제공자는 identities 중 **가장 최근 것**이다. 정보가 없으면 `other`.
 * 이메일 신원은 연결 이벤트에서는 `other`, 로그인 이벤트에서는 `password`로 본다.
 */

interface IdentityLike {
  provider?: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export interface UserLike {
  identities?: IdentityLike[] | null;
  app_metadata?: { provider?: string } | null;
}

function ts(i: IdentityLike): number {
  const t = Date.parse(i.last_sign_in_at ?? i.created_at ?? "");
  return Number.isFinite(t) ? t : 0;
}

function latestRaw(user: UserLike | null | undefined): string | null {
  const ids = (user?.identities ?? []).filter((i) => i.provider);
  if (ids.length > 0) {
    return [...ids].sort((a, b) => ts(b) - ts(a))[0]!.provider ?? null;
  }
  return user?.app_metadata?.provider ?? null;
}

export function linkProviderOf(user: UserLike | null | undefined): "kakao" | "google" | "other" {
  const p = latestRaw(user);
  return p === "kakao" || p === "google" ? p : "other";
}

export function loginProviderOf(
  user: UserLike | null | undefined,
): "kakao" | "google" | "password" | "other" {
  const p = latestRaw(user);
  if (p === "kakao" || p === "google") return p;
  if (p === "email") return "password";
  return "other";
}
