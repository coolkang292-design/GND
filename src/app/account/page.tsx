"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 계정 화면 — 이메일 확인과 비밀번호 변경.
 *
 * `(tabs)` 밖에 둔다: OnboardingGate가 돌면 프로필 조회가 잠깐 비어도 온보딩으로
 * 밀려나는데, 계정을 손보러 온 사람에게 그건 최악의 흐름이다.
 *
 * 이메일이 아직 없는(익명) 계정에는 **연결 폼을 보여주지 않는다.** 조사 결과
 * Supabase가 확인 메일 발송 제한에 걸려 자체 연결이 실패하기 때문이다. 될지
 * 안 될지 모르는 버튼을 두는 대신, 무엇을 해야 하는지 문장으로 알려준다.
 */
const MIN_PASSWORD_LENGTH = 6;

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <section className="rounded-card border border-line bg-surface p-4 shadow-card">
          <p className="text-xs text-muted">로그인 이메일</p>
          <p className="mt-1 break-all text-sm font-bold">
            {!ready ? "확인 중…" : (email ?? "아직 연결되지 않음")}
          </p>
          {ready && !email && (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              이 계정은 이 브라우저에만 있습니다. 브라우저 데이터를 지우면
              기록·XP·배지에 다시 접근할 수 없어요.{" "}
              <b className="text-fg">크루장에게 이메일 연결을 요청하세요.</b>
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
      </div>
    </main>
  );
}
