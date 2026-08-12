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
  if (input.schedule.length !== 18) throw new Error("program_plans_count");
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
      title: `${input.program.title} · ${template.title}`,
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
  return (Array.isArray(data) ? data : [])
    .map(parseProgramEnrollmentRow)
    .filter((row): row is ProgramEnrollment => row !== null);
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
