"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // 원인을 구체적으로 알려주면 계정 존재 여부가 새므로 문구는 하나로 둔다
      setError("이메일 또는 비밀번호가 맞지 않아요.");
      setBusy(false);
      return;
    }

    // 로그인하면 익명 세션이 이 계정으로 바뀐다. 홈이 새 세션으로 그리도록
    // replace + refresh를 함께 쓴다.
    router.replace("/home");
    router.refresh();
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
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none focus:border-accent"
        />

        <label className="mt-4 block text-left text-[11px] font-bold text-muted">
          비밀번호
        </label>
        <input
          type="password"
          autoComplete="current-password"
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
