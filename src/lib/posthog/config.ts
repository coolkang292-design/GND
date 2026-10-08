/**
 * PostHog 설정 — **키가 없으면 전부 꺼진다.**
 *
 * ⚠️ `process.env.NEXT_PUBLIC_*`를 **통째로** 적어야 한다. Next가 빌드 시각에 이
 * 문자열을 글자 그대로 치환하므로, 변수로 조립하면 undefined가 된다
 * (`identity.ts`의 `enabledProviders`와 같은 이유).
 *
 * ⚠️ 호스트는 **US Cloud**(또는 로컬 테스트용 loopback)만 받는다. 그 밖의 값이
 * 들어오면 다른 지역·다른 서버로 조용히 보내는 대신 **분석을 끈다**(fail-closed).
 * 처리방침이 "미국 PostHog"라고 적기 때문이다.
 */

export const POSTHOG_US_HOST = "https://us.i.posthog.com";
export const POSTHOG_US_UI_HOST = "https://us.posthog.com";

/** 프로젝트 API 키 모양 — `phc_` + 영숫자. 비밀키(`phx_`)가 잘못 들어오면 거부한다. */
const KEY_SHAPE = /^phc_[A-Za-z0-9]{10,}$/;

function isAllowedHost(host: string): boolean {
  if (host === POSTHOG_US_HOST) return true;
  // 로컬 기능 테스트용(가짜 수집 서버). 운영 번들에는 설정되지 않는다.
  try {
    const u = new URL(host);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function posthogKey(): string | null {
  const raw = (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "").trim();
  return KEY_SHAPE.test(raw) ? raw : null;
}

export function posthogHost(): string | null {
  const raw = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "").trim().replace(/\/+$/, "");
  const host = raw === "" ? POSTHOG_US_HOST : raw;
  return isAllowedHost(host) ? host : null;
}

/** 키와 호스트가 모두 유효할 때만 true. 이게 false면 배너·설정·전송이 전부 없다. */
export function isAnalyticsConfigured(): boolean {
  return posthogKey() !== null && posthogHost() !== null;
}
