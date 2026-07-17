"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getMyProfile } from "@/lib/crew";

/**
 * 탭 화면 진입 시 프로필이 없으면 온보딩으로 보낸다.
 * (익명 인증은 되지만 아직 닉네임을 안 정한 첫 방문자)
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
      .then((profile) => {
        if (cancelled) return;
        setChecked(true);
        if (!profile) router.replace("/onboarding");
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
