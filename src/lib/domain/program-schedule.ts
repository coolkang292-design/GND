import { addDaysToDateKey } from "./workout-plan";

export type PreferredSlot = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  time: string;
};

export type ProgramScheduleItem = {
  date: string;
  scheduledAt: string;
  week: number;
  session: 1 | 2 | 3;
  templateKey: "A" | "B" | "C";
};

export type ScheduleConflict = {
  date: string;
  suggestedDate: string;
  scheduledAt: string;
};

export type ProgramPlanForReschedule = {
  id: string;
  date: string;
  completed: boolean;
};

export type ProgramPlanMove = {
  planId: string;
  fromDate: string;
  suggestedDate: string;
  scheduledAt: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TEMPLATE_KEYS = ["A", "B", "C"] as const;

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseDateKey(value: string, error = "program_invalid_date") {
  if (!DATE_KEY.test(value)) throw new Error(error);
  const [year, month, day] = value.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    throw new Error(error);
  }
  return { year, month, day };
}

function parseTime(value: string) {
  if (!TIME_KEY.test(value)) throw new Error("program_invalid_time");
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    throw new Error("program_invalid_timezone");
  }
}

function wallClock(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): WallClock {
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** IANA 시간대의 현지 날짜·시각을 UTC ISO 순간으로 변환한다. */
export function localDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  const { year, month, day } = parseDateKey(date);
  const { hour, minute } = parseTime(time);
  const formatter = formatterFor(timeZone);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const probeTimestamp = desired + hours * 3_600_000;
    const actual = wallClock(new Date(probeTimestamp), formatter);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    offsets.add(actualAsUtc - probeTimestamp);
  }

  const matches = [...offsets]
    .map((offset) => new Date(desired - offset))
    .filter((candidate) => {
      const resolved = wallClock(candidate, formatter);
      return (
        resolved.year === year &&
        resolved.month === month &&
        resolved.day === day &&
        resolved.hour === hour &&
        resolved.minute === minute &&
        resolved.second === 0
      );
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (matches.length === 0) {
    throw new Error("program_local_time_missing");
  }
  return matches[0].toISOString();
}

function weekdayOf(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export const MIN_SESSIONS_PER_WEEK = 2;
export const MAX_SESSIONS_PER_WEEK = 5;

function validateSlots(slots: readonly PreferredSlot[]): void {
  /*
    주당 횟수는 사용자가 정한다 (사용자 확정 2026-08-12).

    2~5개를 받는다. **총 18회는 그대로다** — 주당 횟수는 18회를 며칠에 나눠
    담을지만 정하고, 기간이 그만큼 늘거나 줄어든다.

    ⚠️ 회차 번호(`week` 1~6 · `session` 1~3)는 주당 횟수와 **무관하다.**
       이 함수 아래의 배치는 날짜 순서로 18칸을 채우고 A·B·C를 돌 뿐이라,
       주 2회든 5회든 같은 번호가 나온다. 0066의 컬럼 제약도 그대로 지켜진다.

    ⚠️ 상한 5는 회복 때문이 아니라 **A·B·C 세 회차 구성** 때문이다. 주 6~7회면
       같은 회차를 한 주에 세 번 하게 되어 프로그램이 의미를 잃는다.
  */
  if (slots.length < MIN_SESSIONS_PER_WEEK || slots.length > MAX_SESSIONS_PER_WEEK) {
    throw new Error("program_slots_count");
  }
  const weekdays = new Set<number>();
  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) {
      throw new Error("program_invalid_weekday");
    }
    parseTime(slot.time);
    if (weekdays.has(slot.weekday)) {
      throw new Error("program_slot_weekday_duplicate");
    }
    weekdays.add(slot.weekday);
  }

  /*
    요일 간격 제한을 없앴다 (사용자 확정 2026-08-12).

    예전에는 요일 사이 2일 이상을 요구해 **금·토·일처럼 몰아서 하는 사람을
    막고** 있었다. 주 3회라는 약속은 유지하되, 언제 하는지는 사용자가 정한다.

    ⚠️ 서로 다른 요일 3개라는 조건은 위에서 이미 지킨다 — 같은 날 두 회차는
       주 3회가 아니다.
  */
}

function validateOccupiedDates(occupiedDates: ReadonlySet<string>): void {
  for (const date of occupiedDates) {
    parseDateKey(date, "program_invalid_occupied_date");
  }
}

function laterDate(a: string, b: string): string {
  return a > b ? a : b;
}

function daysBetween(a: string, b: string): number {
  const first = parseDateKey(a);
  const second = parseDateKey(b);
  return Math.abs(
    (Date.UTC(second.year, second.month - 1, second.day) -
      Date.UTC(first.year, first.month - 1, first.day)) /
      86_400_000,
  );
}

function isAvailableProgramDate(
  date: string,
  blockedDates: ReadonlySet<string>,
  fixedProgramDates: readonly string[],
): boolean {
  // 확정된 회차와 **같은 날만** 피한다. 2일 간격을 요구하던 것을 없앴다
  // (사용자 확정 2026-08-12) — 금·토·일처럼 몰아서 하는 일정을 막고 있었다.
  return (
    !blockedDates.has(date) &&
    fixedProgramDates.every((fixedDate) => daysBetween(fixedDate, date) >= 1)
  );
}

function chooseProgramDate(input: {
  minimumDate: string;
  slotsByWeekday: ReadonlyMap<number, PreferredSlot>;
  blockedDates: ReadonlySet<string>;
  fixedProgramDates: readonly string[];
  fallbackTime: string;
}): { date: string; time: string } {
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDaysToDateKey(input.minimumDate, offset);
    const slot = input.slotsByWeekday.get(weekdayOf(candidate));
    if (
      slot &&
      isAvailableProgramDate(
        candidate,
        input.blockedDates,
        input.fixedProgramDates,
      )
    ) {
      return { date: candidate, time: slot.time };
    }
  }

  let candidate = input.minimumDate;
  for (let attempts = 0; attempts < 10_000; attempts += 1) {
    if (
      isAvailableProgramDate(
        candidate,
        input.blockedDates,
        input.fixedProgramDates,
      )
    ) {
      return { date: candidate, time: input.fallbackTime };
    }
    candidate = addDaysToDateKey(candidate, 1);
  }
  throw new Error("program_schedule_unavailable");
}

export function buildProgramSchedule(input: {
  startDate: string;
  slots: readonly PreferredSlot[];
  timeZone: string;
  occupiedDates: ReadonlySet<string>;
}): { plans: ProgramScheduleItem[]; conflicts: ScheduleConflict[] } {
  parseDateKey(input.startDate);
  validateSlots(input.slots);
  validateOccupiedDates(input.occupiedDates);
  formatterFor(input.timeZone);

  const slotsByWeekday = new Map<number, PreferredSlot>(
    input.slots.map((slot) => [slot.weekday, slot] as const),
  );
  const originalPlans: ProgramScheduleItem[] = [];
  let date = input.startDate;

  while (originalPlans.length < 18) {
    const slot = slotsByWeekday.get(weekdayOf(date));
    if (slot) {
      const index = originalPlans.length;
      const session = ((index % 3) + 1) as 1 | 2 | 3;
      originalPlans.push({
        date,
        scheduledAt: localDateTimeToIso(date, slot.time, input.timeZone),
        week: Math.floor(index / 3) + 1,
        session,
        templateKey: TEMPLATE_KEYS[index % 3],
      });
    }
    date = addDaysToDateKey(date, 1);
  }

  const plans: ProgramScheduleItem[] = [];
  const conflicts: ScheduleConflict[] = [];
  let nextAllowedDate = input.startDate;
  for (const original of originalPlans) {
    const originalSlot = slotsByWeekday.get(weekdayOf(original.date));
    if (!originalSlot) throw new Error("program_slot_missing");
    const selected = chooseProgramDate({
      minimumDate: laterDate(original.date, nextAllowedDate),
      slotsByWeekday,
      blockedDates: input.occupiedDates,
      fixedProgramDates: plans.map((plan) => plan.date),
      fallbackTime: originalSlot.time,
    });
    const scheduledAt = localDateTimeToIso(
      selected.date,
      selected.time,
      input.timeZone,
    );
    plans.push({
      ...original,
      date: selected.date,
      scheduledAt,
    });
    // 같은 날 두 회차만 막는다 — 회복 간격 제한은 없앴다 (2026-08-12)
    nextAllowedDate = addDaysToDateKey(selected.date, 1);
    if (selected.date !== original.date) {
      conflicts.push({
        date: original.date,
        suggestedDate: selected.date,
        scheduledAt,
      });
    }
  }

  return { plans, conflicts };
}

export function buildMissedSessionProposal(input: {
  plans: readonly ProgramPlanForReschedule[];
  todayKey: string;
  preferredSlots: readonly PreferredSlot[];
  timeZone: string;
  occupiedDates: ReadonlySet<string>;
}): ProgramPlanMove[] {
  parseDateKey(input.todayKey, "program_invalid_today");
  validateSlots(input.preferredSlots);
  validateOccupiedDates(input.occupiedDates);
  formatterFor(input.timeZone);

  const ids = new Set<string>();
  const dates = new Set<string>();
  for (const plan of input.plans) {
    if (!plan.id || ids.has(plan.id)) throw new Error("program_invalid_plan_id");
    parseDateKey(plan.date, "program_invalid_plan_date");
    if (dates.has(plan.date)) throw new Error("program_plan_date_duplicate");
    ids.add(plan.id);
    dates.add(plan.date);
  }

  const ordered = input.plans
    .map((plan, index) => ({ plan, index }))
    .sort(
      (a, b) =>
        a.plan.date.localeCompare(b.plan.date) || a.index - b.index,
    )
    .map(({ plan }) => plan);
  if (
    !ordered.some(
      (plan) => !plan.completed && plan.date < input.todayKey,
    )
  ) {
    return [];
  }

  const blocked = new Set(input.occupiedDates);
  const completedDates = ordered
    .filter((plan) => plan.completed)
    .map((plan) => plan.date);
  const slotsByWeekday = new Map<number, PreferredSlot>(
    input.preferredSlots.map((slot) => [slot.weekday, slot] as const),
  );

  const moves: ProgramPlanMove[] = [];
  let cursor = input.todayKey;
  const assignedDates: string[] = [];
  for (const plan of ordered) {
    if (plan.completed) continue;
    const originalSlot = slotsByWeekday.get(weekdayOf(plan.date));
    const selected = chooseProgramDate({
      minimumDate: laterDate(plan.date, cursor),
      slotsByWeekday,
      blockedDates: blocked,
      fixedProgramDates: [...completedDates, ...assignedDates],
      fallbackTime: originalSlot?.time ?? input.preferredSlots[0].time,
    });
    assignedDates.push(selected.date);
    // 재배치도 같은 규칙 — 하루 간격만 지킨다 (2026-08-12)
    cursor = addDaysToDateKey(selected.date, 1);
    if (selected.date !== plan.date) {
      moves.push({
        planId: plan.id,
        fromDate: plan.date,
        suggestedDate: selected.date,
        scheduledAt: localDateTimeToIso(
          selected.date,
          selected.time,
          input.timeZone,
        ),
      });
    }
  }
  return moves;
}
