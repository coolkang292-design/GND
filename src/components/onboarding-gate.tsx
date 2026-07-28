"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getMyProfile } from "@/lib/crew";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 탭 화면 진입 시 프로필이 없으면 온보딩으로 보낸다.
 * (익명 인증은 되지만 아직 닉네임을 안 정한 첫 방문자)
 *
 * ⚠️ 프로필 없음을 곧바로 믿으면 안 된다. getMyProfile은 maybeSingle이라
 * **RLS가 걸러 0행이 와도 에러 없이 null**을 준다 — 토큰이 아직 안 붙었거나
 * 잠깐 무효인 순간에 조회하면 멀쩡한 사용자도 null을 받는다. 그대로 보내면
 * 기존 크루원이 아무 경고 없이 온보딩으로 튕기고, 거기서 "다음"을 누르면
 * 새 계정이 생겨 기록·XP·배지와 분리된다.
 *
 * 그래서 null일 때는 **세션이 진짜 유효한지 서버에 확인한 뒤에만** 보낸다.
 * getUser()는 토큰을 서버에서 검증하므로 인증 문제면 여기서 걸린다.
 */
const MAX_ATTEMPTS = 4;

export function OnboardingGate() {
  const { userId, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!configured || loading || !userId || checked) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    getMyProfile(userId)
      .then(async (profile) => {
        if (cancelled) return;

        if (profile) {
          setChecked(true);
          return;
        }

        // 프로필이 없다고 나왔다 — 진짜 신규인지, 토큰 문제로 RLS가 가린 건지
        // 서버에 물어 확인한다. 확인 못 하면 **보내지 않는다**(기존 사용자를
        // 잘못 튕기는 쪽이 신규 사용자가 온보딩을 한 번 늦게 보는 것보다 훨씬 나쁘다).
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;

        if (error || !data.user) {
          if (attempt < MAX_ATTEMPTS) {
            retryTimer = setTimeout(() => setAttempt((a) => a + 1), 800);
          } else {
            setChecked(true); // 지속 실패 — 화면은 그대로 두고 보내지 않는다
          }
          return;
        }

        setChecked(true);
        router.replace("/onboarding");
      })
      .catch(() => {
        if (cancelled) return;
        // 인증 직후 토큰 전파 전 401 등 일시 오류 — 포기하면 온보딩을
        // 영영 안 띄우게 되므로 잠깐 뒤 재시도한다
        if (attempt < MAX_ATTEMPTS) {
          retryTimer = setTimeout(() => setAttempt((a) => a + 1), 800);
        } else {
          setChecked(true); // 테이블 미생성 등 지속 오류 — 화면은 그대로
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [configured, loading, userId, checked, attempt, router, pathname]);

  return null;
}
