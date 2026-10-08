"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAnalyticsConfigured } from "@/lib/posthog/config";
import { readConsent, subscribeConsent } from "@/lib/posthog/consent";
import { CONSENT_COPY as COPY } from "@/lib/posthog/consent-copy";
import {
  declineOrWithdrawAnalyticsConsent,
  grantAnalyticsConsent,
} from "@/lib/posthog/consent-actions";
import { isExcludedPath } from "@/lib/posthog/exclusion";

/**
 * 분석 동의 안내 — 아직 고르지 않은 사람에게만, 키가 설정된 환경에서만 뜬다.
 *
 * ⚠️ **위쪽**에 둔다. 아래에 두면 `/login`·`/onboarding`의 시작 버튼을 가린다 —
 *    가입 퍼널을 재려고 만든 안내가 가입 퍼널을 막으면 안 된다.
 * ⚠️ "동의"와 "거부"는 같은 크기·같은 모양이다. 기본 선택은 없다.
 * ⚠️ 서버 스냅샷은 `granted`(= 숨김)다. 서버가 그린 것과 하이드레이션 값이 다르면
 *    깜빡이므로, 클라이언트에서 저장된 값을 읽은 뒤에만 나타난다.
 */
export function AnalyticsConsentBanner() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => "granted" as const,
  );

  if (!isAnalyticsConfigured()) return null;
  if (consent !== "unset") return null;
  if (isExcludedPath(pathname)) return null;

  const btn =
    "h-10 flex-1 rounded-full border border-line bg-surface-2 text-sm font-bold text-fg";

  return (
    <div
      role="dialog"
      aria-label={COPY.title}
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[80] w-[calc(100%-16px)] max-w-[414px] -translate-x-1/2 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <h2 className="text-sm font-bold">{COPY.title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{COPY.body}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => declineOrWithdrawAnalyticsConsent()}
        >
          {COPY.decline}
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => void grantAnalyticsConsent()}
        >
          {COPY.accept}
        </button>
      </div>
      <Link
        href="/privacy"
        className="mt-2 block text-center text-[11px] text-muted underline"
      >
        {COPY.detail}
      </Link>
    </div>
  );
}
