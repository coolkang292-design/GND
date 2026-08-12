import type {
  OfficialProgram,
  ResolvedProgramExercise,
} from "@/lib/domain/official-programs";
import type {
  PreferredSlot,
  ProgramPlanMove,
  ProgramScheduleItem,
} from "@/lib/domain/program-schedule";
import type { PlanExercise, PlanSet } from "@/lib/domain/workout-plan";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ProgramEnrollment = {
  id: string;
  programKey: string;
  programVersion: number;
  title: string;
  levelAtStart: "beginner" | "experienced";
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

export type CreateProgramEnrollmentInput = {
  program: OfficialProgram;
  sessions: readonly ResolvedProgramSession[];
  schedule: readonly ProgramScheduleItem[];
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
};

export type CreateProgramEnrollmentRpcArgs = {
  p_program_key: string;
  p_program_version: number;
  p_title_snapshot: string;
  p_level_at_start: "beginner" | "experienced";
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
  if (!Array.isArray(value) || value.length !== 3) return null;
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
  const ordered = [...weekdays].sort((a, b) => a - b);
  for (let index = 0; index < ordered.length; index += 1) {
    const gap =
      (ordered[(index + 1) % ordered.length] - ordered[index] + 7) % 7;
    if (gap < 2) return null;
  }
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
  if (input.preferredSlots.length !== 3) throw new Error("program_slots_count");
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

  if (input.schedule.length !== 18) throw new Error("program_plans_count");
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
    if (previousDate && dateDays(plan.date) - dateDays(previousDate) < 2) {
      throw new Error("program_recovery_gap");
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
    !["beginner", "experienced"].includes(row.level_at_start as string) ||
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
