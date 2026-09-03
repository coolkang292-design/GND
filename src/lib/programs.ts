import {
  INTERVAL_SLOTS,
  PROGRAM_LEVELS,
  intervalExerciseName,
  intervalMinutesForWeek,
  ladderDayOfSession,
  ladderLevelForMaxReps,
  type IntervalProgram,
  type LadderProgram,
  type ProgramLevel,
  type ResolvedIntervalExercise,
  type ResolvedProgramExercise,
  type StrengthProgram,
} from "@/lib/domain/official-programs";
import {
  LADDER_SESSIONS,
  isLadderMaxReps,
  ladderLabel,
  ladderRepsForDay,
} from "@/lib/domain/pullup-ladder";
import { buildLadderSchedule } from "@/lib/domain/ladder-schedule";
import { tabataRepsForMinutes, type TabataMinutes } from "@/lib/domain/tabata";
import {
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  type PreferredSlot,
  type ProgramPlanMove,
  type ProgramScheduleItem,
} from "@/lib/domain/program-schedule";
import type { PlanExercise, PlanSet } from "@/lib/domain/workout-plan";
import type { CatalogExercise } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ProgramEnrollment = {
  id: string;
  programKey: string;
  programVersion: number;
  title: string;
  levelAtStart: ProgramLevel;
  startDate: string;
  timeZone: string;
  preferredSlots: PreferredSlot[];
  status: "active" | "completed" | "cancelled";
};

export type ResolvedProgramSession = {
  key: "A" | "B" | "C";
  title: string;
  exercises: readonly ResolvedProgramExercise[];
};

export type ResolvedIntervalSession = {
  key: "A" | "B" | "C";
  title: string;
  exercises: readonly ResolvedIntervalExercise[];
};

export type CreateProgramEnrollmentInput = {
  /** 근력 전용. 인터벌은 `CreateIntervalEnrollmentInput`이 따로 받는다 */
  program: StrengthProgram;
  sessions: readonly ResolvedProgramSession[];
  schedule: readonly ProgramScheduleItem[];
  /**
   * 근력은 **두 단계뿐**이다 — 세트 수를 가른다. `moderate`는 인터벌 전용이라
   * 여기 들어오면 `toPlanExercise`가 세트 수를 못 정한다.
   *
   * ⚠️ 읽는 쪽(`ProgramEnrollment`)은 세 단계를 다 받아야 한다. 인터벌 등록도
   *    같은 테이블에 들어가기 때문이다 (운영 장애 2026-08-13).
   */
  levelAtStart: "beginner" | "experienced";
  startDate: string;
  timeZone: string;
  preferredSlots: readonly PreferredSlot[];
};

type ProgramPlanPayload = {
  plan_date: string;
  scheduled_at: string;
  week: number;
  session: 1 | 2 | 3;
  template_key: "A" | "B" | "C";
  title: string;
  exercises: PlanExercise[];
  /** 인터벌 회차에만 실린다 (0070). 이 한 칸이 회차 종류를 가른다 */
  tabata_minutes?: TabataMinutes;
  /**
   * 회차 종류 (0100).
   *
   * ⚠️ **근력·인터벌은 이 칸을 안 보낸다.** RPC가 없으면 예전 규칙으로
   *    (인터벌 아니면 근력) 판정하기 때문이다 — 보내기 시작하면 마이그레이션
   *    적용 전 배포에서 등록이 통째로 막힌다. 사다리만 채운다.
   */
  plan_kind?: "ladder";
};

/**
 * 인터벌 등록 입력.
 *
 * 근력(`CreateProgramEnrollmentInput`)과 **합치지 않았다.** 회차 모양이 달라서
 * (종목 4개 · 세트 1개 · 처방 없음 · `tabata_minutes`) 한 타입에 담으면 모든
 * 검증이 "이 회차는 어느 종류인가"로 갈라진다. 날짜·요일 규칙만 함께 쓴다.
 */
export type CreateIntervalEnrollmentInput = {
  program: IntervalProgram;
  sessions: readonly ResolvedIntervalSession[];
  schedule: readonly ProgramScheduleItem[];
  levelAtStart: ProgramLevel;
  startDate: string;
  timeZone: string;
  preferredSlots: readonly PreferredSlot[];
};

export type CreateProgramEnrollmentRpcArgs = {
  p_program_key: string;
  p_program_version: number;
  p_title_snapshot: string;
  p_level_at_start: ProgramLevel;
  p_start_date: string;
  p_timezone: string;
  p_preferred_slots: PreferredSlot[];
  p_plans: ProgramPlanPayload[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ZERO_SET: PlanSet = {
  weightKg: 0,
  reps: 0,
  distanceKm: 0,
  durationMin: 0,
};

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 60) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function parsePreferredSlots(value: unknown): PreferredSlot[] | null {
  /*
    주당 횟수는 2~5회다 (사용자 확정 2026-08-12). **총 18회는 그대로다.**

    ⚠️ 이 함수는 등록 검증과 조회 복원 양쪽이 쓴다. 여기서 3개만 받으면 주 2·4·5회로
       등록한 사람의 프로그램 화면이 통째로 죽는다 — 0069에서 겪은 것과 같은 함정이다.
  */
  if (
    !Array.isArray(value) ||
    value.length < MIN_SESSIONS_PER_WEEK ||
    value.length > MAX_SESSIONS_PER_WEEK
  ) {
    return null;
  }
  const slots: PreferredSlot[] = [];
  const weekdays = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (
      !Number.isInteger(row.weekday) ||
      typeof row.weekday !== "number" ||
      row.weekday < 0 ||
      row.weekday > 6 ||
      typeof row.time !== "string" ||
      !TIME_KEY.test(row.time) ||
      weekdays.has(row.weekday)
    ) {
      return null;
    }
    weekdays.add(row.weekday);
    slots.push({
      weekday: row.weekday as PreferredSlot["weekday"],
      time: row.time,
    });
  }
  /*
    요일 사이 2일 간격을 요구하던 검사를 없앴다 (사용자 확정 2026-08-12).

    ⚠️ 이 함수는 **등록 검증과 조회 복원 양쪽**이 쓴다. 간격 검사가 남아 있으면
       금·토·일 등록이 RPC에 닿기도 전에 program_invalid_slots로 죽고, 설령
       저장돼도 조회가 program_invalid_enrollment_row로 fail-closed 막아
       프로그램 화면 전체가 죽는다.

    서로 다른 요일(위 weekdays 중복 검사)이라는 조건만 남는다 — 같은 날 두 회차는
    하루에 두 번이지 주 N회가 아니다. DB 함수와 program-schedule.ts의
    validateSlots도 같은 규칙이다.
  */
  return slots;
}

function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(iso));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === name)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${String(Number(part("hour")) % 24).padStart(2, "0")}:${part("minute")}`,
  };
}

function dateDays(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function validateEnrollmentInput(input: CreateProgramEnrollmentInput): void {
  if (!isDateKey(input.startDate)) throw new Error("program_invalid_start_date");
  if (!isTimeZone(input.timeZone)) throw new Error("program_invalid_timezone");
  if (
    input.preferredSlots.length < MIN_SESSIONS_PER_WEEK ||
    input.preferredSlots.length > MAX_SESSIONS_PER_WEEK
  ) {
    throw new Error("program_slots_count");
  }
  const slots = parsePreferredSlots(input.preferredSlots);
  if (!slots) throw new Error("program_invalid_slots");

  const keys = ["A", "B", "C"] as const;
  if (
    input.program.sessions.length !== 3 ||
    input.sessions.length !== 3 ||
    keys.some(
      (key, index) =>
        input.program.sessions[index]?.key !== key ||
        input.sessions[index]?.key !== key,
    )
  ) {
    throw new Error("program_template_keys");
  }

  const prescriptionKeys = [
    "exerciseName",
    "beginnerSets",
    "experiencedSets",
    "repsMin",
    "repsMax",
    "targetRir",
    "restSeconds",
    "loadStepKg",
  ] as const;
  for (let index = 0; index < keys.length; index += 1) {
    const template = input.program.sessions[index];
    const resolved = input.sessions[index];
    const mismatched =
      template.title !== resolved.title ||
      template.exercises.length !== resolved.exercises.length ||
      template.exercises.some((exercise, exerciseIndex) => {
        const resolvedExercise = resolved.exercises[exerciseIndex];
        return (
          !resolvedExercise ||
          prescriptionKeys.some(
            (key) => exercise[key] !== resolvedExercise[key],
          )
        );
      });
    if (mismatched) {
      throw new Error(`program_template_mismatch:${keys[index]}`);
    }
    for (const exercise of resolved.exercises) {
      if (
        exercise.item.name !== exercise.exerciseName ||
        exercise.item.created_by !== null ||
        exercise.item.is_custom !== false
      ) {
        throw new Error(
          `program_catalog_item_invalid:${exercise.exerciseName}`,
        );
      }
    }
  }

  validateSchedule(input, slots);
}

/**
 * 날짜·시각 규칙 — 근력과 인터벌이 **똑같이** 지킨다.
 *
 * 두 등록 경로가 이 함수를 함께 쓴다. 한쪽에만 규칙을 고치면 같은 앱에서
 * 프로그램 종류에 따라 일정이 달라진다.
 */
function validateSchedule(
  input: {
    schedule: readonly ProgramScheduleItem[];
    startDate: string;
    timeZone: string;
  },
  slots: readonly PreferredSlot[],
  /**
   * 이 프로그램의 회차 수 (2026-09-04).
   *
   * 예전에는 18이 여기 박혀 있었다. 사다리가 24회가 되면서 프로그램마다
   * 달라졌다 — DB의 회차 수 검사(0101)와 **같은 값**이어야 하고, 갈라지면
   * 화면은 통과시키는데 서버가 거절한다.
   */
  totalSessions = 18,
): void {
  const keys = ["A", "B", "C"] as const;
  if (input.schedule.length !== totalSessions) {
    throw new Error("program_plans_count");
  }
  const dates = new Set<string>();
  const allowedTimes = new Set(slots.map((slot) => slot.time));
  let previousDate: string | null = null;
  for (const [index, plan] of input.schedule.entries()) {
    const expectedSession = ((index % 3) + 1) as 1 | 2 | 3;
    if (
      plan.week !== Math.floor(index / 3) + 1 ||
      plan.session !== expectedSession ||
      plan.templateKey !== keys[index % 3]
    ) {
      throw new Error("program_invalid_slot_order");
    }
    if (!isDateKey(plan.date) || plan.date < input.startDate) {
      throw new Error("program_invalid_plan_date");
    }
    if (dates.has(plan.date)) {
      throw new Error(`program_plan_date_duplicate:${plan.date}`);
    }
    dates.add(plan.date);
    // 회복 간격 제한은 없앴다 (사용자 확정 2026-08-12). 날짜가 뒤로 가거나
    // 같은 날이 두 번 오는 것만 막는다 — 그건 주 3회가 아니다.
    if (previousDate && dateDays(plan.date) - dateDays(previousDate) < 1) {
      throw new Error("program_plan_date_order");
    }
    previousDate = plan.date;
    if (
      typeof plan.scheduledAt !== "string" ||
      !Number.isFinite(Date.parse(plan.scheduledAt)) ||
      new Date(plan.scheduledAt).toISOString() !== plan.scheduledAt
    ) {
      throw new Error("program_invalid_scheduled_at");
    }
    const local = localParts(plan.scheduledAt, input.timeZone);
    if (local.date !== plan.date) {
      throw new Error("program_scheduled_date_mismatch");
    }
    if (!allowedTimes.has(local.time)) {
      throw new Error("program_scheduled_time_mismatch");
    }
  }
}

function parseProgramEnrollmentRow(value: unknown): ProgramEnrollment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const slots = parsePreferredSlots(row.preferred_slots);
  if (
    typeof row.id !== "string" ||
    !UUID.test(row.id) ||
    typeof row.program_key !== "string" ||
    row.program_key.length === 0 ||
    row.program_key.length > 60 ||
    !Number.isInteger(row.program_version) ||
    typeof row.program_version !== "number" ||
    row.program_version < 1 ||
    row.program_version > 10_000 ||
    typeof row.title_snapshot !== "string" ||
    row.title_snapshot.trim().length === 0 ||
    row.title_snapshot.length > 80 ||
    /*
      ⚠️ **`moderate`를 빼면 프로그램 화면이 통째로 죽는다** (운영 장애 2026-08-13).

      이 검증은 fail-closed다 — 한 행이라도 걸리면 `null`이 되고 화면은
      "프로그램 정보를 불러오지 못했어요"만 남는다. 0070으로 난이도 3단계를
      열어 놓고 **읽는 쪽을 안 넓혀서**, 인터벌을 `보통`으로 등록한 사람은
      프로그램 탭에 아예 들어가지 못했다.

      0069에서 `parsePreferredSlots`로 똑같이 당했다. 쓰는 쪽을 넓히면 **읽는
      쪽도 같이** 넓혀야 한다.
    */
    !PROGRAM_LEVELS.includes(row.level_at_start as ProgramLevel) ||
    !isDateKey(row.start_date) ||
    !isTimeZone(row.timezone) ||
    !slots ||
    !["active", "completed", "cancelled"].includes(row.status as string)
  ) {
    return null;
  }
  return {
    id: row.id,
    programKey: row.program_key,
    programVersion: row.program_version,
    title: row.title_snapshot.trim(),
    levelAtStart: row.level_at_start as ProgramEnrollment["levelAtStart"],
    startDate: row.start_date,
    timeZone: row.timezone,
    preferredSlots: slots,
    status: row.status as ProgramEnrollment["status"],
  };
}

function toPlanExercise(
  exercise: ResolvedProgramExercise,
  level: "beginner" | "experienced",
): PlanExercise {
  const setCount =
    level === "beginner" ? exercise.beginnerSets : exercise.experiencedSets;
  return {
    name: exercise.item.name,
    bodyPart: exercise.item.body_part,
    exerciseType: exercise.item.exercise_type,
    measure: exercise.item.measure,
    isCustom: exercise.item.is_custom,
    sets: Array.from({ length: setCount }, () => ({ ...ZERO_SET })),
    prescription: {
      repsMin: exercise.repsMin,
      repsMax: exercise.repsMax,
      targetRir: exercise.targetRir,
      restSeconds: exercise.restSeconds,
      loadStepKg: exercise.loadStepKg,
    },
  };
}

/** UI와 RPC가 서로 다른 JSON을 조립하지 않도록 등록 스냅샷을 한 곳에서 만든다. */
export function buildCreateProgramEnrollmentRpcArgs(
  input: CreateProgramEnrollmentInput,
): CreateProgramEnrollmentRpcArgs {
  validateEnrollmentInput(input);
  const sessions = new Map(input.sessions.map((session) => [session.key, session]));
  const plans = input.schedule.map((item): ProgramPlanPayload => {
    const template = sessions.get(item.templateKey);
    if (!template) {
      throw new Error(`program_template_missing:${item.templateKey}`);
    }
    return {
      plan_date: item.date,
      scheduled_at: item.scheduledAt,
      week: item.week,
      session: item.session,
      template_key: item.templateKey,
      title: input.program.title,
      exercises: template.exercises.map((exercise) =>
        toPlanExercise(exercise, input.levelAtStart),
      ),
    };
  });
  return {
    p_program_key: input.program.key,
    p_program_version: input.program.version,
    p_title_snapshot: input.program.title,
    p_level_at_start: input.levelAtStart,
    p_start_date: input.startDate,
    p_timezone: input.timeZone,
    p_preferred_slots: input.preferredSlots.map((slot) => ({ ...slot })),
    p_plans: plans,
  };
}

/**
 * 인터벌 등록 검증.
 *
 * 근력과 다른 것만 본다 — 회차마다 종목 4개, 난이도가 정한 종목과 실제 카탈로그
 * 항목이 같은지, 주차가 정한 길이가 음원에 있는 길이인지. 날짜·요일은
 * `validateSchedule`이 근력과 똑같이 본다.
 */
function validateIntervalEnrollmentInput(
  input: CreateIntervalEnrollmentInput,
): void {
  if (!isDateKey(input.startDate)) throw new Error("program_invalid_start_date");
  if (!isTimeZone(input.timeZone)) throw new Error("program_invalid_timezone");
  if (
    input.preferredSlots.length < MIN_SESSIONS_PER_WEEK ||
    input.preferredSlots.length > MAX_SESSIONS_PER_WEEK
  ) {
    throw new Error("program_slots_count");
  }
  const slots = parsePreferredSlots(input.preferredSlots);
  if (!slots) throw new Error("program_invalid_slots");

  const keys = ["A", "B", "C"] as const;
  if (
    input.program.sessions.length !== 3 ||
    input.sessions.length !== 3 ||
    keys.some(
      (key, index) =>
        input.program.sessions[index]?.key !== key ||
        input.sessions[index]?.key !== key,
    )
  ) {
    throw new Error("program_template_keys");
  }

  for (let index = 0; index < keys.length; index += 1) {
    const template = input.program.sessions[index];
    const resolved = input.sessions[index];
    if (
      template.title !== resolved.title ||
      resolved.exercises.length !== INTERVAL_SLOTS.length ||
      template.exercises.length !== INTERVAL_SLOTS.length
    ) {
      throw new Error(`program_template_mismatch:${keys[index]}`);
    }
    for (const [slotIndex, exercise] of resolved.exercises.entries()) {
      const expected = intervalExerciseName(
        template.exercises[slotIndex],
        input.levelAtStart,
      );
      if (
        exercise.slot !== template.exercises[slotIndex].slot ||
        exercise.exerciseName !== expected
      ) {
        throw new Error(`program_template_mismatch:${keys[index]}`);
      }
      if (
        exercise.item.name !== exercise.exerciseName ||
        exercise.item.created_by !== null ||
        exercise.item.is_custom !== false
      ) {
        throw new Error(
          `program_catalog_item_invalid:${exercise.exerciseName}`,
        );
      }
    }
  }

  validateSchedule(input, slots);
}

/**
 * 인터벌 등록 스냅샷을 만든다.
 *
 * ⚠️ 회차 길이는 **주차가 정한다** — 사용자가 고르지 않는다. 여기서 계산해
 *    payload에 실어야 6주 동안 양이 자란다 (설계 §3.4).
 * ⚠️ 처방(`prescription`)을 싣지 않는다. 20초/10초는 음원이 정하고, 0070이
 *    인터벌 회차에서는 처방을 요구하지 않는다.
 */
export function buildCreateIntervalEnrollmentRpcArgs(
  input: CreateIntervalEnrollmentInput,
): CreateProgramEnrollmentRpcArgs {
  validateIntervalEnrollmentInput(input);
  const sessions = new Map(
    input.sessions.map((session) => [session.key, session]),
  );
  const plans = input.schedule.map((item): ProgramPlanPayload => {
    const template = sessions.get(item.templateKey);
    if (!template) {
      throw new Error(`program_template_missing:${item.templateKey}`);
    }
    const minutes = intervalMinutesForWeek(
      input.program,
      input.levelAtStart,
      item.week,
    );
    /*
      횟수는 **길이가 정한다** — 한 종목이 도는 라운드 수다.
      4분 = 8라운드 ÷ 4종목 = 2회 · 8분 = 4회 · 16분 = 8회.

      ⚠️ 즉흥 인터벌(`tabataDraftExercises`)과 **같은 함수**를 쓴다. 여기서
         따로 계산하면 같은 운동을 프로그램으로 하느냐 즉흥으로 하느냐에 따라
         기록이 달라진다.
    */
    const reps = tabataRepsForMinutes(minutes);
    return {
      plan_date: item.date,
      scheduled_at: item.scheduledAt,
      week: item.week,
      session: item.session,
      template_key: item.templateKey,
      title: input.program.title,
      tabata_minutes: minutes,
      exercises: template.exercises.map((exercise) => ({
        name: exercise.item.name,
        bodyPart: exercise.item.body_part,
        exerciseType: exercise.item.exercise_type,
        measure: exercise.item.measure,
        isCustom: exercise.item.is_custom,
        sets: [{ ...ZERO_SET, reps }],
      })),
    };
  });
  return {
    p_program_key: input.program.key,
    p_program_version: input.program.version,
    p_title_snapshot: input.program.title,
    p_level_at_start: input.levelAtStart,
    p_start_date: input.startDate,
    p_timezone: input.timeZone,
    p_preferred_slots: input.preferredSlots.map((slot) => ({ ...slot })),
    p_plans: plans,
  };
}

/**
 * 사다리 등록 입력 (2026-09-04).
 *
 * 근력·인터벌과 **합치지 않았다** — 앞의 둘과 같은 이유다. 사다리는 회차
 * 템플릿이 없고(회차 번호가 곧 사다리다) 대신 **최대 개수 하나**를 받는다.
 * 한 타입에 담으면 모든 검증이 "이 회차는 어느 종류인가"로 갈라진다.
 * 날짜·요일 규칙(`validateSchedule`)만 셋이 함께 쓴다.
 */
export type CreateLadderEnrollmentInput = {
  program: LadderProgram;
  /** `resolveLadderProgram`이 카탈로그에서 찾아 준 공식 시드 행 */
  item: CatalogExercise;
  /** 사용자가 화면에서 입력한 지금 최대 개수 */
  maxReps: number;
  schedule: readonly ProgramScheduleItem[];
  startDate: string;
  timeZone: string;
  preferredSlots: readonly PreferredSlot[];
};

function validateLadderEnrollmentInput(
  input: CreateLadderEnrollmentInput,
): void {
  if (!isDateKey(input.startDate)) throw new Error("program_invalid_start_date");
  if (!isTimeZone(input.timeZone)) throw new Error("program_invalid_timezone");
  if (
    input.preferredSlots.length < MIN_SESSIONS_PER_WEEK ||
    input.preferredSlots.length > MAX_SESSIONS_PER_WEEK
  ) {
    throw new Error("program_slots_count");
  }
  const slots = parsePreferredSlots(input.preferredSlots);
  if (!slots) throw new Error("program_invalid_slots");

  // 사다리를 못 만드는 숫자면 여기서 멈춘다 — `ladderRepsForDay`가 회차마다
  // 같은 검사를 하지만, 18번 만들다 중간에 터지는 것보다 낫다
  if (!isLadderMaxReps(input.maxReps)) {
    throw new Error("program_invalid_max_reps");
  }

  /*
    동명 커스텀 종목이 골라지면 **남의 종목에 18회 계획을 심는다.**
    `resolveLadderProgram`이 이미 막지만, 화면을 거치지 않고 이 함수를
    부르는 길이 생겨도 뚫리지 않도록 여기서 한 번 더 잠근다
    (근력의 `program_catalog_item_invalid`와 같은 규칙).
  */
  if (
    input.item.name !== input.program.exerciseName ||
    input.item.created_by !== null ||
    input.item.is_custom !== false
  ) {
    throw new Error(`program_catalog_item_invalid:${input.item.name}`);
  }

  validateSchedule(input, slots, LADDER_SESSIONS);

  /*
    사다리는 **휴식일까지 프로그램이 정한다** (사장님 지시 2026-09-04).
    날짜가 5일 훈련 / 1일 휴식 주기에서 벗어나면 원문의 루틴이 아니다 —
    `validateSchedule`은 "날짜가 오름차순인가"까지만 보므로 여기서 주기를
    직접 확인한다.
  */
  const expected = buildLadderSchedule({
    startDate: input.startDate,
    time: input.preferredSlots[0].time,
    timeZone: input.timeZone,
  }).plans;
  input.schedule.forEach((slot, index) => {
    if (slot.date !== expected[index].date) {
      throw new Error(`program_invalid_plan_date:${slot.date}`);
    }
  });
}

/** UI와 RPC가 서로 다른 JSON을 조립하지 않도록 등록 스냅샷을 한 곳에서 만든다. */
export function buildCreateLadderEnrollmentRpcArgs(
  input: CreateLadderEnrollmentInput,
): CreateProgramEnrollmentRpcArgs {
  validateLadderEnrollmentInput(input);
  const { item, maxReps, program } = input;

  const plans = input.schedule.map((slot): ProgramPlanPayload => {
    /*
      며칠째인지는 **회차 번호가 말해 준다.** 배열 인덱스를 쓰지 않는 이유:
      계획 행에 남는 것은 `program_week`·`program_session`뿐이라, 나중에
      계획을 읽어 사다리를 되짚을 때 쓸 수 있는 열쇠가 그 둘이다. 만들 때와
      읽을 때가 같은 함수를 쓰게 해 둔다.
    */
    const day = ladderDayOfSession(slot.week, slot.session);
    const reps = ladderRepsForDay(maxReps, day);

    return {
      plan_date: slot.date,
      scheduled_at: slot.scheduledAt,
      week: slot.week,
      session: slot.session,
      // 사다리에서 A·B·C는 아무 뜻이 없다 — RPC가 위치로 요구해서 채운다
      template_key: slot.templateKey,
      // 0100이 이 한 칸으로 종목 1개·세트 5개를 허용한다
      plan_kind: "ladder",
      title: `풀업 사다리 ${day}일차 · ${ladderLabel(reps)}`,
      exercises: [
        {
          name: item.name,
          // 부위·유형·measure는 **카탈로그 행에서 읽는다**. 상수에 베끼면
          // 시드가 바뀔 때 두 곳이 갈라진다 (`preset-routines.ts`와 같은 규칙)
          bodyPart: item.body_part,
          exerciseType: item.exercise_type,
          measure: item.measure,
          isCustom: false,
          // 세트마다 목표 횟수가 **다르다**. 근력 프로그램은 빈 세트를 세트
          // 수만큼 깔고 처방이 범위를 주지만, 사다리는 숫자가 곧 처방이다
          sets: reps.map((count) => ({ ...ZERO_SET, reps: count })),
          prescription: {
            repsMin: Math.min(...reps),
            repsMax: Math.max(...reps),
            /*
              3 = 허용 최댓값. 원문이 "실패 지점까지 근육을 쥐어짜는 대신"
              이라고 못 박은 것을 처방으로 옮길 수 있는 유일한 칸이다.
            */
            targetRir: 3,
            restSeconds: program.restSeconds,
            // 맨몸이라 증량 단위가 뜻이 없다. RPC가 1·2.5·5만 받아 최솟값
            loadStepKg: 1,
          },
        },
      ],
    };
  });

  return {
    p_program_key: program.key,
    p_program_version: program.version,
    p_title_snapshot: program.title,
    p_level_at_start: ladderLevelForMaxReps(maxReps),
    p_start_date: input.startDate,
    p_timezone: input.timeZone,
    p_preferred_slots: input.preferredSlots.map((slot) => ({ ...slot })),
    p_plans: plans,
  };
}

export async function createLadderProgramEnrollment(
  input: CreateLadderEnrollmentInput,
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "create_program_enrollment",
    buildCreateLadderEnrollmentRpcArgs(input),
  );
  if (error) throw error;
  if (typeof data !== "string" || !UUID.test(data)) {
    throw new Error("program_invalid_enrollment_id");
  }
  return data;
}

export async function createIntervalProgramEnrollment(
  input: CreateIntervalEnrollmentInput,
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "create_program_enrollment",
    buildCreateIntervalEnrollmentRpcArgs(input),
  );
  if (error) throw error;
  if (typeof data !== "string" || !UUID.test(data)) {
    throw new Error("program_invalid_enrollment_id");
  }
  return data;
}

export async function createProgramEnrollment(
  input: CreateProgramEnrollmentInput,
): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "create_program_enrollment",
    buildCreateProgramEnrollmentRpcArgs(input),
  );
  if (error) throw error;
  if (typeof data !== "string" || !UUID.test(data)) {
    throw new Error("program_invalid_enrollment_id");
  }
  return data;
}

export async function getActiveProgramEnrollments(
  userId: string,
): Promise<ProgramEnrollment[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("program_enrollments")
    .select(
      "id,program_key,program_version,title_snapshot,level_at_start,start_date,timezone,preferred_slots,status",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("start_date", { ascending: true });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map(parseProgramEnrollmentRow);
  if (rows.some((row) => row === null)) {
    throw new Error("program_invalid_enrollment_row");
  }
  return rows as ProgramEnrollment[];
}

/**
 * 진행 중인 프로그램을 그만둔다 (0071).
 *
 * 남은 계획을 지우고 등록을 `cancelled`로 남긴다. **완료한 운동은 그대로다** —
 * 회차를 마치면 그 계획 행은 이미 지워져서, 여기 남아 있는 것은 전부 미완료다.
 *
 * @returns 달력에서 지운 계획 수
 */
export async function cancelProgramEnrollment(
  enrollmentId: string,
): Promise<number> {
  if (!UUID.test(enrollmentId)) {
    throw new Error("program_invalid_enrollment_id");
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("cancel_program_enrollment", {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
    throw new Error("program_invalid_cancel_result");
  }
  return data;
}

export async function rescheduleProgramPlans(input: {
  enrollmentId: string;
  moves: ProgramPlanMove[];
}): Promise<void> {
  if (input.moves.length === 0) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reschedule_program_plans", {
    p_enrollment_id: input.enrollmentId,
    p_moves: input.moves.map((move) => ({
      plan_id: move.planId,
      plan_date: move.suggestedDate,
      scheduled_at: move.scheduledAt,
    })),
  });
  if (error) throw error;
}
