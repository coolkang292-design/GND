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

/**
 * 놓친 발사를 따라잡는 창(분) — 2026-08-16 실측으로 추가.
 *
 * ⚠️ **한 번 놓치면 그날은 영영 못 받는 구조였다.** 옛 판정은 "지금이 정확히 그
 * 사람의 30분 슬롯인가"였다. 2026-08-16에 `dev-테스터A`(예정 06:00)가 하루를
 * 통째로 놓쳤다 — 슬롯은 그대로였고 같은 날 06:30 사용자들은 정상 수신했으니
 * **06:00 발사 한 번이 빠진 것**이다. 크론·네트워크·콜드스타트 중 무엇이든
 * 한 번은 실패할 수 있는데, 그때마다 하루치 알림이 사라지면 안 된다.
 *
 * `dedupe_key`가 **하루 한 번**을 이미 보장하므로(`morning_briefing:<user>:<날짜>`)
 * 지난 시각을 다시 시도해도 중복이 안 난다. 그래서 창을 열 수 있다.
 *
 * ⚠️ **무한정 열어두지는 않는다.** "곧 운동할 시간이니 준비하세요"라는 재촉이
 * 6시간 뒤에 오면 그건 알림이 아니라 소음이다. 2시간이면 30분 발사 기준 **네 번**을
 * 연달아 놓쳐도 따라잡는다 — 실패 한두 번을 덮기엔 충분하고, 철 지난 알림은 막는다.
 */
export const CATCH_UP_MINUTES = 120;

/**
 * 지금 이 사람에게 보낼 때인가.
 *
 * `[알림 시각, 알림 시각 + 따라잡기 창)` 안이면 보낸다. 실제로 하루 한 번만 가는
 * 것은 DB의 `unique(dedupe_key)`가 보장한다 — 이 함수는 **"보내도 되는 때인가"**만
 * 답한다.
 *
 * ⚠️ 자정을 넘겨 따라잡지 않는다. 예를 들어 알림 시각이 23:30이면 그날 23:59까지만
 * 유효하다. 넘기면 **날짜가 바뀌면서 dedupe 키도 바뀌어** 다음 날 몫을 새벽에
 * 보내게 된다. 늦은 시각 사용자는 따라잡기 창이 짧다 — 그건 옛 동작과 같으므로
 * 후퇴가 아니다.
 */
export function isDue(nowMinute: number, notifyMinute: number): boolean {
  return (
    nowMinute >= notifyMinute && nowMinute < notifyMinute + CATCH_UP_MINUTES
  );
}

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

// ⚠️ 옛 `sameSlot(a, b)`은 2026-08-16에 지웠다. "지금이 정확히 그 슬롯인가"로
//    판정하면 발사 한 번이 실패할 때 그날 알림이 통째로 사라진다 — `isDue`를 써라.
