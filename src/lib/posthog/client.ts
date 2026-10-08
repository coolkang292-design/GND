/**
 * PostHog SDK 제어기 — **동의가 있을 때만 SDK를 내려받고, 철회하면 모두 걷어낸다.**
 *
 * 약속 (테스트 `client.test.ts`가 지킨다):
 *  1. 동의 전에는 `posthog-js`를 import조차 하지 않는다 → 네트워크·쿠키·저장소 0.
 *  2. 키가 없으면 아무것도 하지 않는다.
 *  3. 어떤 경우에도 던지지 않는다 — 분석이 앱을 죽이면 분석을 안 하느니만 못하다.
 *  4. 사용자 id가 바뀌면(A→B, 로그아웃) `reset()` 후 새 id로 식별한다.
 *     **이전 id를 새 id에 붙이지 않는다** (같은 사람이라는 증거가 앱에 없다).
 *  5. 철회 → `reset()` 다음에 `opt_out_capturing()`. 순서가 바뀌면 reset이 동의 상태를
 *     기본값(수집함)으로 되돌려 버린다(posthog-js 문서의 경고).
 */

import type { PostHog } from "posthog-js";
import { isAnalyticsConfigured, posthogHost, posthogKey, POSTHOG_US_UI_HOST } from "./config";
import { readConsent } from "./consent";
import { isExcludedPath, isExcludedUser, isInternalBrowser } from "./exclusion";
import {
  sanitizeOutgoing,
  sanitizePersonProps,
  type Primitive,
  type ProductEvent,
} from "./events";
import { readAcquisition } from "@/lib/acquisition";

export interface SyncInput {
  userId: string | null;
  /** 모르면 null (세션을 아직 못 읽음) */
  isAnonymous: boolean | null;
  pathname: string | null;
}

interface Queued {
  event: ProductEvent;
  props: Record<string, Primitive>;
  userId: string | null;
  at: number;
}

/**
 * 이 기기에서 PostHog가 마지막으로 식별한 사용자 id (동의 이후에만 쓴다).
 * 새로고침 때마다 같은 사람을 다시 `identify`(= `$identify` 이벤트 중복)하지 않으려는 표식이다.
 * 철회·reset 때 함께 지운다.
 */
const IDENT_MARK = "gnd:ph:identified";

function readIdentMark(): string | null {
  try {
    return window.localStorage.getItem(IDENT_MARK);
  } catch {
    return null;
  }
}
function writeIdentMark(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(IDENT_MARK, id);
    else window.localStorage.removeItem(IDENT_MARK);
  } catch {
    // 표식을 못 남기면 다음 로드에서 한 번 더 식별할 뿐이다
  }
}

/** 로드·식별이 끝나기 전에 들어온 이벤트를 붙들어 두는 한도 */
const QUEUE_MAX = 25;
const QUEUE_TTL_MS = 60_000;

const state = {
  sdk: null as PostHog | null,
  loading: null as Promise<PostHog | null> | null,
  /** SDK가 지금 이 id로 식별돼 있다 (익명이면 null) */
  identifiedId: null as string | null,
  /** 마지막으로 반영한 사람 속성 서명 */
  personSig: "",
  /** 철회·제외로 opt-out 해 둔 상태인가 */
  optedOut: false,
  /** 식별까지 끝나 바로 보내도 되는가 */
  ready: false,
  queue: [] as Queued[],
  chain: Promise.resolve() as Promise<void>,
};

/** 테스트 전용 — 모듈 상태 초기화 */
export function __resetAnalyticsForTests(): void {
  state.sdk = null;
  state.loading = null;
  state.identifiedId = null;
  state.personSig = "";
  state.optedOut = false;
  state.ready = false;
  state.queue = [];
  state.chain = Promise.resolve();
}

export function __analyticsStateForTests() {
  return {
    loaded: state.sdk !== null,
    identifiedId: state.identifiedId,
    optedOut: state.optedOut,
    ready: state.ready,
    queued: state.queue.length,
  };
}

/** 지금 이 순간 보내도 되는 상태인가 (동의·키·제외). SDK 로드 여부와는 별개다. */
export function isTrackingAllowed(userId?: string | null): boolean {
  try {
    if (!isAnalyticsConfigured()) return false;
    if (readConsent() !== "granted") return false;
    if (typeof window === "undefined") return false;
    if (isExcludedPath(window.location.pathname)) return false;
    if (isInternalBrowser()) return false;
    if (isExcludedUser(userId)) return false;
    return true;
  } catch {
    return false;
  }
}

function baseConfig(host: string) {
  return {
    api_host: host,
    ui_host: POSTHOG_US_UI_HOST,
    // 자동 수집 전부 끔
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_performance: false,
    rageclick: false,
    disable_scroll_properties: true,
    // 리플레이·설문·실험·플래그 등 부가 기능 끔
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_conversations: true,
    disable_product_tours: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    // 개인정보
    person_profiles: "identified_only" as const,
    persistence: "localStorage" as const,
    ip: false,
    save_referrer: false,
    save_campaign_params: false,
    // 리다이렉트 직전에도 유실되지 않게 이벤트마다 바로 보낸다(볼륨이 작다)
    request_batching: false,
    before_send: sanitizeOutgoing,
  };
}

async function ensureSdk(): Promise<PostHog | null> {
  if (state.sdk) return state.sdk;
  const key = posthogKey();
  const host = posthogHost();
  if (!key || !host) return null;
  if (!state.loading) {
    state.loading = (async () => {
      try {
        const mod = await import("posthog-js");
        const posthog = mod.default;
        posthog.init(key, baseConfig(host));
        // 이전 철회가 SDK 저장소에 남긴 opt-out 표시를 걷는다.
        // 동의의 기준은 우리 `gnd-analytics-consent` 한 칸이다.
        if (posthog.has_opted_out_capturing()) {
          posthog.opt_in_capturing({ captureEventName: false });
        }
        // 이전 방문에서 식별된 사용자가 SDK 저장소에 남아 있으면 그것을 현재 식별 상태로 본다.
        // 그래야 같은 사용자는 다시 식별하지 않고(`$identify` 중복 방지), 다른 사용자(B)가 오면
        // reset 경로를 탄다. SDK 내부 속성이 아니라 우리 표식과 SDK의 distinct_id가 **둘 다** 같을 때만 믿는다.
        try {
          const mark = readIdentMark();
          if (mark && mark === posthog.get_distinct_id()) {
            state.identifiedId = mark;
          } else if (mark) {
            writeIdentMark(null);
          }
        } catch {
          // 읽지 못하면 익명으로 본다
        }
        state.sdk = posthog;
        return posthog;
      } catch {
        state.loading = null;
        return null;
      }
    })();
  }
  return state.loading;
}

/** PostHog가 남긴 저장 데이터를 지운다 (`ph_*`, `*posthog*`, `__ph_opt_in_out_*`). */
export function clearPosthogStorage(): void {
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && (/^ph_/i.test(k) || /posthog/i.test(k) || /^__ph_/i.test(k))) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    }
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0]?.trim();
      if (name && (/^ph_/i.test(name) || /posthog/i.test(name))) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    // 저장소 접근 실패는 무시
  }
}

function teardown(): void {
  state.queue = [];
  state.ready = false;
  const sdk = state.sdk;
  if (sdk && !state.optedOut) {
    try {
      sdk.reset(); // 먼저 reset
      sdk.opt_out_capturing(); // 그다음 opt-out (순서 중요)
    } catch {
      // 무시
    }
    state.optedOut = true;
  }
  state.identifiedId = null;
  state.personSig = "";
  writeIdentMark(null);
  // SDK를 한 번도 안 불렀다면 건드릴 저장 데이터도 없다. 불렀다면 지운다.
  if (sdk) clearPosthogStorage();
}

/** 동의를 철회했거나 더 이상 보내면 안 되는 상태가 됐을 때 */
export function stopAnalytics(): void {
  teardown();
}

function personProps(input: SyncInput): Record<string, Primitive> {
  const out: Record<string, unknown> = {};
  if (input.userId && input.isAnonymous !== null) out.is_anonymous = input.isAnonymous;
  return sanitizePersonProps(out);
}

function firstTouchProps(): Record<string, Primitive> {
  const a = readAcquisition();
  if (!a) return {};
  return sanitizePersonProps({
    initial_utm_source: a.source,
    initial_utm_medium: a.medium,
    initial_utm_campaign: a.campaign,
  });
}

function dispatch(sdk: PostHog, item: Queued): void {
  try {
    sdk.capture(item.event, item.props);
  } catch {
    // 무시
  }
}

function flushQueue(sdk: PostHog, currentUserId: string | null): void {
  const now = Date.now();
  const pending = state.queue;
  state.queue = [];
  for (const item of pending) {
    if (now - item.at > QUEUE_TTL_MS) continue;
    // 이벤트를 만든 사용자와 지금 식별된 사용자가 다르면 보내지 않는다 (식별 충돌 방지)
    if (item.userId && item.userId !== currentUserId) continue;
    dispatch(sdk, item);
  }
}

async function runSync(input: SyncInput): Promise<void> {
  try {
    const allowed = isTrackingAllowed(input.userId);
    if (!allowed) {
      // 동의가 없거나 철회됨, 관리자 화면, 내부 계정 → 걷어낸다 (SDK가 없으면 할 일 없음)
      teardown();
      return;
    }

    state.ready = false;
    const sdk = await ensureSdk();
    if (!sdk) return;

    // 로드를 기다리는 사이 철회됐을 수 있다 — 다시 확인
    if (!isTrackingAllowed(input.userId)) {
      teardown();
      return;
    }

    if (state.optedOut) {
      // 철회했다가 다시 동의한 경우: reset 먼저, 그다음 opt-in
      sdk.reset();
      sdk.opt_in_capturing({ captureEventName: false });
      state.optedOut = false;
      state.identifiedId = null;
      state.personSig = "";
      writeIdentMark(null);
    }

    if (input.userId !== state.identifiedId) {
      if (state.identifiedId) {
        // A→B 또는 로그아웃: 이전 사람과 끊는다. 합치지 않는다.
        sdk.reset();
        state.identifiedId = null;
        state.personSig = "";
        writeIdentMark(null);
      }
      if (input.userId) {
        sdk.identify(input.userId, personProps(input), firstTouchProps());
        state.identifiedId = input.userId;
        writeIdentMark(input.userId);
        state.personSig = JSON.stringify(personProps(input));
      }
    } else if (input.userId) {
      const props = personProps(input);
      const sig = JSON.stringify(props);
      if (sig !== state.personSig && Object.keys(props).length > 0) {
        sdk.setPersonProperties(props);
        state.personSig = sig;
      }
    }

    state.ready = true;
    flushQueue(sdk, state.identifiedId);
  } catch {
    // 분석 실패는 앱에 영향을 주지 않는다
  }
}

/** 동의·사용자·경로가 바뀔 때마다 부른다. 호출은 순서대로 한 줄로 처리된다. */
export function syncAnalytics(input: SyncInput): Promise<void> {
  state.chain = state.chain.then(() => runSync(input));
  return state.chain;
}

/** 이벤트 한 건을 보내거나, 식별이 끝날 때까지 붙들어 둔다. 던지지 않는다. */
export function submitEvent(item: {
  event: ProductEvent;
  props: Record<string, Primitive>;
  userId: string | null;
}): void {
  try {
    const sdk = state.sdk;
    const queued: Queued = { ...item, at: Date.now() };
    if (sdk && state.ready && !state.optedOut) {
      // 식별된 사람과 이벤트 주인이 다르면 보내지 않고 다음 동기화를 기다린다.
      if (!item.userId || item.userId === state.identifiedId) {
        dispatch(sdk, queued);
        return;
      }
    }
    if (state.queue.length >= QUEUE_MAX) state.queue.shift();
    state.queue.push(queued);
  } catch {
    // 무시
  }
}

/**
 * 페이지를 **떠나기 직전**(OAuth 복귀 후 `location.assign`)에 호출한다.
 * 동의한 사용자에 한해, 로드·식별·대기열이 비워질 때까지 최대 `timeoutMs`만 기다린다.
 * 동의가 없거나 키가 없으면 **즉시 돌아온다** — 기존 사용자는 지연이 없다.
 */
export async function awaitAnalyticsIdle(timeoutMs = 2000): Promise<void> {
  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!isTrackingAllowed(null)) return;
      if (state.sdk && state.ready && state.queue.length === 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  } catch {
    // 무시
  }
}
