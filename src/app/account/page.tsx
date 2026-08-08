"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PROVIDER_META,
  enabledProviders,
  getMyIdentities,
  identityError,
  linkProvider,
  type OAuthProvider,
} from "@/lib/identity";

/**
 * 계정 화면 — 신원 연결·이메일 확인·비밀번호 변경.
 *
 * `(tabs)` 밖에 둔다: OnboardingGate가 돌면 프로필 조회가 잠깐 비어도 온보딩으로
 * 밀려나는데, 계정을 손보러 온 사람에게 그건 최악의 흐름이다.
 *
 * ⚠️ **로그아웃 잠금의 기준이 2026-08-08에 바뀌었다: 이메일 → 신원(identity).**
 * 익명 계정은 이 브라우저 저장소에만 존재해서, 로그아웃하면 기록·XP·배지로
 * 돌아올 방법이 영영 없다(실제로 발생했던 사고다). 그래서 **돌아올 문이 하나라도
 * 있을 때만** 나가는 문을 연다. 이제 그 문은 이메일뿐 아니라 카카오·구글도 된다.
 * 기준을 이메일로 되돌리면 카카오만 붙인 사람이 영영 로그아웃하지 못한다.
 *
 * 이메일 자체 연결 폼은 여전히 없다 — Supabase 확인 메일 발송 한도(429)에 막혀
 * 실패하는 것을 2026-08-08에 실측했다. 그래서 메일을 안 쓰는 OAuth로 간다.
 */
const MIN_PASSWORD_LENGTH = 6;

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [identities, setIdentities] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [linking, setLinking] = useState<OAuthProvider | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
      try {
        const list = await getMyIdentities();
        if (!cancelled) setIdentities(list);
      } catch {
        // 조회 실패는 **빈 목록**으로 둔다. 그러면 로그아웃이 잠긴 채로 남는다 —
        // 못 나가는 것보다 못 돌아오는 쪽이 훨씬 나쁘므로 fail-closed다.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 돌아올 문이 하나라도 있으면 나가도 된다.
   *
   * ⚠️ **이메일을 조건에서 빼지 마라.** 이메일+비밀번호는 `/login`으로 실제로
   * 돌아올 수 있는 문이다. `identities`만 보면, 이메일은 붙었는데 신원 행이 없는
   * 계정(관리자 API로 이메일만 세팅한 경우)이 **영영 로그아웃하지 못한다.**
   *
   * 2026-08-08 실측 — 운영 계정 5개는 전부 `email` 신원을 갖고 있어서 지금은 두
   * 조건이 같은 답을 낸다. 그래도 `email`을 남기는 이유는 `link-email-to-account.mjs`가
   * 신원 행 없이 이메일만 붙일 수 있는 경로이기 때문이다.
   * (⚠️ 확인할 때 `GET /auth/v1/admin/users` **목록**을 쓰지 마라 — `identities`를
   *  안 준다. 개별 조회 `/admin/users/{id}`여야 나온다. 이걸로 한 번 헛짚었다.)
   */
  const isProtected = identities.length > 0 || Boolean(email);

  /**
   * 화면에 "연결됨"으로 그릴 목록.
   * 위와 같은 이유로 이메일은 `identities`가 아니라 `email` 값에서 만든다 —
   * 신원 행이 없어도 사용자에게는 분명히 붙어 있는 것이다.
   */
  const connected: string[] = [
    ...identities.filter((p) => p !== "email"),
    ...(email && !identities.includes("email") ? ["email"] : []),
    ...(identities.includes("email") ? ["email"] : []),
  ];
  const linkable = enabledProviders().filter((p) => !identities.includes(p));

  async function handleLink(provider: OAuthProvider) {
    if (linking) return;
    setLinking(provider);
    setLinkError(null);
    try {
      // 성공하면 브라우저가 제공자 화면으로 떠나므로 여기로 돌아오지 않는다.
      await linkProvider(provider);
    } catch (e) {
      setLinkError(identityError(e));
      setLinking(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
      return;
    }
    if (password !== confirm) {
      setError("두 번 입력한 비밀번호가 서로 달라요.");
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(`변경하지 못했어요 (${updateError.message})`);
      setBusy(false);
      return;
    }

    setDone(true);
    setPassword("");
    setConfirm("");
    setBusy(false);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(`로그아웃하지 못했어요 (${signOutError.message})`);
      setSigningOut(false);
      setConfirmingSignOut(false);
      return;
    }
    // 로그인과 같은 이유로 **전체 페이지 로드**를 쓴다. AuthProvider가 루트
    // 레이아웃에 있어 클라이언트 이동으로는 세션 상태를 처음부터 다시 읽지
    // 않는다. /login에서는 익명 계정을 발급하지 않으므로 로그아웃이 유지된다.
    window.location.assign("/login");
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <Link
          href="/profile"
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-lg"
        >
          ←
        </Link>
        <h1 className="text-base font-extrabold">계정</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {/* ⚠️ 이 카드가 "계정 지키기"의 전부다. 여기서 하나라도 붙이면 브라우저를
            지워도 기록으로 돌아올 수 있고, 안 붙이면 못 돌아온다. 그 사실을
            흐리게 적지 마라 — 사용자가 무엇을 잃는지 알아야 누른다. */}
        <section className="rounded-card border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-bold">계정 지키기</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {!ready
              ? "확인 중…"
              : isProtected
                ? "이 계정은 지켜지고 있어요. 브라우저를 지워도 아래 방법으로 다시 들어올 수 있어요."
                : "지금 이 계정은 이 브라우저에만 있어요. 브라우저 데이터를 지우면 기록·XP·배지에 다시 접근할 수 없어요."}
          </p>

          {ready && connected.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {connected.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 rounded-card-sm bg-surface-2 px-3 py-2 text-[13px]"
                >
                  <span className="text-good">✓</span>
                  <b className="font-bold">
                    {p === "email"
                      ? "이메일"
                      : (PROVIDER_META[p as OAuthProvider]?.short ?? p)}
                  </b>
                  <span className="text-muted">연결됨</span>
                  {p === "email" && email && (
                    <span className="ml-auto break-all text-[11px] text-faint">
                      {email}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {ready && linkable.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {linkable.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void handleLink(p)}
                  disabled={linking !== null}
                  className="h-11 w-full rounded-full border border-line bg-surface-2 text-sm font-extrabold disabled:opacity-60"
                >
                  {linking === p ? "이동 중…" : PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          )}

          {/* 플래그가 비어 있으면(§5.3 설정 전) 버튼이 하나도 없다. 그때 아무 말도
              없으면 "지켜지지 않았다"는 경고만 남아 사용자가 할 일을 못 찾는다. */}
          {ready && !isProtected && linkable.length === 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              <b className="text-fg">지금은 연결 수단이 꺼져 있어요.</b> 크루장에게
              알려 주세요.
            </p>
          )}

          {linkError && (
            <p className="mt-3 text-[13px] text-red-400" role="alert">
              {linkError}
            </p>
          )}
        </section>

        {ready && email && (
          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-bold">비밀번호 변경</h2>
            <p className="mt-1 text-xs text-muted">
              처음 받은 임시 비밀번호는 바꾸는 게 좋아요.
            </p>

            <form onSubmit={handleSubmit} className="mt-4">
              <div className="flex items-baseline justify-between">
                <label className="text-[11px] font-bold text-muted">
                  새 비밀번호
                </label>
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="text-[11px] text-muted underline"
                >
                  {show ? "숨기기" : "보기"}
                </button>
              </div>
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setDone(false);
                }}
                placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] outline-none focus:border-accent"
              />

              <label className="mt-3 block text-[11px] font-bold text-muted">
                한 번 더 입력
              </label>
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setDone(false);
                }}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] outline-none focus:border-accent"
              />

              {error && (
                <p className="mt-3 text-[13px] text-red-400" role="alert">
                  {error}
                </p>
              )}
              {done && (
                <p className="mt-3 text-[13px] text-green-400" role="status">
                  비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-5 w-full rounded-full bg-accent py-3.5 text-[15px] font-extrabold text-black disabled:opacity-60"
              >
                {busy ? "변경 중…" : "비밀번호 변경"}
              </button>
            </form>
          </section>
        )}

        {/* ⚠️ 조건이 `email`이 아니라 `isProtected`다. 이메일로 되돌리면 카카오만
            붙인 사람이 영영 로그아웃하지 못한다. */}
        {ready && isProtected && (
          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-bold">로그아웃</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              이 기기에서 나갑니다. 기록은 그대로 남고, 위에 연결한 방법으로 다시
              로그인하면 돌아와요.
            </p>

            {confirmingSignOut ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingSignOut(false)}
                  disabled={signingOut}
                  className="h-11 flex-1 rounded-full border border-line bg-surface-2 text-sm font-bold disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="h-11 flex-1 rounded-full border border-red-500/60 bg-red-500/10 text-sm font-extrabold text-red-400 disabled:opacity-60"
                >
                  {signingOut ? "나가는 중…" : "로그아웃"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingSignOut(true)}
                className="mt-4 h-11 w-full rounded-full border border-line bg-surface-2 text-sm font-bold"
              >
                로그아웃
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
