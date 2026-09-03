import {
  localDateTimeToIso,
  type PreferredSlot,
  type ProgramPlanForReschedule,
  type ProgramPlanMove,
  type ProgramScheduleItem,
} from "./program-schedule";
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
 * 사다리의 「남은 일정 다시 잡기」 — **주기로 다시 깐다.**
 *
 * ⚠️ **공용 `buildMissedSessionProposal`을 사다리에 쓰지 마라.** 그것은
 *    `preferredSlots`의 **요일**로 다음 자리를 고른다. 사다리의 슬롯은 날짜를
 *    정하는 값이 아니라 **첫 주기 5일의 요일**일 뿐이다(등록 RPC가 서로 다른
 *    요일 2~5개를 요구해서 채워 보낸다 — 위 `buildLadderSchedule` 주석).
 *    그 값으로 다시 잡으면 6일 주기가 **7일로 근사**되어 5일 훈련 뒤 **2일**을
 *    쉬게 된다.
 *
 * ⚠️⚠️ 그런데도 **오류가 안 난다.** 모든 회차가 같은 시각이라
 *    `program_scheduled_time_mismatch`를 통과하고, 날짜도 오름차순이라
 *    `program_plan_date_order`도 통과한다. RPC가 받아 주므로 화면에는 아무
 *    일도 안 일어난 것처럼 보이고 **조용히 틀린 날짜가 깔린다.**
 *    (2026-09-04 인수인계서 §2-2에서 넘겨받은 자리다.)
 *
 * ── 무엇을 하나 ──────────────────────────────────────────────
 * 마치지 않은 회차를 **회차 순서 그대로** 다시 시작점부터 5일 훈련·1일 휴식로
 * 깐다. 다시 시작점은 `오늘`과 `마지막으로 마친 날 + 1일` 중 **나중**이다.
 *
 * 원문이 정하는 것은 "session 7이 며칠"이 아니라 **리듬**이다. 그래서 원래
 * 시작일의 주기 위상을 되살리지 않고 **다시 시작하는 날부터** 리듬을 센다.
 * 위상을 지키려 하면 재개 첫날 바로 다음이 휴식이 되는 일이 생긴다.
 *
 * ⚠️ 공용 함수와 달리 **`occupiedDates`를 받지 않는다.** 0102로 같은 날에
 *    계획을 여러 개 담을 수 있게 되어 남의 계획을 피할 이유가 사라졌고,
 *    피하려 들면 그 순간 주기가 깨진다. 주기가 이 프로그램의 전부다.
 *
 * ⚠️ 한계: 뒤 회차를 먼저 마치고 앞 회차를 건너뛴 경우(4회차 미완 · 5회차 완료)는
 *    고칠 수 없다. 마친 회차는 안 옮기는데 앞 회차를 오늘 이후로 밀면 순서가
 *    역행하기 때문이다. RPC가 `program_plan_date_order`로 **원자적으로 거부**하고
 *    화면은 실패를 알린다 — 공용 함수도 같은 한계를 갖는다.
 */
export function buildLadderMissedSessionProposal(input: {
  plans: readonly ProgramPlanForReschedule[];
  todayKey: string;
  /** 회차 시각 `HH:MM`. 사다리는 모든 회차가 같은 시각이다 */
  time: string;
  timeZone: string;
}): ProgramPlanMove[] {
  assertDateKey(input.todayKey, "program_invalid_today");

  const ids = new Set<string>();
  const dates = new Set<string>();
  for (const plan of input.plans) {
    if (!plan.id || ids.has(plan.id)) throw new Error("program_invalid_plan_id");
    assertDateKey(plan.date, "program_invalid_plan_date");
    if (dates.has(plan.date)) throw new Error("program_plan_date_duplicate");
    ids.add(plan.id);
    dates.add(plan.date);
  }

  const ordered = input.plans
    .map((plan, index) => ({ plan, index }))
    .sort((a, b) => a.plan.date.localeCompare(b.plan.date) || a.index - b.index)
    .map(({ plan }) => plan);

  // 지난 회차 중 안 마친 것이 하나도 없으면 다시 잡을 이유가 없다.
  if (!ordered.some((plan) => !plan.completed && plan.date < input.todayKey)) {
    return [];
  }

  /*
    마친 회차는 제자리에 남으므로, 다시 까는 첫 날은 **그 뒤**여야 한다.
    오늘 이미 하나 마쳤는데 오늘로 잡으면 같은 날 두 회차가 되어 RPC가
    배치 전체를 거부한다(`program_plan_date_order`).
  */
  const lastCompleted = ordered
    .filter((plan) => plan.completed)
    .reduce<string | null>(
      (latest, plan) => (latest && latest >= plan.date ? latest : plan.date),
      null,
    );
  const resumeStart = lastCompleted
    ? laterDateKey(input.todayKey, addDaysToDateKey(lastCompleted, 1))
    : input.todayKey;

  const moves: ProgramPlanMove[] = [];
  let remainingIndex = 0;
  for (const plan of ordered) {
    if (plan.completed) continue;
    // `ladderDayOffset`은 1-based 회차를 받는다 — 여기서도 같은 주기를 쓴다
    const date = addDaysToDateKey(
      resumeStart,
      ladderDayOffset(remainingIndex + 1),
    );
    remainingIndex += 1;
    if (date === plan.date) continue;
    moves.push({
      planId: plan.id,
      fromDate: plan.date,
      suggestedDate: date,
      // 날짜·시각·시간대 검증은 이 함수가 한다 — 이상하면 여기서 던진다
      scheduledAt: localDateTimeToIso(date, input.time, input.timeZone),
    });
  }
  return moves;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(value: string, error: string): void {
  if (!DATE_KEY.test(value)) throw new Error(error);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(error);
  }
}

function laterDateKey(left: string, right: string): string {
  return left >= right ? left : right;
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
