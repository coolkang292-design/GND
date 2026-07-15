"use client";

import { useAuth } from "@/components/auth-provider";

export function AuthStatus() {
  const { configured, loading, userId, error } = useAuth();

  if (!configured) {
    return (
      <div className="rounded-card-sm border border-line bg-surface-2 p-3 text-xs text-muted">
        ⚠️ Supabase 미설정 — <code>.env.local</code>에{" "}
        <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 넣으면 익명 인증이
        활성화됩니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-card-sm border border-line bg-surface p-3 text-xs text-muted">
        익명 신원 발급 중…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-card-sm border border-line bg-surface p-3 text-xs text-warn">
        익명 인증 실패{error ? ` — ${error}` : ""}
        {!error && " — Supabase 프로젝트에서 Anonymous Sign-in을 켰는지 확인하세요."}
      </div>
    );
  }

  return (
    <div className="rounded-card-sm border border-line bg-surface p-3 text-xs text-muted">
      ✅ 익명 인증됨 · <span className="font-mono">{userId.slice(0, 8)}…</span>
    </div>
  );
}
