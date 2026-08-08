"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/crew";

/**
 * 카카오·구글에서 돌아오는 착지점 (설계 §5.4).
 *
 * ⚠️ `(tabs)` 밖에 둔다. 안에 두면 `OnboardingGate`가 돌면서 **방금 신원을 붙인
 * 사람을 온보딩으로 밀어낸다** — `/login`·`/account`를 밖에 둔 것과 같은 이유다.
 *
 * 갈라 보내는 기준은 **프로필 유무**다. 쿼리스트링에 "어디서 왔는지"를 싣지
 * 않는다 — 주소창·기록에 남고, 사용자가 링크를 저장하면 엉뚱한 곳으로 간다.
 *   · 프로필 없음 = 온보딩 도중에 붙였다 → `/onboarding`으로 돌려보내 닉네임을 마저 받는다
 *   · 프로필 있음 = 기존 사용자가 계정을 지켰다 → `/account`에서 결과를 보여준다
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      // useSearchParams를 쓰지 않는다 — Suspense 경계를 요구해서 이 화면 하나
      // 때문에 빌드가 깨진다. 착지 직후 한 번만 읽으면 되는 값이다.
      const params = new URLSearchParams(window.location.search);

      // 사용자가 동의 화면을 닫은 경우. 되돌릴 것이 없으므로 **조용히** 원래
      // 흐름으로 보낸다(설계 §5.5). 오류를 띄우면 취소한 사람을 탓하는 화면이 된다.
      if (params.get("error")) {
        await leave();
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const code = params.get("code");

      // @supabase/ssr의 createBrowserClient는 detectSessionInUrl이 켜져 있어
      // `?code=`를 **스스로 교환한다.** 그래서 무조건 교환하면 "이미 쓴 코드"로
      // 실패한다. 세션이 아직 없을 때만 우리가 교환한다.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session && code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(
            "연결을 마치지 못했어요. 잠시 뒤 다시 시도해 주세요.",
          );
          return;
        }
      }

      await leave();
    }

    /** 프로필 유무로 갈라 보낸다. 조회가 실패해도 갇히지 않게 온보딩으로 보낸다. */
    async function leave() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let hasProfile = false;
      if (user) {
        try {
          hasProfile = (await getMyProfile(user.id)) !== null;
        } catch {
          // 일시적인 조회 실패. 온보딩은 프로필이 있으면 알아서 넘어가므로
          // 여기서 잘못 보내도 사용자가 갇히지 않는다.
        }
      }

      // ⚠️ router.replace가 아니라 **전체 페이지 로드**다. `AuthProvider`가 루트
      // 레이아웃에 있어 클라이언트 이동으로는 세션을 다시 읽지 않고, **연결 전의
      // userId를 그대로 들고** 조회한다(`/login`이 같은 이유로 이렇게 한다).
      window.location.assign(hasProfile ? "/account" : "/onboarding");
    }

    void run();
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">🔐</div>
      {error ? (
        <p className="text-sm font-semibold text-warn">{error}</p>
      ) : (
        <p className="text-sm text-muted">계정을 연결하는 중…</p>
      )}
    </main>
  );
}
