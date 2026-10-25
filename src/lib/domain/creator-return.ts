/**
 * Where to send someone after logging in from a Creator Studio link (사용자 결정
 * 2026-10-24: 비로그인은 로그인 화면으로, 로그인 후 원래 화면으로).
 *
 * ⚠️ Only Creator Studio paths. Any other value would make `/login?next=` an
 *    open redirect. Not-a-host is still decided by the server page (404).
 */
export const CREATOR_BASE_PATH = "/challenge/creator";

/** 개발 서버 미리보기(`/challenge/creator/demo`)의 가짜 챌린지 — 실제 화면·RPC로 이어지면 안 된다. */
export const isDemoChallenge = (id: string) => id === "demo";

const CREATOR_PATH =/^\/challenge\/creator(\/[A-Za-z0-9-]+){0,3}$/;

export function creatorReturnPath(raw: string | null | undefined): string | null {
  return raw && CREATOR_PATH.test(raw) ? raw : null;
}

const KEY = "gnd.creator-return";

/** OAuth leaves the page, so the path rides in storage to `/auth/callback`. */
export function rememberCreatorReturn(raw: string | null): void {
  const path = creatorReturnPath(raw);
  try {
    // Clear on a plain login too — a value left by an abandoned attempt must not
    // hijack a later, unrelated sign-in.
    if (path) localStorage.setItem(KEY, path);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the user lands on the default page instead. Not an error.
  }
}

export function consumeCreatorReturn(): string | null {
  try {
    const path = creatorReturnPath(localStorage.getItem(KEY));
    localStorage.removeItem(KEY);
    return path;
  } catch {
    return null;
  }
}
