/**
 * 유입 출처의 브라우저 쪽 — **첫 접촉을 딱 한 번 잡아 두었다가** 온보딩이 프로필을
 * 만들 때 함께 보낸다.
 *
 * **왜 저장했다가 보내나.** 사람이 링크를 눌러 들어온 순간(`utm`·`referrer`가
 * 살아 있는 순간)에는 아직 프로필이 없다. 온보딩을 마칠 때쯤이면 주소창의
 * 쿼리스트링은 이미 사라지고 `document.referrer`도 앱 내부 이동으로 덮여 있다.
 * 그래서 진입 즉시 붙잡아 localStorage에 재워 둔다.
 *
 * ⚠️ **덮어쓰지 않는다.** 이미 저장된 값이 있으면 그대로 둔다 — 첫 접촉 귀속은
 *    나중 값으로 덮이는 순간 의미가 없어진다. 서버 쪽에도 같은 규칙이 트리거로
 *    걸려 있다(0079 `freeze_profile_attribution`). 한쪽만 두면 다른 쪽으로 샌다.
 *
 * 저장 키는 `savePendingInvite`(`crew.ts`)와 같은 규약을 따른다.
 */

import { buildAcquisition, type Acquisition } from "@/lib/domain/acquisition";

const KEY = "gnd-acquisition";

/**
 * 첫 진입에서 한 번만 심는다. **어떤 경우에도 던지지 않는다** — 계측이 앱을
 * 죽이면 안 된다(`noteTrail`과 같은 규약).
 *
 * 이미 값이 있으면 아무것도 하지 않고 그 값을 돌려준다.
 */
export function captureAcquisitionOnce(now: Date = new Date()): Acquisition | null {
  try {
    if (typeof window === "undefined") return null;

    const existing = readAcquisition();
    if (existing) return existing;

    const captured = buildAcquisition({
      search: window.location.search,
      referrer: document.referrer || null,
      pathname: window.location.pathname,
      selfHost: window.location.hostname,
      now,
    });
    localStorage.setItem(KEY, JSON.stringify(captured));
    return captured;
  } catch {
    // 사파리 프라이빗 모드 등에서 localStorage가 던진다. 계측은 포기하고 넘어간다.
    return null;
  }
}

export function readAcquisition(): Acquisition | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Acquisition>;
    // 모양이 깨진 값은 없는 것으로 친다 — 옛 버전이 남긴 것일 수 있다
    if (typeof parsed?.capturedAt !== "string") return null;
    return {
      source: parsed.source ?? null,
      medium: parsed.medium ?? null,
      campaign: parsed.campaign ?? null,
      referrer: parsed.referrer ?? null,
      landing: parsed.landing ?? null,
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
}

/**
 * `profiles`에 실어 보낼 모양. 저장된 것이 없으면 **빈 객체**를 준다 —
 * null을 명시적으로 보내면 서버 트리거가 막아 주긴 하지만, 애초에 보내지 않는
 * 편이 의도가 분명하다.
 */
export function acquisitionColumns(): Record<string, string | null> {
  const a = readAcquisition();
  if (!a) return {};
  return {
    acquisition_source: a.source,
    acquisition_medium: a.medium,
    acquisition_campaign: a.campaign,
    acquisition_referrer: a.referrer,
    acquisition_landing: a.landing,
    acquisition_captured_at: a.capturedAt,
  };
}
