import { dayKey } from "./time";

/**
 * 기록 화면 맨 위 "오늘 상태" 카드의 재료 (2026-08-19 사용자 요청).
 *
 * *"운동완료 했으면 완료 메시지와 운동 성과(그래프), 안 했으면 응원 메시지와
 * 오늘의 운동"*
 *
 * ⚠️ 이 앱에는 **차트 라이브러리가 없다.** 넣으면 PWA에 +150KB다. 7칸 막대는
 * 높이 퍼센트만 있으면 `<div>`로 그려진다 — 그 계산이 여기 있다.
 *
 * ⚠️ 타임존은 **부르는 쪽이 넘긴다.** 기록 화면은 브라우저 타임존을 쓰고
 *    (`Intl…resolvedOptions().timeZone`, 그 화면 전체가 그렇다) 홈은
 *    `DEFAULT_TIMEZONE`을 쓴다. 여기서 하나로 정하면 **같은 운동이 화면마다
 *    다른 날로 잡힌다.**
 */

/** 7칸 중 하나 */
export type DayBar = {
  dayKey: string;
  /** 요일 한 글자 */
  label: string;
  /** 그날 합계 분 */
  minutes: number;
  /** 운동을 했는가 — **분과 별개다** */
  done: boolean;
  isToday: boolean;
  /** 0~100 */
  heightPercent: number;
};

/**
 * 운동은 했는데 0분인 날의 최소 높이.
 *
 * ⚠️⚠️ **이 바닥을 없애지 마라.** 지난 운동을 나중에 적으면 앱 시계가 안 돌아
 * `duration_minutes`가 비거나 0이다. 높이를 분에만 걸면 그런 날이 **빈칸**으로
 * 그려져서, 운동한 사람에게 화면이 "안 했다"고 말한다.
 */
export const MIN_DONE_BAR_PERCENT = 12;

const WEEKDAYS = "일월화수목금토";

function weekdayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** `"YYYY-MM-DD"`에서 n일 뺀 날 */
function shiftDayKey(key: string, deltaDays: number): string {
  const ms = Date.parse(`${key}T00:00:00Z`) + deltaDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 오늘까지 7칸. 마지막 칸이 오늘이다.
 *
 * ⚠️ `done`과 `minutes`는 **다른 것**이다. 운동 유무는 세션이 있느냐고,
 *    분은 앱 시계가 잰 값이다. 둘을 하나로 합치면 위 `MIN_DONE_BAR_PERCENT`가
 *    막으려는 고장이 그대로 난다.
 */
export function weeklyBars(
  sessions: { completedAt: Date; durationMinutes: number | null }[],
  todayKey: string,
  timeZone: string,
): DayBar[] {
  const keys = Array.from({ length: 7 }, (_, i) => shiftDayKey(todayKey, i - 6));
  const window = new Set(keys);

  const minutesByDay = new Map<string, number>();
  const doneDays = new Set<string>();
  for (const s of sessions) {
    const k = dayKey(s.completedAt, timeZone);
    if (!window.has(k)) continue;
    doneDays.add(k);
    minutesByDay.set(
      k,
      (minutesByDay.get(k) ?? 0) + Math.max(0, Math.round(s.durationMinutes ?? 0)),
    );
  }

  const max = Math.max(0, ...minutesByDay.values());

  return keys.map((k) => {
    const minutes = minutesByDay.get(k) ?? 0;
    const done = doneDays.has(k);
    let heightPercent = 0;
    if (done) {
      const raw = max > 0 ? Math.round((minutes / max) * 100) : 0;
      heightPercent = Math.max(MIN_DONE_BAR_PERCENT, raw);
    }
    return {
      dayKey: k,
      label: weekdayLabel(k),
      minutes,
      done,
      isToday: k === todayKey,
      heightPercent,
    };
  });
}

/** 7칸 합계 — 카드 아래 한 줄에 쓴다 */
export function weekTotals(bars: DayBar[]): { days: number; minutes: number } {
  return {
    days: bars.filter((b) => b.done).length,
    minutes: bars.reduce((a, b) => a + b.minutes, 0),
  };
}
