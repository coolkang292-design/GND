"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isAnalyticsConfigured } from "@/lib/posthog/config";
import { useConsentStatus } from "./use-consent-status";
import { applyInternalFlagFromSearch } from "@/lib/posthog/exclusion";
import { syncAnalytics } from "@/lib/posthog/client";

/**
 * 동의·사용자·경로가 바뀔 때 PostHog를 맞춘다. 루트 레이아웃의 `AuthProvider` **안**에 둔다.
 *
 * - 키가 없으면 아무것도 하지 않는다 (효과가 돌지만 곧바로 빠져나온다).
 * - 동의 전에는 SDK를 내려받지 않는다 (`syncAnalytics`가 `teardown`만 한다 — SDK가 없으면 빈 동작).
 * - `distinct_id`는 Supabase `auth.uid()`다. 사용자가 바뀌면 `client.ts`가 reset 후 새로 식별한다.
 *
 * ⚠️⚠️ **로그인 확인 중(`loading`)에는 동기화하지 않는다** (2026-10-11 로컬 브라우저에서 발견).
 *    페이지가 새로 뜰 때 `useAuth()`는 잠깐 `userId=null, loading=true`를 준다. 그걸 그대로 넘기면
 *    `client.ts`가 **로그아웃**으로 보고 `reset()` → 곧이어 같은 사람을 다시 `identify`한다.
 *    새로고침·OAuth 복귀마다 `$identify`가 또 나가고 PostHog 세션 id가 새로 생겨 **세션 수가 부푼다**
 *    (사람 수는 같은 auth.uid라 그대로였다). 진짜 로그아웃은 `loading=false, userId=null`이다.
 *
 * ⚠️ `is_anonymous`는 **세션의 값**을 쓴다. 승격 직후의 옛 토큰은 `true`를 들고 있으므로
 *    (auth/callback이 `refreshSession`으로 갱신한다), `onAuthStateChange`로 갱신 값을 따라간다.
 *
 * 렌더는 아무것도 하지 않는다 (`FunnelTracker`와 같은 규약).
 */
export function AnalyticsProvider() {
  const { userId, loading } = useAuth();
  const pathname = usePathname();
  const consent = useConsentStatus();
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);

  // 내부 테스트 브라우저 표시(?gnd_internal=1). 동기화보다 먼저 돈다.
  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    applyInternalFlagFromSearch(window.location.search);
  }, []);

  // 동의했을 때만 세션을 읽는다.
  useEffect(() => {
    if (!isAnalyticsConfigured() || consent !== "granted" || !isSupabaseConfigured()) {
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const u = data.session?.user;
        setIsAnonymous(u ? u.is_anonymous === true : null);
      })
      .catch(() => {});
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const u = session?.user;
      setIsAnonymous(u ? u.is_anonymous === true : null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [consent]);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    if (loading) return; // 위 ⚠️⚠️ — 확인 중의 null은 로그아웃이 아니다
    void syncAnalytics({ userId, isAnonymous, pathname });
  }, [consent, userId, loading, isAnonymous, pathname]);

  return null;
}
