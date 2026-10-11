/**
 * **모든 제품 이벤트에 붙는 공통 맥락** — 유입 채널·첫 방문/재방문·내부(QA).
 *
 * 화면 코드는 이 값을 넘기지 않는다. `trackProduct`가 전송 직전에 붙이고,
 * `events.ts`의 `COMMON_SPECS`가 다시 거른다.
 *
 * ⚠️ 동의 **이후에만** 불린다(`trackProduct`가 `isTrackingAllowed`를 먼저 본다).
 *    `trafficType`이 sessionStorage에 쓰는 것도 그래서 동의 뒤의 일이다.
 * ⚠️ 어떤 경우에도 던지지 않는다. 모르면 그 속성만 뺀다.
 */

import { readAcquisition } from "@/lib/acquisition";
import { normalizeUtmSource, type Primitive } from "./events";
import { isInternalBrowser } from "./exclusion";

/** 이 탭 세션에서 정한 첫 방문/재방문 — 철회 시 `clearDedupeRecords`가 지운다 */
export const TRAFFIC_KEY = "gnd:ph:traffic";

/**
 * 첫 접촉 기록이 이 시간 안에 만들어졌으면 "이번이 첫 방문"이다.
 * PostHog 세션 기준(30분 무활동)과 맞췄다.
 */
export const NEW_VISIT_WINDOW_MS = 30 * 60 * 1000;

/**
 * `new` / `returning` — **브라우저 저장소 기준.**
 *
 * 근거는 `AcquisitionTracker`가 첫 진입에 한 번 심는 `gnd-acquisition.capturedAt`
 * (기존 기능, 덮어쓰지 않는다). 그 기록이 방금(30분 안) 생겼으면 첫 방문이다.
 * 한 번 정하면 **이 탭 세션 동안 고정**한다(sessionStorage) — 첫 방문 중에 30분이
 * 넘어도, 카카오·구글 왕복으로 페이지가 새로 떠도 `new`가 `returning`으로 뒤집히지 않는다.
 *
 * 한계: 저장소를 지운 사람은 다시 `new`다(기기 기준이지 사람 기준이 아니다).
 * 사람 기준 신규 여부는 Supabase `profiles.created_at`이 원본이다.
 */
export function trafficType(now: number = Date.now()): "new" | "returning" | null {
  try {
    const pinned = window.sessionStorage.getItem(TRAFFIC_KEY);
    if (pinned === "new" || pinned === "returning") return pinned;
    const a = readAcquisition();
    if (!a) return null;
    const at = Date.parse(a.capturedAt);
    if (!Number.isFinite(at)) return null;
    const t = now - at < NEW_VISIT_WINDOW_MS ? "new" : "returning";
    window.sessionStorage.setItem(TRAFFIC_KEY, t);
    return t;
  } catch {
    return null;
  }
}

/** 첫 접촉의 `utm_source`를 다섯 채널로 줄인 값. utm이 없었으면(직접 유입) null */
export function firstTouchSource(): Primitive | null {
  try {
    return normalizeUtmSource(readAcquisition()?.source);
  } catch {
    return null;
  }
}

export function eventContext(): Record<string, Primitive> {
  const out: Record<string, Primitive> = { is_internal: isInternalBrowser() };
  const source = firstTouchSource();
  if (source !== null) out.utm_source = source;
  const traffic = trafficType();
  if (traffic !== null) out.traffic_type = traffic;
  return out;
}
