"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  BrandWordmark,
  EntryFade,
  EntryPhoto,
  EntryTopShade,
  LimeCta,
  ProviderButton,
} from "@/components/brand/entry";
import { LOGIN_COPY as COPY } from "@/lib/domain/brand-copy";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { GoogleBlockedNote, useUsableProviders } from "@/components/auth/usable-providers";
import { pendingChallengeInvitePath } from "@/lib/challenge";
import { APP_LANDING_PATH } from "@/lib/domain/landing";
import {
  PROVIDER_META,
  identityError,
  signInWithProvider,
  type OAuthProvider,
} from "@/lib/identity";

/**
 * 로그인 — 계정을 지켜 둔 사용자가 다시 들어오는 문
 *
 * 왜 필요한가: 익명 인증만 쓰면 계정이 브라우저 저장소에만 있어서, 저장소가
 * 비워지면 기록·XP·배지에 영영 접근할 수 없다(실제로 발생했다). 이메일이나
 * 카카오·구글이 붙어 있으면 어떤 기기·브라우저에서든 같은 계정으로 돌아온다.
 *
 * `(tabs)` 밖에 둔다 — OnboardingGate가 돌면 로그인하러 온 사람을 온보딩으로
 * 밀어내 버린다.
 *
 * ⚠️⚠️ **이 화면만 `signInWithOAuth`다.** 다른 화면(온보딩·`/account`)은
 * `linkIdentity`를 쓴다. 여기서만 맞는 이유는 `AuthProvider`가 `/login`에서는
 * 익명 세션을 발급하지 않기 때문이다(`auth-provider.tsx:94`) — 붙일 세션이 없다.
 * 반대로 다른 화면에서 이걸 쓰면 방금까지 쓰던 익명 계정을 버리고 새 계정으로
 * 갈아타 **기록이 분리된다.**
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
  // ⚠️ 인스타·카톡 웹뷰에서는 구글이 빠진다 — `components/auth/usable-providers.tsx`
  const { providers, googleBlocked } = useUsableProviders();

  /**
   * **홈 화면 앱을 방금 설치하고 처음 연 사람인가** (`auth-provider.tsx`가 붙인다).
   *
   * iOS는 설치본과 사파리의 저장소가 갈려서 설치본이 로그아웃 상태로 열린다.
   * 그 사람에게 "돌아오셨군요"는 맞는 말이 아니다 — 방금 사파리에서 로그인했는데
   * 또 로그인 화면을 보면 **가입이 안 된 줄 알고 다시 가입한다.** 그게 계정 분리다.
   *
   * ⚠️ `useSearchParams`를 쓰지 않는다 — Suspense 경계를 요구해 빌드가 깨진다
   *    (`auth/callback/page.tsx`와 같은 이유). 착지 직후 한 번만 읽으면 되는 값이다.
   *
   * ⚠️ `useEffect` + `setState`도 아니다. 그건 `react-hooks/set-state-in-effect`에
   *    걸리고, 초기값을 `window`에서 읽으면 **서버가 그린 글자와 달라져**
   *    하이드레이션이 깨진다(이 값이 화면 문구를 바꾸기 때문에 실제로 보인다).
   *    `useSyncExternalStore`가 정확히 이 경우를 위한 것이다 — 서버 스냅샷은
   *    false, 하이드레이션 뒤 클라이언트 값으로 한 번 다시 그린다.
   *    값이 바뀔 일이 없으므로 구독은 빈 함수다.
   */
  const fromInstalled = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("from") === "installed",
    () => false,
  );

  async function handleOAuth(provider: OAuthProvider) {
    if (oauthBusy) return;
    setOauthBusy(provider);
    setError(null);
    try {
      // 성공하면 브라우저가 제공자 화면으로 떠난다 — 여기로 돌아오지 않는다.
      await signInWithProvider(provider);
    } catch (e) {
      setError(identityError(e));
      setOauthBusy(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    // 이메일은 소문자로 눕힌다 — iOS가 첫 글자를 대문자로 바꿔 보내는 일이 잦다
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      // 자격증명 오류는 계정 존재 여부가 새지 않게 문구를 하나로 통일한다.
      // 그 외(제공자 꺼짐·네트워크 등)는 구분해서 보여준다 — 안 그러면
      // 설정 문제를 "비밀번호 틀림"으로 오인해 원인을 못 찾는다.
      const credential = /invalid login credentials/i.test(signInError.message);
      setError(
        credential
          ? "이메일 또는 비밀번호가 맞지 않아요."
          : `로그인에 실패했어요 (${signInError.message})`,
      );
      setBusy(false);
      return;
    }

    // ⚠️ router.replace를 쓰면 안 된다. AuthProvider는 루트 레이아웃에 있어
    // 클라이언트 이동으로는 다시 초기화되지 않고, **이전 익명 userId를 그대로
    // 들고** 조회한다 → 프로필이 없다고 판단해 온보딩("닉네임부터")으로 보내고
    // 데이터가 안 보인다. 전체 페이지 로드로 세션을 처음부터 다시 읽게 한다.
    //
    // ⚠️ 챌린지 초대가 기다리고 있으면 홈이 아니라 그쪽으로 보낸다 (2026-08-08).
    //    초대 링크를 탭했다가 "이미 계정이 있나요? 로그인"으로 넘어온 사람인데,
    //    홈에 떨어뜨리면 **초대가 조용히 사라진다.** `/auth/callback`이 소셜
    //    로그인에서 하는 것과 같은 처리다.
    window.location.assign(pendingChallengeInvitePath() ?? APP_LANDING_PATH);
  }

  return (
    /* 시안: `original-extracts/login-original-approved.png` (2026-10-06 사용자 결정 — 온보딩·닉네임·
       로그인 세 화면을 한 벌로). 사진·로고·버튼은 온보딩과 같은 `brand/entry.tsx`를 쓴다 —
       2026-08-08에 로그인만 옛 텍스트 로고로 남아 두 화면이 딴 앱처럼 보였던 적이 있다.

       ⚠️ 시안의 `비밀번호 찾기`는 **넣지 않았다.** GND에는 비밀번호 재설정 기능이 없다
          (`resetPasswordForEmail`을 부르는 곳이 없다). 누를 수 없는 글자를 두면 화면이 거짓말을 한다.
       ⚠️ 글자는 **아래에 붙인다**(`mt-auto`). 폰이 짧으면 머리말 바로 밑에서 시작하고 화면이 스크롤된다. */
    <main className="relative flex flex-1 flex-col overflow-y-auto text-left">
      {/* 남자 선수 사진은 위 30%에 인물이 있고 아래는 원래 어둡다 — 화면 맨 위에 붙인다 */}
      <EntryPhoto src={LOGIN_PHOTO} top="0px" lift="0px" />
      <header
        className="relative z-10 px-6"
        style={{ paddingTop: "max(2rem, calc(env(safe-area-inset-top) + 1rem))" }}
      >
        <EntryTopShade />
        <BrandWordmark />
      </header>

      <div
        className="relative mt-auto w-full px-6 pt-16"
        style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}
      >
        <EntryFade reach="top-0" />
        {/* ⚠️ 옛 문구는 `돌아오셨군요! 기록은 그대로예요`였다(2026-08-10). 새 시안 문구로 바꿨다.
            설치 직후(`fromInstalled`)에는 여전히 다른 말을 한다 — 아래 주석. */}
        {/* ⚠️ 설치 직후 문구(`한 번만 다시 로그인해요`)는 더 길어서 같은 크기면 `해/요`로 쪼개졌다
            (2026-10-06 실측). 그 경우만 작게 하고, 한국어 낱말이 중간에서 끊기지 않게 `break-keep`. */}
        <h1
          className={`relative break-keep leading-[1.15] font-black tracking-[-0.03em] ${
            fromInstalled ? "text-[clamp(1.6rem,7.4vw,2rem)]" : "text-[clamp(2rem,9vw,2.5rem)]"
          }`}
        >
          {fromInstalled ? "한 번만 다시 로그인해요" : COPY.heading}
        </h1>
        {!fromInstalled && (
          <p className="relative mt-2 text-[16px] text-text/85">{COPY.subcopy}</p>
        )}

        {/* ⚠️ 설치 직후에만 나온다. "새로 가입하지 마세요"를 말하지 않으면
            사람들이 아래 "처음이신가요? 회원가입하기"를 누르고 기록이 갈린다. */}
        {fromInstalled && (
          <p className="relative mt-3 flex gap-2 rounded-2xl border border-accent/40 bg-accent-weak/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text/85">
            <Icon name="shield" size={16} className="mt-0.5 text-accent" />
            <span>
              기록은 그대로 있어요. 아까 사파리에서 쓰던{" "}
              <b className="text-text">같은 버튼</b>을 누르세요 — 새로 가입하면{" "}
              <b className="text-text">기록이 따로 생겨요.</b>
            </span>
          </p>
        )}

        {providers.length > 0 && (
          <div className="relative mt-6 flex flex-col gap-3">
            {providers.map((p) => (
              <ProviderButton
                key={p}
                provider={p}
                onClick={() => void handleOAuth(p)}
                disabled={oauthBusy !== null}
                label={
                  oauthBusy === p
                    ? "이동 중…"
                    : `${PROVIDER_META[p].short}${COPY.providerSuffix}`
                }
              />
            ))}
            {googleBlocked && <GoogleBlockedNote />}
            {/* 이메일 폼을 없애지 않는다. 카카오·구글이 둘 다 없는 사용자의
                탈출구이고, 이미 이메일로 붙은 계정이 있다(설계 §5.6). */}
            <div className="mt-3 flex items-center gap-3 text-[13px] text-muted">
              <span aria-hidden className="h-px flex-1 bg-line-strong" />
              {COPY.divider}
              <span aria-hidden className="h-px flex-1 bg-line-strong" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative mt-4 flex w-full flex-col gap-3">
          {/* ⚠️ 칸 위 글자 라벨은 시안에 없어서 뺐지만 **화면 낭독용 라벨은 남긴다**(`sr-only`).
              무엇을 넣는 칸인지는 왼쪽 아이콘(봉투·자물쇠)이 보여 준다. */}
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-line-strong bg-surface/90 px-4 focus-within:border-accent">
            <Icon name="mail" size={20} className="text-muted" />
            <label htmlFor="login-email" className="sr-only">
              이메일
            </label>
            {/* autoCapitalize·autoCorrect가 없으면 iOS가 첫 글자를 대문자로 바꿔
                "Atty2@..."로 보내고, 사용자는 이유를 모른 채 실패만 본다 */}
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={COPY.emailPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
            />
          </div>

          {/* ⚠️ `<label>`로 감싸지 마라 — 안에 보기 버튼이 있어서, 라벨이 입력칸 말고 다른
              조작 요소를 품게 된다(HTML 규칙 위반, 라벨을 누르면 엉뚱한 쪽이 반응할 수 있다). */}
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-line-strong bg-surface/90 px-4 focus-within:border-accent">
            <Icon name="lock" size={20} className="text-muted" />
            <label htmlFor="login-password" className="sr-only">
              비밀번호
            </label>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={COPY.passwordPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
            />
            {/* 임시 비밀번호는 대소문자가 섞여 폰에서 틀리기 쉽다.
                무엇을 쳤는지 볼 수 있어야 스스로 고칠 수 있다. */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-pressed={showPassword}
              className="-mr-2 flex h-10 w-10 flex-none items-center justify-center text-muted"
            >
              <Icon name={showPassword ? "hide" : "eye"} size={20} />
            </button>
          </div>

          {error && (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="mt-2">
            <LimeCta type="submit" busy={busy}>
              {busy ? "로그인 중…" : COPY.primary}
            </LimeCta>
          </div>
        </form>

        <Link
          href="/onboarding"
          aria-label={`${COPY.signupLead} ${COPY.signup}`}
          className="relative mx-auto mt-5 flex w-fit items-center gap-1.5 py-1 text-[14px] text-muted"
        >
          {COPY.signupLead}
          <span className="font-extrabold text-text underline decoration-2 underline-offset-[5px]">
            {COPY.signup}
          </span>
          <Icon name="arrow" size={16} strokeWidth={2.2} className="text-text" />
        </Link>
      </div>
    </main>
  );
}

/** 시안 2번(로그인)의 남자 선수 사진 — 글자 없는 판 */
const LOGIN_PHOTO = "/gnd/photos/login-sweat-860.webp";
