/**
 * 시간 도메인 순수 함수 (§16 time.ts).
 * 모든 함수는 I/O 없음. "순간"은 UTC Date, "달력 날짜"는 timezone 기준.
 * 서버시간이 진실 — 클라 시간은 참고값(Ground Truth 1).
 */

export const DEFAULT_TIMEZONE = "Asia/Seoul";

/** 하루(밀리초). 날짜 산술에 쓰는 리터럴 `86_400_000`을 여기로 모았다. */
export const DAY_MS = 86_400_000;

/**
 * 이 브라우저의 타임존. 못 읽으면 `DEFAULT_TIMEZONE`.
 *
 * ⚠️ **타임존 정책을 통일하는 함수가 아니다.** 이 앱은 화면마다 기준이 다르고,
 *    그건 의도된 것이다 — 기록 화면은 **브라우저 타임존**(여행 중에도 "지금 여기"의
 *    오늘에 기록이 붙는다), 홈은 `DEFAULT_TIMEZONE`(크루·챌린지가 같은 하루를
 *    봐야 하므로). 한쪽으로 합치면 **같은 운동이 화면마다 다른 날로 잡힌다**
 *    (`domain/today-status.ts` 주석 참조).
 *
 *    그래서 이 함수는 "브라우저 타임존을 쓰기로 한 자리"에서만 부른다.
 *    `DEFAULT_TIMEZONE`을 쓰는 자리는 그 상수를 그대로 쓴다.
 *
 * ⚠️ 순수 함수가 아니다(환경을 읽는다). 도메인 계산에 넘길 **값을 만드는** 용도라
 *    여기 두지만, 계산 함수에는 반드시 인자로 넘긴다 — 안에서 부르지 마라.
 */
export function resolveTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

type WallClock = {
  year: number;
  month: number; // 1~12
  day: number; // 1~31
  hour: number;
  minute: number;
  second: number;
};

/** instant가 tz에서 가리키는 벽시계 시각 */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // hourCycle 구현에 따라 자정이 24로 나오는 경우 방어
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** tz의 벽시계 시각 → UTC 순간 (DST 경계 포함, 반복 보정 2회로 수렴) */
function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let ts = desired;
  for (let i = 0; i < 2; i++) {
    const wc = wallClock(new Date(ts), timeZone);
    const actual = Date.UTC(
      wc.year,
      wc.month - 1,
      wc.day,
      wc.hour,
      wc.minute,
      wc.second,
    );
    ts += desired - actual;
  }
  return new Date(ts);
}

/** instant를 tz 기준 달력 날짜 "YYYY-MM-DD"로 */
export function dayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClock(instant, timeZone);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** instant가 tz에서 가리키는 시(0~23) — 브리핑 시각 매칭용 */
export function hourOfDay(instant: Date, timeZone: string): number {
  return wallClock(instant, timeZone).hour;
}

/**
 * instant가 tz에서 가리키는 **자정부터의 분**(0~1439).
 *
 * 2026-08-13에 알림 시각 개인화(30분 슬롯)를 넣으며 추가했다. `hourOfDay`로는
 * 30분 단위를 표현할 수 없다.
 */
export function minuteOfDay(instant: Date, timeZone: string): number {
  const { hour, minute } = wallClock(instant, timeZone);
  return hour * 60 + minute;
}

/** instant가 속한 tz 달력 날짜의 00:00 UTC 순간 */
export function startOfDay(instant: Date, timeZone: string): Date {
  const { year, month, day } = wallClock(instant, timeZone);
  return zonedTimeToInstant(year, month, day, 0, 0, 0, timeZone);
}

/** [그날 00:00, 다음날 00:00) — 통계·스탬프 집계용 반열림 구간 */
export function dayRange(
  instant: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month, day } = wallClock(instant, timeZone);
  return {
    start: zonedTimeToInstant(year, month, day, 0, 0, 0, timeZone),
    // Date.UTC가 월/연 경계를 넘는 day+1을 정규화해줌
    end: zonedTimeToInstant(year, month, day + 1, 0, 0, 0, timeZone),
  };
}

/** instant가 속한 주(월요일 시작)의 월요일 00:00 UTC 순간 */
export function weekStart(instant: Date, timeZone: string): Date {
  const { year, month, day } = wallClock(instant, timeZone);
  // 달력 날짜만의 요일은 UTC로 취급해 계산해도 동일
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일
  const daysFromMonday = (dow + 6) % 7;
  return zonedTimeToInstant(
    year,
    month,
    day - daysFromMonday,
    0,
    0,
    0,
    timeZone,
  );
}

/** [월요일 00:00, 다음주 월요일 00:00) */
export function weekRange(
  instant: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month, day } = wallClock(instant, timeZone);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  return {
    start: zonedTimeToInstant(year, month, day - daysFromMonday, 0, 0, 0, timeZone),
    end: zonedTimeToInstant(year, month, day - daysFromMonday + 7, 0, 0, 0, timeZone),
  };
}

/** 두 순간이 tz 기준 같은 달력 날짜인가 */
export function isSameDay(a: Date, b: Date, timeZone: string): boolean {
  return dayKey(a, timeZone) === dayKey(b, timeZone);
}
