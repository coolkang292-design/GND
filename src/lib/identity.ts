import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 계정 지키기 — 카카오·구글 신원 연결 (설계 §5).
 *
 * ⚠️⚠️ **이 파일에 `signInWithOAuth`와 `linkIdentity`가 둘 다 있다. 뒤바꾸지 마라.**
 *
 * | 화면 | 쓰는 것 | 왜 |
 * |---|---|---|
 * | 온보딩 · `/account` | `linkProvider` (**linkIdentity**) | `AuthProvider`가 이미 익명 세션을 발급해 뒀다(`auth-provider.tsx:104`). 여기서 `signInWithOAuth`를 쓰면 **새 계정으로 갈아타** 방금까지의 기록과 분리된다 |
 * | `/login` | `signInWithProvider` (**signInWithOAuth**) | 이 화면만 익명 세션을 만들지 않는다(`auth-provider.tsx:94`). 붙일 세션이 없으므로 로그인이 맞다 |
 *
 * 왜 이메일이 아니라 OAuth인가 — 2026-08-08 실측:
 * `updateUser({ email })`도 원시 `PUT /auth/v1/user`도 **429
 * `over_email_send_rate_limit`**. 서버는 요청을 받아들이고 **확인 메일 발송에서**
 * 실패한다. 막힌 것은 코드가 아니라 Supabase 내장 메일 발송기의 한도다.
 * 그래서 메일을 한 통도 안 쓰는 경로로 간다.
 */

export const ALL_PROVIDERS = ["kakao", "google"] as const;
export type OAuthProvider = (typeof ALL_PROVIDERS)[number];

export const PROVIDER_META: Record<
  OAuthProvider,
  { label: string; short: string }
> = {
  kakao: { label: "카카오로 계정 지키기", short: "카카오" },
  google: { label: "구글로 계정 지키기", short: "구글" },
};

/**
 * 켜져 있는 제공자 — `NEXT_PUBLIC_OAUTH_PROVIDERS="kakao,google"`.
 *
 * ⚠️ **비어 있으면 빈 배열이다(fail-closed).** 대시보드 설정(§5.3의 7단계)이
 * 안 끝난 상태로 배포되면 주 버튼이 실패하는데, 온보딩 첫 화면에서 그건
 * **신규 사용자가 아예 앱에 못 들어오는** 일이다. 플래그를 안 켜면 버튼이 아예
 * 안 그려지고 닉네임 경로만 남는다.
 *
 * ⚠️ `process.env.NEXT_PUBLIC_OAUTH_PROVIDERS`를 **통째로** 적어야 한다. Next가
 * 빌드 시각에 이 문자열을 글자 그대로 치환하므로, 변수로 조립하면 undefined가 된다.
 */
export function enabledProviders(): OAuthProvider[] {
  const raw = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "";
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ALL_PROVIDERS.filter((p) => wanted.includes(p));
}

/** 제공자에서 돌아올 착지점. `(tabs)` 밖이라 OnboardingGate가 밀어내지 않는다. */
function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * **지금 계정에** 신원을 붙인다 — 기록이 그대로 남는다.
 *
 * 성공하면 브라우저가 제공자 동의 화면으로 떠나므로 이 함수는 돌아오지 않는다.
 * 사용자가 동의 화면을 닫으면 그냥 이 화면에 남는다 — 되돌릴 것이 없다.
 */
export async function linkProvider(provider: OAuthProvider): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: callbackUrl() },
  });
  if (error) throw error;
}

/**
 * 기존 계정으로 **돌아온다** — `/login` 전용.
 *
 * ⚠️ 온보딩·`/account`에서 부르지 마라. 그 화면들에는 익명 세션이 살아 있어서
 * 이걸 부르면 그 계정을 버리고 새 계정으로 들어간다.
 */
export async function signInWithProvider(
  provider: OAuthProvider,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl() },
  });
  if (error) throw error;
}

/**
 * 지금 계정에 붙어 있는 제공자들.
 *
 * 익명 계정이면 빈 배열이다 — 그게 "이 브라우저에만 있는 계정"의 정의다.
 * `email` 같은 우리가 안 그리는 제공자는 걸러내지 않고 그대로 준다. `/account`가
 * 이메일 연결 여부도 같이 말해야 하기 때문이다.
 */
export async function getMyIdentities(): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return (data?.identities ?? []).map((i) => i.provider);
}

/**
 * 오류 코드 → 사람 말 (설계 §5.5).
 *
 * ⚠️ `identity_already_exists`에서 **"기록이 옮겨지지 않는다"는 사실을 숨기지 마라.**
 * 사용자는 지금 계정을 지키려고 누른 것인데, 그 카카오가 이미 다른 GND 계정에
 * 붙어 있으면 이 계정은 여전히 안 지켜진 상태다. "연결 실패"로만 말하면
 * 지켜진 줄 알고 브라우저를 지운다.
 */
export function identityError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/identity_already_exists|already.*linked|identity is already/i.test(msg)) {
    return "이 계정은 이미 다른 GND 계정에 연결돼 있어요. 그 계정으로 로그인해 주세요 — 지금 기록은 옮겨지지 않아요.";
  }
  // 설정(§5.3의 6단계)이 안 된 것이지 사용자 잘못이 아니다. 사용자 문구로
  // 뭉개면 원인을 못 찾는다 — 개발자가 알아볼 말을 남긴다.
  if (/manual_linking_disabled|manual linking/i.test(msg)) {
    return "계정 연결이 서버에서 꺼져 있어요 (manual linking). 개발자에게 알려 주세요.";
  }
  if (/provider is not enabled|validation_failed/i.test(msg)) {
    return "지금은 이 방법으로 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요.";
  }
  return `연결하지 못했어요 (${msg})`;
}
