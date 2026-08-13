"use client";

import { UiIcon } from "@/components/ui-icon";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";

/**
 * 헤더 한 줄 문구 (2026-08-13 사용자 지시 — "스트릭을 맨 위로").
 *
 * ⚠️ **카드를 맨 위로 올리지 않은 이유가 여기 있다.** 스트릭 카드(108px)를 헤더 아래로
 * 옮기면 그 아래가 전부 120px 밀려, 크루 3명인 사용자는 `운동 시작하기`가 접힘선
 * (812px)을 **100px 넘어간다**(792 → 912, 실측 기반 계산). 이번 개편의 목적이 바로
 * "크루 상태를 본 순간 버튼을 누르는 것"이라 그걸 깨면 안 된다. 그래서 **높이 비용이
 * 0px인 헤더 문구**로 올렸다 — 옛 자리에는 정보가 없는 구호(`오늘도 GND 탈출하자 🔥`)가
 * 있었다.
 *
 * ⚠️ 스트릭 카드는 **그대로 남는다**(사용자 선택). 이 줄은 숫자만, 카드는 주간 점 7개와
 * 응원 문구를 맡는다.
 */
export function headerStreakText(streak: number, todayDone: boolean): string {
  // 0일에 `0일 연속`이라고 적지 않는다 — 끊긴 상태를 성적처럼 말하는 셈이다.
  if (streak <= 0) return "운동을 시작하면 불꽃이 켜져요";
  // ⚠️ `오늘 아직`을 빼지 마라. 숫자만 있으면 **오늘 것이 이미 반영된 줄 안다** —
  //    스트릭은 오늘 안 하면 끊기는 값이라 그 구별이 이 줄의 쓸모 전부다.
  return `${streak}일 연속 · ${todayDone ? "오늘 완료" : "오늘 아직"}`;
}

export function HeaderStreak({
  completedAts,
  todayDone,
}: {
  /** 조회 전이면 `null` — 글자 없이 높이만 잡는다(헤더가 튀지 않게) */
  completedAts: Date[] | null;
  /**
   * 오늘 운동을 마쳤는가.
   *
   * ⚠️ 홈이 이미 판정한 값을 받는다(`iWorkedOutToday`). 여기서 다시 판정하면 같은
   * 화면에서 헤더와 콕 버튼이 서로 다른 "오늘"을 쓸 수 있다.
   */
  todayDone: boolean;
}) {
  // ⚠️ 높이는 아래 글자 줄과 같아야 한다. 다르면 조회가 끝나는 순간 헤더가 튄다.
  if (!completedAts) return <p className="mt-0.5 h-5" />;

  const tz = DEFAULT_TIMEZONE;
  const streak = currentStreak(
    workoutDayKeys(completedAts, tz),
    dayKey(new Date(), tz),
  );

  return (
    /* ⚠️ 옛 구호(`오늘도 GND 탈출하자 🔥`)는 `12.5px text-muted`였다. 그건 읽지 않아도
       되는 장식이라 흐려도 됐지만, 이 줄은 **오늘 운동할지 말지를 가르는 정보**다
       (2026-08-13 사용자 지시로 키웠다). 흐린 회색으로 두면 맨 위에 올린 의미가 없다. */
    <p className="mt-0.5 flex items-center gap-1.5 text-[14.5px] font-extrabold text-text">
      <UiIcon name={streak > 0 ? "streak-on" : "streak-off"} size={17} />
      {headerStreakText(streak, todayDone)}
    </p>
  );
}
