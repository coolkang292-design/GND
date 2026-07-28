"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 이메일 로그인 — 익명 계정을 이메일로 승격한 사용자가 다시 들어오는 문
 *
 * 왜 필요한가: 익명 인증만 쓰면 계정이 브라우저 저장소에만 있어서, 저장소가
 * 비워지면 기록·XP·배지에 영영 접근할 수 없다(실제로 발생했다). 이메일이
 * 붙어 있으면 어떤 기기·브라우저에서든 같은 계정으로 돌아올 수 있다.
 *
 * `(tabs)` 밖에 둔다 — OnboardingGate가 돌면 로그인하러 온 사람을 온보딩으로
 * 밀어내 버린다.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    window.location.assign("/home");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl font-black italic tracking-tight text-accent">
        🏋️ GND
      </p>
      <p className="mt-1 text-[10px] font-bold tracking-[0.3em] text-accent/80">
        NO EXCUSES. JUST RESULTS.
      </p>
      <h1 className="mt-4 text-xl font-extrabold">로그인</h1>
      <p className="mt-1 text-[13px] text-muted">
        이메일을 연결한 계정으로 돌아옵니다.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 w-full max-w-[320px]">
        <label className="mt-3 block text-left text-[11px] font-bold text-muted">
          이메일
        </label>
        {/* autoCapitalize·autoCorrect가 없으면 iOS가 첫 글자를 대문자로 바꿔
            "Atty2@..."로 보내고, 사용자는 이유를 모른 채 실패만 본다 */}
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
        />

        <div className="mt-4 flex items-baseline justify-between">
          <label className="text-left text-[11px] font-bold text-muted">
            비밀번호
          </label>
          {/* 임시 비밀번호는 대소문자가 섞여 폰에서 틀리기 쉽다.
              무엇을 쳤는지 볼 수 있어야 스스로 고칠 수 있다. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-[11px] text-muted underline"
          >
            {showPassword ? "숨기기" : "보기"}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
        />

        {error && (
          <p className="mt-3 text-[13px] text-red-400" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-full bg-accent py-3.5 text-[15px] font-extrabold text-black disabled:opacity-60"
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>

      <Link href="/onboarding" className="mt-5 text-[13px] text-muted underline">
        처음이신가요? 시작하기
      </Link>
    </main>
  );
}
