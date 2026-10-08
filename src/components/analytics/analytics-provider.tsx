"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { isAnalyticsConfigured } from "@/lib/posthog/config";
import { readConsent, subscribeConsent } from "@/lib/posthog/consent";
import { applyInternalFlagFromSearch } from "@/lib/posthog/exclusion";
import { syncAnalytics } from "@/lib/posthog/client";

/**
 * 동의·사용자·경로가 바뀔 때 PostHog를 맞춘다. 루트 레이아웃의 `AuthProvider` **안**에 둔다.
 *
 * - 키가 없으면 아무것도 하지 않는다 (효과가 돌지만 곧바로 빠져나온다).
 * - 동의 전에는 SDK를 내려받지 않는다 (`syncAnalytics`가 `teardown`만 한다 — SDK가 없으면 빈 동작).
 * - `distinct_id`는 Supabase `auth.uid()`다. 사용자가 바뀌면 `client.ts`가 reset 후 새로 식별한다.
 *
 * ⚠️ `is_anonymous`는 **세션의 값**을 쓴다. 승격 직후의 옛 토큰은 `true`를 들고 있으므로
 *    (auth/callback이 `refreshSession`으로 갱신한다), `onAuthStateChange`로 갱신 값을 따라간다.
 *
 * 렌더는 아무것도 하지 않는다 (`FunnelTracker`와 같은 규약).
 */
export function AnalyticsProvider() {
  const { userId } = useAuth();
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "unset" as const);
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
    void syncAnalytics({ userId, isAnonymous, pathname });
  }, [consent, userId, isAnonymous, pathname]);

  return null;
}
