/**
 * 이벤트 보내기의 **유일한 입구.** 화면 코드는 이것만 부른다.
 *
 * - 동의·키·제외 조건이 하나라도 안 맞으면 조용히 버린다 (앱 동작에는 영향 없음).
 * - 속성은 `events.ts` 화이트리스트로 한 번 거르고, SDK `before_send`에서 또 거른다.
 * - 같은 사실을 두 번 보내지 않도록 `dedupe`를 쓴다.
 * - 어떤 경우에도 던지지 않는다.
 */

import { isProductEvent, sanitizeEventProps, type ProductEvent } from "./events";
import { isTrackingAllowed, submitEvent } from "./client";

export interface TrackOptions {
  /** 이 이벤트를 만든 사용자. 식별된 사람과 다르면 보내지 않는다. */
  userId?: string | null;
  /**
   * 중복 방지. `session`은 브라우저 탭 세션당 한 번, `persistent`는 이 기기에서 한 번(최근 N건).
   * ⚠️ 동의 **이후에만** 기록한다 — 동의 전에는 어떤 저장도 하지 않는다.
   */
  dedupe?: { key: string; scope: "session" | "persistent" };
}

const SESSION_PREFIX = "gnd:ph:once:";
const PERSISTENT_KEY = "gnd:ph:sent";
const PERSISTENT_MAX = 60;

/** 이미 보냈으면 true. 아니면 보냈다고 표시하고 false. */
function claim(d: NonNullable<TrackOptions["dedupe"]>): boolean {
  try {
    if (d.scope === "session") {
      const k = SESSION_PREFIX + d.key;
      if (window.sessionStorage.getItem(k) === "1") return true;
      window.sessionStorage.setItem(k, "1");
      return false;
    }
    const raw = window.localStorage.getItem(PERSISTENT_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (list.includes(d.key)) return true;
    list.push(d.key);
    window.localStorage.setItem(PERSISTENT_KEY, JSON.stringify(list.slice(-PERSISTENT_MAX)));
    return false;
  } catch {
    // 저장소가 막히면 중복 방지를 못 한다. 보내지 않는 쪽이 중복보다 낫다.
    return true;
  }
}

export function trackProduct(
  event: ProductEvent,
  props?: Record<string, unknown>,
  opts?: TrackOptions,
): void {
  try {
    if (!isProductEvent(event)) return;
    const userId = opts?.userId ?? null;
    if (!isTrackingAllowed(userId)) return;
    if (opts?.dedupe && claim(opts.dedupe)) return;
    submitEvent({ event, props: sanitizeEventProps(event, props), userId });
  } catch {
    // 무시
  }
}

/** `/account` 철회 시 중복 방지 기록도 같이 지운다 (동의 이후에만 생기는 값). */
export function clearDedupeRecords(): void {
  try {
    window.localStorage.removeItem(PERSISTENT_KEY);
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // 무시
  }
}
