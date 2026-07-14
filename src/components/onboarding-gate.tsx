"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getMyProfile } from "@/lib/crew";

/**
 * 탭 화면 진입 시 프로필이 없으면 온보딩으로 보낸다.
 * (익명 인증은 되지만 아직 닉네임을 안 정한 첫 방문자)
 */
export function OnboardingGate() {
  const { userId, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId || checked) return;
    let cancelled = false;

    getMyProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        setChecked(true);
        if (!profile) router.replace("/onboarding");
      })
      .catch(() => {
        // 테이블 미생성 등 — 화면은 그대로 두고 콘솔에만
        setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, checked, router, pathname]);

  return null;
}
