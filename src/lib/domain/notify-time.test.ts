import { describe, expect, it } from "vitest";
import {
  CATCH_UP_MINUTES,
  DEFAULT_BRIEF_MINUTE,
  ESTIMATE_WINDOW_DAYS,
  MIN_SESSIONS_FOR_ESTIMATE,
  NOTIFY_LEAD_MINUTES,
  SLOT_MINUTES,
  estimateNotifyMinute,
  isDue,
} from "./notify-time";

const KST = "Asia/Seoul";
/** 2026-08-13(목) 21:00 KST */
const NOW = new Date("2026-08-13T12:00:00Z");

/** KST 벽시계로 세션 시작 시각을 만든다 (KST = UTC+9) */
function kst(day: string, hh: number, mm = 0): Date {
  const utcH = hh - 9;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCHours(utcH, mm, 0, 0);
  return d;
}

/** 같은 시각의 세션 n개를 최근 날짜로 흩뿌린다 */
function repeat(hh: number, mm: number, n: number): Date[] {
  return Array.from({ length: n }, (_, i) =>
    kst(`2026-08-${String(12 - i).padStart(2, "0")}`, hh, mm),
  );
}

describe("estimateNotifyMinute — 평소 시작 30분 전", () => {
  it("표본이 모자라면 추정하지 않는다", () => {
    const few = repeat(19, 0, MIN_SESSIONS_FOR_ESTIMATE - 1);
    expect(estimateNotifyMinute(few, KST, NOW)).toBeNull();
  });

  it("표본이 채워지면 평소 시작보다 30분 앞을 돌려준다", () => {
    const many = repeat(19, 0, MIN_SESSIONS_FOR_ESTIMATE);
    // 19:00 시작 → 18:30 알림 = 18*60+30
    expect(estimateNotifyMinute(many, KST, NOW)).toBe(18 * 60 + 30);
    expect(NOTIFY_LEAD_MINUTES).toBe(30);
  });

  it("시작 시각을 30분 슬롯으로 접는다 — 19:05도 19:00 슬롯이다", () => {
    const many = [
      ...repeat(19, 5, 3),
      kst("2026-08-08", 19, 20),
      kst("2026-08-07", 19, 29),
    ];
    expect(estimateNotifyMinute(many, KST, NOW)).toBe(18 * 60 + 30);
  });

  /**
   * ⚠️ **평균·중앙값을 쓰면 안 되는 이유가 이 케이스다.** 아침 7시와 저녁 21시를
   * 오가는 사람의 평균은 14시 — **아무도 운동하지 않는 시각**이다. 최빈값은
   * 실제로 가장 자주 가는 시간을 고른다.
   */
  it("아침·저녁을 오가면 더 자주 가는 쪽을 고른다 — 평균이 아니다", () => {
    const bimodal = [...repeat(21, 0, 6), ...repeat(7, 0, 3)];
    // 평균이면 14시대(→13:30). 최빈은 21시(→20:30).
    expect(estimateNotifyMinute(bimodal, KST, NOW)).toBe(20 * 60 + 30);
  });

  it("동률이면 더 최근에 간 쪽을 고른다 — 규칙이 없으면 시각이 매일 흔들린다", () => {
    const tied = [
      // 저녁 21시 3회 (오래됨)
      kst("2026-08-01", 21, 0),
      kst("2026-08-02", 21, 0),
      kst("2026-08-03", 21, 0),
      // 아침 7시 3회 (최근)
      kst("2026-08-10", 7, 0),
      kst("2026-08-11", 7, 0),
      kst("2026-08-12", 7, 0),
    ];
    expect(estimateNotifyMinute(tied, KST, NOW)).toBe(6 * 60 + 30);
  });

  /** ⚠️ 자정을 넘어가면 음수가 된다. 감싸지 않으면 슬롯 비교가 영영 안 맞는다 */
  it("00:10에 운동하는 사람은 전날 23:40이 된다", () => {
    const midnight = repeat(0, 10, MIN_SESSIONS_FOR_ESTIMATE);
    expect(estimateNotifyMinute(midnight, KST, NOW)).toBe(23 * 60 + 30);
  });

  it("추정 창 밖의 오래된 기록은 세지 않는다", () => {
    const old = Array.from(
      { length: MIN_SESSIONS_FOR_ESTIMATE },
      (_, i) =>
        new Date(
          NOW.getTime() - (ESTIMATE_WINDOW_DAYS + 5 + i) * 86_400_000,
        ),
    );
    expect(estimateNotifyMinute(old, KST, NOW)).toBeNull();
  });

  it("타임존이 다르면 다른 슬롯이 나온다", () => {
    const many = repeat(19, 0, MIN_SESSIONS_FOR_ESTIMATE); // KST 19:00 = UTC 10:00
    expect(estimateNotifyMinute(many, "UTC", NOW)).toBe(9 * 60 + 30);
  });

  it("기본 알림 시각은 09:00이다 — 추정이 없을 때의 폴백", () => {
    expect(DEFAULT_BRIEF_MINUTE).toBe(9 * 60);
  });
});

/**
 * 2026-08-16 — 옛 `sameSlot`("지금이 정확히 그 슬롯인가")을 대체했다.
 *
 * ⚠️ **이 describe가 "하루를 통째로 놓치는" 사고의 재발 방지선이다.** 실측:
 * `dev-테스터A`(예정 06:00)가 2026-08-16에 못 받았다. 슬롯은 그대로였고 같은 날
 * 06:30 사용자들은 정상 수신했으니 06:00 발사 한 번이 빠진 것이다. 정확 일치로
 * 판정하면 그 한 번이 곧 하루치 손실이 된다.
 */
describe("isDue — 놓친 발사를 따라잡는다", () => {
  const AT_0600 = 6 * 60;

  it("예정 시각이면 보낸다", () => {
    expect(isDue(AT_0600, AT_0600)).toBe(true);
  });

  it("예정 시각 전에는 안 보낸다", () => {
    expect(isDue(AT_0600 - 1, AT_0600)).toBe(false);
    expect(isDue(5 * 60, AT_0600)).toBe(false);
  });

  /** ⚠️ 핵심 — 06:00 발사가 실패해도 06:30이 따라잡는다 */
  it("예정 시각을 놓쳐도 다음 발사가 따라잡는다", () => {
    expect(isDue(AT_0600 + 30, AT_0600)).toBe(true);
    expect(isDue(AT_0600 + 60, AT_0600)).toBe(true);
    expect(isDue(AT_0600 + 90, AT_0600)).toBe(true);
  });

  /**
   * ⚠️ 무한정 열어두지 않는다. "곧 운동할 시간이니 준비하세요"가 6시간 뒤에 오면
   * 알림이 아니라 소음이다.
   */
  it("따라잡기 창을 넘기면 안 보낸다 — 철 지난 알림은 소음이다", () => {
    expect(isDue(AT_0600 + CATCH_UP_MINUTES, AT_0600)).toBe(false);
    expect(isDue(AT_0600 + CATCH_UP_MINUTES + 30, AT_0600)).toBe(false);
  });

  it("30분 발사 기준 네 번 연속 실패까지 덮는다", () => {
    expect(CATCH_UP_MINUTES / SLOT_MINUTES).toBe(4);
  });
});
