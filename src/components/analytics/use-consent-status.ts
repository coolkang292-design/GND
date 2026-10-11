"use client";

import { useSyncExternalStore } from "react";
import { readConsent, subscribeConsent, type ConsentStatus } from "@/lib/posthog/consent";

/**
 * 분석 동의 상태를 React에서 구독한다. 서버 렌더에서는 `unset`.
 *
 * 화면 진입 시 한 번만 기록하는 사실(`landing_opened`·`onboarding_started`)이 이 값을 effect
 * 의존성에 넣는 이유: 첫 방문자는 보통 그 화면에서 **나중에** 동의한다. 의존성이 없으면 동의
 * 순간 PostHog에 그 사실이 영영 안 남고, PostHog 퍼널은 첫 단계가 없는 사람을 통째로 뺀다.
 */
export function useConsentStatus(): ConsentStatus {
  return useSyncExternalStore(subscribeConsent, readConsent, () => "unset" as const);
}
