"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { isAnalyticsConfigured } from "@/lib/posthog/config";
import { readConsent, subscribeConsent } from "@/lib/posthog/consent";
import { CONSENT_COPY as COPY } from "@/lib/posthog/consent-copy";
import {
  declineOrWithdrawAnalyticsConsent,
  grantAnalyticsConsent,
} from "@/lib/posthog/consent-actions";

/**
 * `/account`의 분석 동의 설정 — **철회가 여기서 된다.**
 *
 * 키가 없는 환경에서는 아무것도 그리지 않는다 (`BlockedUsersSection`과 같은 규약:
 * 해당이 없으면 빈 카드를 두지 않는다).
 */
export function AnalyticsConsentSetting() {
  const consent = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => "unset" as const,
  );
  if (!isAnalyticsConfigured()) return null;

  const on = consent === "granted";

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{COPY.settingTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {on ? COPY.settingOn : COPY.settingOff}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={COPY.settingTitle}
          onClick={() =>
            on ? declineOrWithdrawAnalyticsConsent() : void grantAnalyticsConsent()
          }
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border border-line transition-colors ${
            on ? "bg-accent" : "bg-surface-2"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              on ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {COPY.withdrawNote}{" "}
        <Link href="/privacy" className="underline">
          {COPY.detail}
        </Link>
      </p>
    </section>
  );
}
