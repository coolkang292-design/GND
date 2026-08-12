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
  let timestamp = desired;

  // time.ts와 같은 벽시계 차이 보정 방식이다. DST 전환도 수렴하도록 여유 있게 반복한다.
  for (let index = 0; index < 4; index += 1) {
    const actual = wallClock(new Date(timestamp), formatter);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = desired - actualAsUtc;
    if (correction === 0) break;
    timestamp += correction;
  }

  const result = new Date(timestamp);
  const resolved = wallClock(result, formatter);
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute ||
    resolved.second !== 0
  ) {
    throw new Error("program_local_time_missing");
  }
  return result.toISOString();
}

function weekdayOf(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function validateSlots(slots: readonly PreferredSlot[]): void {
  if (slots.length !== 3) throw new Error("program_slots_count");
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

  const ordered = [...weekdays].sort((a, b) => a - b);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const next = ordered[(index + 1) % ordered.length];
    const gap = (next - current + 7) % 7;
    if (gap < 2) throw new Error("program_recovery_gap");
  }
}

function validateOccupiedDates(occupiedDates: ReadonlySet<string>): void {
  for (const date of occupiedDates) {
    parseDateKey(date, "program_invalid_occupied_date");
  }
}

function closestAvailableFutureDate(
  date: string,
  blockedDates: ReadonlySet<string>,
): string {
  let candidate = addDaysToDateKey(date, 1);
  while (blockedDates.has(candidate)) {
    candidate = addDaysToDateKey(candidate, 1);
  }
  return candidate;
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
  const plans: ProgramScheduleItem[] = [];
  let date = input.startDate;

  while (plans.length < 18) {
    const slot = slotsByWeekday.get(weekdayOf(date));
    if (slot) {
      const index = plans.length;
      const session = ((index % 3) + 1) as 1 | 2 | 3;
      plans.push({
        date,
        scheduledAt: localDateTimeToIso(date, slot.time, input.timeZone),
        week: Math.floor(index / 3) + 1,
        session,
        templateKey: TEMPLATE_KEYS[index % 3],
      });
    }
    date = addDaysToDateKey(date, 1);
  }

  const originalDates = new Set(plans.map((plan) => plan.date));
  const blockedDates = new Set([...input.occupiedDates, ...originalDates]);
  const conflicts: ScheduleConflict[] = [];
  for (const plan of plans) {
    if (!input.occupiedDates.has(plan.date)) continue;
    const suggestedDate = closestAvailableFutureDate(plan.date, blockedDates);
    blockedDates.add(suggestedDate);
    conflicts.push({ date: plan.date, suggestedDate });
  }

  return { plans, conflicts };
}

export function buildMissedSessionProposal(input: {
  plans: readonly ProgramPlanForReschedule[];
  todayKey: string;
  occupiedDates: ReadonlySet<string>;
}): ProgramPlanMove[] {
  parseDateKey(input.todayKey, "program_invalid_today");
  validateOccupiedDates(input.occupiedDates);

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
  for (const plan of ordered) {
    if (plan.completed) blocked.add(plan.date);
  }

  const moves: ProgramPlanMove[] = [];
  let cursor = input.todayKey;
  for (const plan of ordered) {
    if (plan.completed) continue;
    let candidate = plan.date > cursor ? plan.date : cursor;
    while (blocked.has(candidate)) {
      candidate = addDaysToDateKey(candidate, 1);
    }
    blocked.add(candidate);
    cursor = addDaysToDateKey(candidate, 1);
    if (candidate !== plan.date) {
      moves.push({
        planId: plan.id,
        fromDate: plan.date,
        suggestedDate: candidate,
      });
    }
  }
  return moves;
}
