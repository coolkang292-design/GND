"use client";

import { useAuth } from "@/components/auth-provider";

/**
 * 인증이 **깨졌을 때만** 말한다.
 *
 * ⚠️⚠️ **정상일 때는 아무것도 그리지 않는다** (사용자 지시 2026-09-02).
 *    예전에는 홈에 `✅ 익명 인증됨 · 5c25117d…`를 늘 띄웠는데 셋 다 틀렸다:
 *      ① **사실이 아니다** — 카카오·구글로 올라온 **정식 계정에도** "익명"이라고 했다.
 *         2026-09-02에 픽스처 A(이메일 계정)로 홈을 열었더니 그대로 나왔다
 *      ② 사용자에게 의미가 없다 — 내부 용어이고, 보고 나서 할 수 있는 행동이 없다
 *      ③ **사용자 id 앞 8자리를 홈 화면에 노출**했다
 *    첫 스캐폴딩의 디버그 표시가 그대로 운영까지 나가 있던 것이다.
 *
 * ⚠️ **실패·미설정 안내는 남긴다. 지우지 마라.** 인증이 깨지면 홈의 카드들이
 *    조용히 비는데, 그 이유를 말해 주는 곳이 여기뿐이다
 *    (`friend-board-card.tsx:505`가 "빈 카드를 그리는 것이 오히려 거짓말"인 근거로
 *     이 컴포넌트를 가리킨다).
 *
 * ⚠️ `home-client.tsx`에서 **마운트는 유지한다** — 실패 안내가 사라지면 안 되고,
 *    `home-client.order.test.ts`가 `<AuthStatus`가 남아 있는지 단언한다.
 */
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

  // 발급 중 — 몇백 ms면 끝나고 사용자가 할 수 있는 일이 없다. 조용히 있는다.
  // (예전 문구 "익명 신원 발급 중…"도 정식 계정에게 틀린 말이었다.)
  if (loading) return null;

  if (!userId) {
    return (
      <div className="rounded-card-sm border border-line bg-surface p-3 text-xs text-warn">
        인증 실패{error ? ` — ${error}` : ""}
        {!error &&
          " — 로그인이 풀렸을 수 있어요. 새로고침해도 그대로면 다시 로그인해 주세요."}
      </div>
    );
  }

  // 정상 — 아무것도 그리지 않는다. 위 주석의 ①②③이 이유다.
  return null;
}
