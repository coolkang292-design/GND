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

// ── 돌아왔을 때 어디로 보낼지 (2026-08-10) ────────────────────────
//
// `/auth/callback`은 **두 흐름이 같이 지나간다.** 도착한 주소만 봐서는 구분할 수
// 없어서 오래도록 둘 다 `/account`로 보냈다:
//
//   · 연결(link)  — `/account`·온보딩에서 "카카오로 계정 지키기" → 결과를
//                   보여줘야 하므로 `/account`가 맞다
//   · 로그인(signin) — 로그아웃했다가 `/login`에서 다시 들어옴 → **홈이 맞다.**
//                   설정 화면에 떨어뜨리면 "내가 왜 여기 있지"가 된다
//                   (사용자 지적 2026-08-10)
//
// ⚠️ 쿼리스트링에 담지 않는다 — 주소창·기록에 남고, 사용자가 그 주소를 저장하면
//    다음번에 엉뚱한 곳으로 간다(`/auth/callback`이 같은 이유로 쿼리를 안 쓴다).
// ⚠️ `sessionStorage`가 아니라 `localStorage`다. 카카오 인앱 브라우저가 동의
//    화면을 **새 탭**에서 열고 돌아오는 일이 있는데, 그러면 세션 저장소는 비어
//    있다. 보관된 초대 코드가 같은 이유로 localStorage를 쓴다(`crew.ts:223`).
const AUTH_INTENT_KEY = "gnd-auth-intent";

export type AuthIntent = "signin" | "link";

function saveAuthIntent(intent: AuthIntent): void {
  // 저장이 막혀도(프라이빗 모드 등) 로그인 자체는 되어야 한다. 그때는 의도를
  // 모르는 채로 돌아오고, 아래 `takeAuthIntent`가 null을 준다.
  try {
    localStorage.setItem(AUTH_INTENT_KEY, intent);
  } catch {
    // 무시 — 갈 곳의 기본값은 호출하는 쪽이 정한다
  }
}

/**
 * 한 번만 꺼내진다 — 읽는 즉시 지운다.
 *
 * ⚠️ 남겨 두면 **다음 왕복까지 오염된다.** 로그인으로 한 번 들어온 뒤
 * `/account`에서 구글을 붙이면 그때도 "signin"으로 읽혀 홈으로 튕기고,
 * 연결됐다는 말을 아무 데서도 못 본다.
 */
export function takeAuthIntent(): AuthIntent | null {
  try {
    const v = localStorage.getItem(AUTH_INTENT_KEY);
    if (v !== null) localStorage.removeItem(AUTH_INTENT_KEY);
    return v === "signin" || v === "link" ? v : null;
  } catch {
    return null;
  }
}

/**
 * **지금 계정에** 신원을 붙인다 — 기록이 그대로 남는다.
 *
 * 성공하면 브라우저가 제공자 동의 화면으로 떠나므로 이 함수는 돌아오지 않는다.
 * 사용자가 동의 화면을 닫으면 그냥 이 화면에 남는다 — 되돌릴 것이 없다.
 */
export async function linkProvider(provider: OAuthProvider): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  // ⚠️ 떠나기 **전에** 남긴다. 성공하면 이 줄 아래는 실행되지 않는다.
  saveAuthIntent("link");
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: callbackUrl() },
  });
  // 못 떠났으면 의도를 치운다 — 남기면 **다음 왕복**이 이걸 주워 읽는다.
  if (error) {
    takeAuthIntent();
    throw error;
  }
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
  // 이 경로로 온 사람은 **돌아온 것**이다 — 착지점은 설정이 아니라 홈이다.
  saveAuthIntent("signin");
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl() },
  });
  if (error) {
    takeAuthIntent();
    throw error;
  }
}

/**
 * 지금 계정에 붙어 있는 제공자들.
 *
 * 익명 계정이면 빈 배열이다 — 그게 "이 브라우저에만 있는 계정"의 정의다.
 * `email` 같은 우리가 안 그리는 제공자는 걸러내지 않고 그대로 준다. `/account`가
 * 이메일 연결 여부도 같이 말해야 하기 때문이다.
 */
/**
 * **신원(카카오·구글·이메일)이 붙어 있는가 — 네트워크를 타지 않는다.**
 *
 * ⚠️⚠️ **이 함수가 존재하는 이유: `getMyIdentities()`는 네트워크를 탄다.**
 *    `getUserIdentities()`는 내부적으로 `/auth/v1/user`를 호출해서, 전파가 늦거나
 *    네트워크가 흔들리면 던진다. 그걸 "신원 없음"으로 처리하면 **판단이 그때그때
 *    달라진다** — 2026-08-22에 설치 안내가 "떴다 안 떴다" 한 원인이 정확히 이거였다
 *    (카톡 → 사파리로 막 넘어온 순간이 네트워크가 가장 불안정하다).
 *
 *    세션은 **이미 로컬에 있다.** 거기 `is_anonymous`와 `identities`가 들어 있으므로
 *    물어볼 필요가 없다. 화면을 띄울지 말지 같은 **판단**에는 이걸 써라.
 *    서버의 최신 상태가 정말 필요한 곳(`/account`의 연결 목록)만 `getMyIdentities()`를 쓴다.
 *
 * 세션이 없으면 false다 — 붙일 계정 자체가 없다.
 */
export async function hasLinkedIdentity(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return false;
  // 익명 계정은 명시적으로 표시된다. 옛 세션에 이 필드가 없을 수 있어
  // identities 길이도 함께 본다 — 익명이면 어차피 비어 있다.
  if (user.is_anonymous === true) return false;
  return (user.identities ?? []).length > 0;
}

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

/**
 * 연결 실패를 **짧은 분류 코드**로 바꾼다 — 퍼널 계측용 (배포 D).
 *
 * ⚠️ **`identityError`와 짝이다. 둘을 따로 고치지 마라.** 하나는 사람에게 보여줄
 *    문장을, 하나는 집계할 코드를 낸다. 같은 판정을 두 벌 쓰지 않도록 정규식을
 *    같은 순서·같은 조건으로 유지한다.
 *
 * ⚠️ **raw error를 그대로 내보내지 않는다.** 마지막 `unknown`이 그 이유다 —
 *    모르는 오류의 메시지에는 주소·토큰·사용자 입력이 섞여 들어올 수 있고,
 *    그건 `analytics_events`에 저장돼선 안 된다(0093은 자유 JSON 칸이 없다).
 *
 * 왜 필요한가: "가입이 싫어서 안 눌렀다"와 "카카오가 KOE205로 죽어서 못 들어왔다"는
 * 고칠 것이 완전히 다르다. 2026-08-08에 카카오가 실제로 죽은 적이 있다.
 */
export function linkFailureCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (/identity_already_exists|already.*linked|identity is already/i.test(msg)) {
    return "identity_already_exists";
  }
  if (/manual_linking_disabled|manual linking/i.test(msg)) {
    return "manual_linking_disabled";
  }
  if (/provider is not enabled|validation_failed/i.test(msg)) {
    return "provider_unavailable";
  }
  if (/network|fetch failed|timeout|Failed to fetch/i.test(msg)) {
    return "network";
  }
  if (/popup|closed by user|cancel/i.test(msg)) {
    return "user_cancelled";
  }
  return "unknown";
}
