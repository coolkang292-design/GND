/**
 * 알림 시각 개인화 — 평소 운동 시작 30분 전 (2026-08-13).
 *
 * 설계: `docs/superpowers/specs/2026-08-13-personalized-briefing-time-design.md`
 *
 * 이 모듈은 I/O를 하지 않는다. "언제 보낼 것인가"만 정하고, 조회와 발송은 라우트가 한다.
 */

import { minuteOfDay } from "./time";

/** 알림 슬롯 크기(분). 크론 주기와 **같아야 한다** — 다르면 슬롯이 통째로 비어 발송이 없다. */
export const SLOT_MINUTES = 30;

/** 평소 시작보다 얼마나 앞서 보낼 것인가 (2026-08-13 사용자 지시 "30분 전") */
export const NOTIFY_LEAD_MINUTES = 30;

/** 추정에 쓸 최근 기간. 반년 전 습관은 지금 습관이 아니다. */
export const ESTIMATE_WINDOW_DAYS = 60;

/** 이만큼은 있어야 "평소 시각"이라 부를 수 있다. 미달이면 추정하지 않는다. */
export const MIN_SESSIONS_FOR_ESTIMATE = 5;

/** 추정이 없을 때의 기본 알림 시각 — 옛 동작(09:00)을 그대로 유지한다 */
export const DEFAULT_BRIEF_MINUTE = 9 * 60;

/** 하루 = 1440분. 자정을 넘어간 값을 감쌀 때 쓴다. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * 평소 운동 시작 시각의 30분 전(분 단위, 0~1439). 표본이 모자라면 `null`.
 *
 * ⚠️ **`null`은 "보내지 않음"이 아니라 "추정 없음"이다.** 부르는 쪽이
 * `DEFAULT_BRIEF_MINUTE`로 떨어뜨린다 — 그러지 않으면 기록이 적은 새 사용자가
 * 알림을 영영 못 받는다.
 *
 * ⚠️ **평균도 중앙값도 아니고 최빈값이다.** 아침 7시와 저녁 21시를 오가는 사람의
 * 평균은 14시 — 아무도 운동하지 않는 시각이 나온다. 최빈 슬롯은 그 함정이 없다.
 *
 * ⚠️ `completed_at`이 아니라 **`started_at`을 넣어라.** 완료 시각으로 재면 알림이
 * 운동이 끝난 뒤에 간다.
 */
export function estimateNotifyMinute(
  startedAts: Date[],
  timeZone: string,
  now: Date,
): number | null {
  const since = now.getTime() - ESTIMATE_WINDOW_DAYS * 86_400_000;
  const recent = startedAts.filter((d) => d.getTime() >= since);
  if (recent.length < MIN_SESSIONS_FOR_ESTIMATE) return null;

  // 슬롯별 횟수와 **가장 최근 시각**을 같이 모은다. 최근 시각은 동률을 가르는 데 쓴다.
  const bySlot = new Map<number, { count: number; latest: number }>();
  for (const d of recent) {
    const slot = Math.floor(minuteOfDay(d, timeZone) / SLOT_MINUTES);
    const acc = bySlot.get(slot) ?? { count: 0, latest: -Infinity };
    acc.count += 1;
    acc.latest = Math.max(acc.latest, d.getTime());
    bySlot.set(slot, acc);
  }

  // ⚠️ 동률 규칙이 없으면 `Map` 순회 순서에 따라 알림 시각이 실행마다 바뀐다.
  //    더 최근에 간 슬롯을 고른다 — 지금의 습관이 옛 습관을 이긴다.
  let bestSlot = -1;
  let best = { count: -1, latest: -Infinity };
  for (const [slot, acc] of bySlot) {
    if (
      acc.count > best.count ||
      (acc.count === best.count && acc.latest > best.latest)
    ) {
      bestSlot = slot;
      best = acc;
    }
  }

  const typicalMinute = bestSlot * SLOT_MINUTES;
  // ⚠️ 감싸지 않으면 00:10 시작인 사람이 -20이 되어 어떤 슬롯과도 안 맞는다.
  return (
    (typicalMinute - NOTIFY_LEAD_MINUTES + MINUTES_PER_DAY) % MINUTES_PER_DAY
  );
}

/** 두 분(minute-of-day)이 같은 30분 슬롯인가 */
export function sameSlot(a: number, b: number): boolean {
  return Math.floor(a / SLOT_MINUTES) === Math.floor(b / SLOT_MINUTES);
}
