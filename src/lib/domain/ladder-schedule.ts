import { localDateTimeToIso, type PreferredSlot, type ProgramScheduleItem } from "./program-schedule";
import { addDaysToDateKey } from "./workout-plan";
import { LADDER_SESSIONS, ladderDayOffset } from "./pullup-ladder";

/**
 * 사다리 일정 — **요일이 아니라 주기**로 잡는다 (사장님 지시 2026-09-04).
 *
 * `buildProgramSchedule`(근력·인터벌)과 **합치지 않았다.** 둘은 날짜를 정하는
 * 방식이 근본부터 다르다.
 *
 * | | 근력·인터벌 | 사다리 |
 * |---|---|---|
 * | 무엇이 날짜를 정하나 | 사용자가 고른 **요일** | 시작일 + **6일 주기** |
 * | 주기 | 7일 (요일은 7일마다 돌아온다) | **6일** (훈련 5 + 휴식 1) |
 * | 휴식일 | 고르지 않은 요일 = 결과적으로 쉼 | **프로그램이 정한다** |
 *
 * 가운데 줄이 합칠 수 없는 이유다. 요일 목록은 7일마다 반복되므로 **6일
 * 주기를 표현할 방법이 아예 없다.** 월~금(주 5회)으로 근사하면 5일 훈련 뒤
 * **2일**을 쉬게 되고, 그건 원문의 루틴이 아니다.
 *
 * ⚠️ 그런데도 `preferredSlots`를 만들어 돌려준다. 등록 RPC가 서로 다른 요일
 *    2~5개를 **요구**하기 때문이다(0066). 사다리에서 그 값은 날짜를 정하지
 *    않는다 — 회차 시각(`program_scheduled_time_mismatch` 검사)을 통과시키는
 *    역할만 한다. 첫 주기 5일의 요일을 쓰므로 언제나 서로 다른 5개가 된다.
 */
export function buildLadderSchedule(input: {
  startDate: string;
  /** 매 회차의 현지 시각 `HH:MM`. 사다리는 모든 회차가 같은 시각이다 */
  time: string;
  timeZone: string;
}): { plans: ProgramScheduleItem[]; preferredSlots: PreferredSlot[] } {
  const keys = ["A", "B", "C"] as const;

  const plans = Array.from({ length: LADDER_SESSIONS }, (_, index) => {
    const date = addDaysToDateKey(input.startDate, ladderDayOffset(index + 1));
    return {
      date,
      // 날짜·시각·시간대 검증은 이 함수가 한다 — 이상하면 여기서 던진다
      scheduledAt: localDateTimeToIso(date, input.time, input.timeZone),
      week: Math.floor(index / 3) + 1,
      session: ((index % 3) + 1) as 1 | 2 | 3,
      templateKey: keys[index % 3],
    };
  });

  /*
    첫 주기 5일의 요일. 5일 연속이라 **언제나 서로 다른 5개**다 — 시작
    요일이 무엇이든 RPC의 "서로 다른 요일 2~5개"를 만족한다.
  */
  const preferredSlots = plans.slice(0, 5).map((plan) => ({
    weekday: weekdayOf(plan.date),
    time: input.time,
  }));

  return { plans, preferredSlots };
}

function weekdayOf(dateKey: string): PreferredSlot["weekday"] {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as
    PreferredSlot["weekday"];
}

/**
 * 사다리 일정을 사람이 읽는 줄로 — 미리보기 화면이 쓴다.
 *
 * 훈련일만 나열하면 "왜 하루가 비지?"를 화면이 설명하지 못한다. 쉬는 날을
 * **명시적으로 끼워** 돌려준다.
 */
export type LadderCalendarRow =
  | { kind: "session"; session: number; date: string }
  | { kind: "rest"; date: string };

export function ladderCalendarRows(
  plans: readonly ProgramScheduleItem[],
): LadderCalendarRow[] {
  const rows: LadderCalendarRow[] = [];
  plans.forEach((plan, index) => {
    rows.push({ kind: "session", session: index + 1, date: plan.date });
    const next = plans[index + 1];
    if (!next) return;
    // 다음 회차까지 하루가 비면 그 자리가 원문의 "6일 차 휴식"이다
    for (
      let date = addDaysToDateKey(plan.date, 1);
      date < next.date;
      date = addDaysToDateKey(date, 1)
    ) {
      rows.push({ kind: "rest", date });
    }
  });
  return rows;
}
