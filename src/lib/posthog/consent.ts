/**
 * 분석 동의 상태 — **이 기기의 localStorage 한 칸**이 유일한 진실이다.
 *
 * - `unset`   아직 고르지 않음 → 기본값은 "수집 안 함"
 * - `granted` 동의함
 * - `denied`  거부함 / 철회함
 *
 * ⚠️ 안내 문구가 바뀌어 `CONSENT_VERSION`을 올리면 이전 선택은 무효(`unset`)가 된다.
 * ⚠️ 어떤 경우에도 던지지 않는다. 저장소가 막히면(프라이빗 모드 등) `unset`으로 본다 —
 *    저장할 수 없으면 동의를 증명할 수 없으므로 **수집하지 않는 쪽**이다.
 */

export const CONSENT_KEY = "gnd-analytics-consent";
export const CONSENT_VERSION = 1;

export type ConsentStatus = "unset" | "granted" | "denied";

export function readConsent(): ConsentStatus {
  try {
    if (typeof window === "undefined") return "unset";
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return "unset";
    const parsed = JSON.parse(raw) as { v?: unknown; status?: unknown };
    if (parsed?.v !== CONSENT_VERSION) return "unset";
    return parsed.status === "granted" || parsed.status === "denied"
      ? parsed.status
      : "unset";
  } catch {
    return "unset";
  }
}

const listeners = new Set<() => void>();
let storageHooked = false;

function notify(): void {
  for (const l of Array.from(listeners)) l();
}

/** `useSyncExternalStore`용. 다른 탭에서 바꾼 것도 반영한다. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageHooked && typeof window !== "undefined") {
    storageHooked = true;
    window.addEventListener("storage", (e) => {
      if (e.key === CONSENT_KEY || e.key === null) notify();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 저장에 실패하면 false — 그때는 상태가 바뀌지 않았다. */
export function writeConsent(status: "granted" | "denied"): boolean {
  try {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: CONSENT_VERSION, status, at: new Date().toISOString() }),
    );
  } catch {
    return false;
  }
  notify();
  return true;
}
