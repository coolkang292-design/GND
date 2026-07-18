/**
 * 챌린지 레벨 도메인 순수 함수 (스펙 §4).
 * 챌린지 기간 전용: 시작 시 Lv.1, 시작일 기준 7일 블록에 5일+ 운동 → +1(블록당 1회),
 * 운동일 간격 5일+(스트릭 소멸 규칙 재사용) → -1. 범위 1~5, 표시 전용(순위 점수 무관).
 */

import { STREAK_EXPIRY_DAYS } from "./streak";

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
/** 블록(7일) 안에서 레벨업에 필요한 운동일 수 */
export const LEVEL_UP_DAYS = 5;

export const LEVEL_NAMES = [
  "잠만보 불독",
  "산책 시작",
  "쇠질 입문",
  "근육 불독",
  "개노답 탈출",
] as const;

const clamp = (n: number) => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n));

/** "Lv.3 쇠질 입문" (범위 밖 입력은 클램프) */
export function levelLabel(level: number): string {
  const lv = clamp(level);
  return `Lv.${lv} ${LEVEL_NAMES[lv - 1]}`;
}

/** "YYYY-MM-DD" 두 날짜의 달력 일수 차이 (to - from) */
function daysBetween(fromKey: string, toKey: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * 챌린지 기간 내 운동일들로 현재 레벨 계산.
 * 이벤트(업/다운)를 날짜순으로 적용하며 매 단계 1~5로 클램프한다.
 * todayKey가 endDate를 지나면 endDate 기준으로 고정(시상대 최종 레벨).
 */
export function challengeLevel(
  dayKeys: string[],
  startDate: string,
  endDate: string,
  todayKey: string,
): number {
  if (todayKey < startDate) return LEVEL_MIN;
  const effectiveEnd = todayKey < endDate ? todayKey : endDate;

  const keys = [...new Set(dayKeys)]
    .filter((k) => k >= startDate && k <= effectiveEnd)
    .sort();

  // order: 같은 날짜에선 다운(공백 만료)이 복귀 운동의 업보다 시간상 선행
  type Ev = { day: string; delta: 1 | -1; order: 0 | 1 };
  const events: Ev[] = [];

  // 레벨업: 블록별 5번째 운동일 (블록당 최대 1회)
  const counts = new Map<number, number>();
  for (const k of keys) {
    const block = Math.floor(daysBetween(startDate, k) / 7);
    const n = (counts.get(block) ?? 0) + 1;
    counts.set(block, n);
    if (n === LEVEL_UP_DAYS) events.push({ day: k, delta: 1, order: 1 });
  }

  // 레벨다운: 운동일 사이 공백 + 마지막 운동일~기준일 공백 (각 1회)
  for (let i = 1; i < keys.length; i++) {
    if (daysBetween(keys[i - 1], keys[i]) >= STREAK_EXPIRY_DAYS) {
      events.push({
        day: addDays(keys[i - 1], STREAK_EXPIRY_DAYS),
        delta: -1,
        order: 0,
      });
    }
  }
  const last = keys.at(-1);
  if (last && daysBetween(last, effectiveEnd) >= STREAK_EXPIRY_DAYS) {
    events.push({ day: addDays(last, STREAK_EXPIRY_DAYS), delta: -1, order: 0 });
  }

  events.sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : a.order - b.order,
  );

  let level = LEVEL_MIN;
  for (const e of events) {
    if (e.day > effectiveEnd) break;
    level = clamp(level + e.delta);
  }
  return level;
}
