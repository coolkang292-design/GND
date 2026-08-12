import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  completedSetsInOrder,
  withCompletedSetsOnly,
} from "@/lib/domain/workout-import";
import type { CompletedSession } from "@/lib/domain/calendar";
import type { VolumeSet } from "@/lib/domain/volume";
import type { LogExercise } from "@/lib/domain/workout-log";
import type { ComparableExercise } from "@/lib/domain/record-beaten";
import type { EffortFeedback } from "@/lib/domain/program-load";
import type { ExercisePrescription } from "@/lib/domain/workout-plan";
import type {
  BodyPart,
  CatalogExercise,
  ExerciseType,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/types";

// ── 로컬 임시저장 모델 (§10 자동 임시저장·새로고침 복구) ─────────

export type LocalSet = {
  key: string; // 로컬 식별자 — 값 프리필 시 입력 리마운트용
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
  done: boolean;
  /**
   * 첫·마지막 세트에서 받은 체감 (0067).
   *
   * **없음과 "적당함"은 다르다.** 다음 회차 추천의 입력이라 임의로 채우면 무게가
   * 혼자 올라간다. 안 물어본 세트·사용자가 시트를 닫은 세트는 비어 있다.
   *
   * 선택 필드인 이유: 프로그램이 아닌 세트가 압도적으로 많고, v5 이전 draft와
   * 일반 운동 경로가 이 값을 만들 일이 없다. 없음(`undefined`)과 명시적 null을
   * 코드가 구분하지 않으므로(둘 다 "안 받음") 저장할 때 `?? null`로 좁힌다.
   */
  effortFeedback?: EffortFeedback | null;
};

export function newSet(partial: Partial<Omit<LocalSet, "key">> = {}): LocalSet {
  return {
    key: localId(),
    weightKg: 0,
    reps: 0,
    distanceKm: 0,
    durationMin: 0,
    done: false,
    effortFeedback: null,
    ...partial,
  };
}

export type LocalExercise = {
  key: string; // 로컬 식별자 (uuid)
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: LocalSet[];
  /**
   * 공식 프로그램 처방 (0066에서 `workout_plans.exercises`에 실려 온다).
   * 있으면 반복 범위·휴식·증량 단위를 이 값으로 안내한다. 일반 운동은 없다.
   */
  prescription?: ExercisePrescription;
};

/** 이 운동이 속한 공식 프로그램 회차 (0067) — 완료 세션에 그대로 저장된다 */
export type ProgramDraftMeta = {
  enrollmentId: string;
  week: number;
  session: number;
  templateVersion: number;
};

export type WorkoutDraft = {
  version: 6;
  sessionId: string | null;
  startedAtMs: number | null; // 서버 started_at (RPC 응답 기준)
  scheduledPlanId: string | null; // 예정표에서 불러온 경우, 운동 시작 성공 후 정리
  sourceSessionId: string | null; // 복사 예정표의 원본 세션 — 기록 갱신 판정용
  effortMessage: string | null; // 지난 기록 불러오기 뒤 보여주는 선택형 노력 제안
  restSeconds: number; // 세트 사이 휴식 사전설정 (§10, 기본 90초)
  exercises: LocalExercise[];
  // ── 무동작 감지 (2026-08-01) — 새로고침·앱 재시작에도 유지돼야 한다 ──
  pausedSeconds: number; // 누적 정지 시간(초). 종료 시 서버 duration에서 빠진다
  pausedAtMs: number | null; // 지금 정지 중이면 그 시작 시각
  lastActivityMs: number | null; // 마지막 동작 시각
  tabataMinutes: number | null; // 타바타 세션이면 그 분수 — 무동작 감지 제외 판정용
  /** 공식 프로그램 회차면 그 메타 (0067). 일반 운동은 null */
  program: ProgramDraftMeta | null;
};

/** 무동작 감지 필드의 초기값 — 새 세션·구버전 draft 승격에 함께 쓴다 */
const IDLE_DEFAULTS = {
  pausedSeconds: 0,
  pausedAtMs: null,
  lastActivityMs: null,
  tabataMinutes: null,
} as const;

/** 프로그램 필드의 초기값 — v5 이하 승격과 새 세션이 같이 쓴다 (0067) */
const PROGRAM_DEFAULTS = { program: null } as const;

/** crypto.randomUUID는 보안 컨텍스트 전용 — http+LAN IP 테스트에서도 동작해야 함 */
export function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_REST_SECONDS = 90;

export function emptyDraft(restSeconds = DEFAULT_REST_SECONDS): WorkoutDraft {
  return {
    version: 6,
    sessionId: null,
    startedAtMs: null,
    scheduledPlanId: null,
    sourceSessionId: null,
    effortMessage: null,
    restSeconds,
    exercises: [],
    ...IDLE_DEFAULTS,
    ...PROGRAM_DEFAULTS,
  };
}

const draftKey = (userId: string) => `gnd-workout-draft:${userId}`;

export function loadDraft(userId: string): WorkoutDraft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return emptyDraft();
    type IdleFields = keyof typeof IDLE_DEFAULTS;
    type ProgramFields = keyof typeof PROGRAM_DEFAULTS;
    type LegacyDraft<V extends number, Missing extends keyof WorkoutDraft> = Omit<
      WorkoutDraft,
      "version" | Missing | IdleFields | ProgramFields
    > & { version: V };

    const parsed = JSON.parse(raw) as
      | WorkoutDraft
      | LegacyDraft<1, "scheduledPlanId" | "sourceSessionId" | "effortMessage">
      | LegacyDraft<2, "sourceSessionId" | "effortMessage">
      | LegacyDraft<3, "sourceSessionId">
      | LegacyDraft<4, never>
      | (Omit<WorkoutDraft, "version" | ProgramFields> & { version: 5 });
    if (!parsed || !Array.isArray(parsed.exercises)) {
      return emptyDraft();
    }
    // ⚠️ 승격 경로는 **전부 v6에서 끝난다.** 하나라도 옛 번호로 끝내면 그 draft는
    //    `parsed.version !== 6`에 걸려 통째로 버려진다 — 진행 중이던 운동이 날아간다.
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 6,
        scheduledPlanId: null,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
      };
    }
    if (parsed.version === 2) {
      return {
        ...parsed,
        version: 6,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
      };
    }
    if (parsed.version === 3) {
      return {
        ...parsed,
        version: 6,
        sourceSessionId: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
      };
    }
    if (parsed.version === 4) {
      return { ...parsed, version: 6, ...IDLE_DEFAULTS, ...PROGRAM_DEFAULTS };
    }
    if (parsed.version === 5) {
      return { ...parsed, version: 6, ...PROGRAM_DEFAULTS };
    }
    if (parsed.version !== 6) return emptyDraft();
    return parsed;
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(userId: string, draft: WorkoutDraft): void {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // 저장소 꽉 참 등 — 임시저장 실패는 치명적이지 않음
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* noop */
  }
}

/** 유형별 기본 첫 세트 (목업 addExercise 기준) */
export function defaultSets(
  type: ExerciseType,
  measure?: "reps" | "time" | null,
): LocalSet[] {
  if (type === "weight") return [newSet({ weightKg: 20, reps: 10 })];
  if (type === "bodyweight") {
    if (measure === "time") return [newSet({ durationMin: 1 })];
    return [newSet({ reps: 12 })];
  }
  return [newSet()]; // cardio: 거리·시간 1행
}

/** 볼륨 집계 입력으로 변환 (완료 세트만 반영은 volume.ts 책임) */
export function toVolumeSets(exercises: LocalExercise[]): VolumeSet[] {
  return exercises.flatMap((ex) =>
    ex.sets.map((s) => ({
      exerciseType: ex.exerciseType,
      isCompleted: s.done,
      weightKg: s.weightKg,
      reps: s.reps,
      distanceMeters: s.distanceKm * 1000,
      durationSeconds: s.durationMin * 60,
    })),
  );
}

// ── exercise_catalog (§10 Burnfit식 검색 + 직접 만들기) ──────────

export async function getExerciseCatalog(): Promise<CatalogExercise[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("exercise_catalog")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCustomExercise(input: {
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  userId: string;
}): Promise<CatalogExercise> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("exercise_catalog")
    .insert({
      name: input.name.trim(),
      body_part: input.bodyPart,
      exercise_type: input.exerciseType,
      measure: input.measure,
      is_custom: true,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── workout_sessions + 상태전이 RPC (§15) ────────────────────────

export async function createDraftSession(input: {
  groupId: string | null;
  timezone: string;
  /** 타바타 코스 분수 (4|8|16) — 일반 운동은 생략 (0019) */
  tabataMinutes?: number;
  /**
   * 공식 프로그램 회차면 그 메타 (0067).
   *
   * **여기서 안 넣으면 나중에 못 넣는다** — 0067은 이 네 컬럼에 insert 권한만
   * 주고 update는 주지 않는다. 완료 뒤 예정표 행이 지워져도 진행률이 남게
   * 하려면 시작 시점에 세션으로 복사해 둬야 한다.
   */
  program?: ProgramDraftMeta | null;
}): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      group_id: input.groupId,
      timezone: input.timezone,
      ...(input.tabataMinutes ? { tabata_minutes: input.tabataMinutes } : {}),
      ...(input.program
        ? {
            program_enrollment_id: input.program.enrollmentId,
            program_week: input.program.week,
            program_session: input.program.session,
            program_template_version: input.program.templateVersion,
          }
        : {}),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSessionById(
  id: string,
): Promise<WorkoutSession | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 내 active 세션 (로컬 draft 유실 시 복구용) */
export async function getMyActiveSession(
  userId: string,
): Promise<WorkoutSession | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startWorkout(sessionId: string): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("start_workout", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as WorkoutSession;
}

export async function completeWorkout(
  sessionId: string,
): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("complete_workout", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as WorkoutSession;
}

export interface WorkoutXpResult {
  idempotentReplay: boolean;
  awarded: boolean;
  xpAwarded?: number;
  breakdown?: {
    baseXp: number;
    durationXp: number;
    planXp: number;
    recordXp: number;
    photoXp: number;
  };
  newTotalXp?: number;
  previousLevel?: number;
  newLevel?: number;
  previousStage?: number;
  newStage?: number;
  levelUp?: boolean;
  stageUp?: boolean;
  unlockedRewards?: { key: string; label: string }[];
  // 0032 포인트·배지
  pointsAwarded?: number;
  pointMultiplier?: number;
  streakDays?: number;
  newBadges?: {
    badgeKey: string;
    emoji: string;
    name: string;
    tier: string;
    points: number;
  }[];
  // 멱등 재생 응답 필드
  originalXpAwarded?: number;
  currentTotalXp?: number;
  currentLevel?: number;
  currentStage?: number;
  rejectionReason?: string;
}

/**
 * 완료 + XP를 원자 처리하는 신규 경로. 세션 객체 대신 XP 결과를 반환한다.
 *
 * `pausedSeconds`는 무동작으로 멈춰 있던 시간이다(0055). 서버가 duration에서
 * 빼되 `0 ~ 실제 경과초`로 클램프하므로, 클라이언트가 이상한 값을 보내도
 * 음수 duration은 생기지 않는다.
 */
export async function completeWorkoutV2(
  sessionId: string,
  pausedSeconds = 0,
): Promise<WorkoutXpResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("complete_workout_v2", {
    p_session_id: sessionId,
    p_paused_seconds: Math.max(0, Math.round(pausedSeconds)),
  });
  if (error) throw error;
  return data as WorkoutXpResult;
}

/**
 * complete_workout_v2가 던진 오류가 "세션은 이미 완료됨"으로 간주 가능한지.
 *
 * 0 XP로 완료된 세션(당일 2번째 운동·무효 운동 = 완료 세트 3 미만)은
 * `workout_completed` 원장이 없다. 이 세션을 재종료하면 RPC가
 * `incomplete_xp_processing`을 던진다(0022, 운영 적용됨·수정 불가). 하지만
 * 운동 자체는 이미 완료 상태이므로 종료 실패로 취급하면 사용자가 영영
 * 종료를 못 하게 갇힌다(로컬 draft가 완료된 세션을 계속 가리키는 경우).
 */
export function isAlreadyCompletedFinishError(message: string): boolean {
  return (
    message.includes("incomplete_xp_processing") ||
    message.includes("invalid_status:completed")
  );
}

/**
 * 종료 경로 래퍼 — 이미 완료된 세션은 오류가 아니라 **조용한 성공**으로 처리한다.
 * RPC가 완료 세션 재종료에서 던지면, 세션 상태를 확인해 실제로 completed면
 * 멱등 재생 결과(모달 없음)를 돌려주고, 아니면 원래 오류를 다시 던진다.
 */
export async function finishWorkout(
  sessionId: string,
  pausedSeconds = 0,
): Promise<WorkoutXpResult> {
  try {
    return await completeWorkoutV2(sessionId, pausedSeconds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isAlreadyCompletedFinishError(msg)) throw e;
    const session = await getSessionById(sessionId);
    if (session?.status === "completed") {
      return { idempotentReplay: true, awarded: false };
    }
    throw e;
  }
}

/** 직전 기록 조회 범위 — 이보다 오래된 기록과는 비교하지 않는다 */
const PREVIOUS_RECORD_SESSION_LIMIT = 20;

/** 조회 결과 — 판정 입력에 어느 세션에서 왔는지를 더한 것 */
export type PreviousExerciseRecord = ComparableExercise & {
  sessionId: string;
};

/**
 * 오늘 한 종목들의 **직전 기록**을 한 번에 가져온다 (설계 2026-07-21).
 * 쿼리 2회로 끝낸다. 방금 완료한 세션과 타바타 세션은 후보에서 뺀다 —
 * 타바타는 세트 실적이 0이라 정상 기록을 가린다.
 */
export async function getPreviousExerciseRecords(
  userId: string,
  exerciseNames: string[],
  excludeSessionId: string,
): Promise<Map<string, PreviousExerciseRecord>> {
  const result = new Map<string, PreviousExerciseRecord>();
  if (exerciseNames.length === 0) return result;

  const supabase = getSupabaseBrowserClient();

  const { data: sessions, error: sErr } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .is("tabata_minutes", null)
    .neq("id", excludeSessionId)
    .order("completed_at", { ascending: false })
    .limit(PREVIOUS_RECORD_SESSION_LIMIT);
  if (sErr) throw sErr;

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return result;

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select("session_id, exercise_name, exercise_type, measure, workout_sets(*)")
    .in("session_id", sessionIds)
    .in("exercise_name", exerciseNames);
  if (eErr) throw eErr;

  type Row = {
    session_id: string;
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    workout_sets: WorkoutSet[] | null;
  };

  // sessionIds는 최신순이므로 인덱스가 작을수록 최근이다.
  const recencyOf = new Map(sessionIds.map((id, index) => [id, index]));

  for (const row of (exercises ?? []) as Row[]) {
    const rank = recencyOf.get(row.session_id);
    if (rank === undefined) continue;

    const existing = result.get(row.exercise_name);
    if (existing) {
      const existingRank = recencyOf.get(existing.sessionId);
      if (existingRank !== undefined && existingRank <= rank) continue;
    }

    result.set(row.exercise_name, {
      sessionId: row.session_id,
      name: row.exercise_name,
      exerciseType: row.exercise_type,
      measure: row.measure,
      sets: (row.workout_sets ?? []).map((s) => ({
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        distanceKm: Number(s.distance_meters ?? 0) / 1000,
        durationMin: Math.round((s.duration_seconds ?? 0) / 60),
        isCompleted: s.is_completed,
      })),
    });
  }

  return result;
}

/** 기록 갱신 마킹 (0018 definer RPC) — 세션에 문구 저장 + 크루 알림/푸시 */
export async function markRecordBeaten(
  sessionId: string,
  note: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("mark_record_beaten", {
    p_session_id: sessionId,
    p_note: note,
  });
  if (error) throw error;
}

export async function cancelWorkout(
  sessionId: string,
): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("cancel_workout", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as WorkoutSession;
}

// ── 운동·세트 저장 (완료 시 일괄 기록) ───────────────────────────

export async function saveSessionExercises(
  sessionId: string,
  exercises: LocalExercise[],
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  // 재시도에도 안전하도록 기존 행 제거 후 삽입 (세트는 cascade)
  const { error: delError } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("session_id", sessionId);
  if (delError) throw delError;

  if (exercises.length === 0) return;

  const { data: inserted, error: exError } = await supabase
    .from("workout_exercises")
    .insert(
      exercises.map((ex, i) => ({
        session_id: sessionId,
        exercise_name: ex.name,
        exercise_type: ex.exerciseType,
        body_part: ex.bodyPart,
        measure: ex.measure,
        sort_order: i,
      })),
    )
    .select("id");
  if (exError) throw exError;
  if (!inserted || inserted.length !== exercises.length) {
    throw new Error("운동 저장 결과가 요청과 다릅니다");
  }

  const setRows = exercises.flatMap((ex, i) => {
    const isCardio = ex.exerciseType === "cardio";
    const isTime = ex.exerciseType === "bodyweight" && ex.measure === "time";
    return ex.sets.map((s, si) => ({
      workout_exercise_id: inserted[i].id,
      set_number: si + 1,
      weight_kg: ex.exerciseType === "weight" ? s.weightKg : null,
      reps: isCardio || isTime ? null : s.reps,
      distance_meters: isCardio ? Math.round(s.distanceKm * 1000) : null,
      duration_seconds:
        isCardio || isTime ? Math.round(s.durationMin * 60) : null,
      is_completed: s.done,
      // 0067. 안 물어본 세트는 undefined라 `?? null`로 좁힌다 — undefined를 그대로
      // 보내면 PostgREST가 키를 빼서 열마다 행 모양이 달라진다.
      effort_feedback: s.effortFeedback ?? null,
    }));
  });
  if (setRows.length === 0) return;

  const { error: setError } = await supabase.from("workout_sets").insert(setRows);
  if (setError) throw setError;
}

/** 직전 완료 세션의 웨이트 완료 볼륨(kg) — 헤더 '이전 대비' 표시용 (§10) */
export async function getLastCompletedWeightVolume(
  userId: string,
): Promise<number | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessions, error: sErr } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .limit(1);
  if (sErr) throw sErr;
  const last = sessions?.[0];
  if (!last) return null;

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select("exercise_type, workout_sets(weight_kg, reps, is_completed)")
    .eq("session_id", last.id)
    .eq("exercise_type", "weight");
  if (eErr) throw eErr;

  let volume = 0;
  for (const ex of exercises ?? []) {
    for (const s of (ex.workout_sets ?? []) as Pick<
      WorkoutSet,
      "weight_kg" | "reps" | "is_completed"
    >[]) {
      if (s.is_completed) volume += Number(s.weight_kg ?? 0) * (s.reps ?? 0);
    }
  }
  return volume;
}

/** DB 세트 행 → 로컬 draft 세트 (완료 여부는 복사하지 않는다) */
function toLocalSet(s: WorkoutSet): LocalSet {
  return newSet({
    weightKg: Number(s.weight_kg ?? 0),
    reps: s.reps ?? 0,
    distanceKm: Number(s.distance_meters ?? 0) / 1000,
    durationMin: Math.round((s.duration_seconds ?? 0) / 60),
  });
}

/**
 * 직전 기록 불러오기 — 같은 이름 운동의 가장 최근 **완료 세트** 구조 (§10).
 *
 * 완료 체크한 세트만 본다. 가장 최근 세션에 완료 세트가 없으면(계획만 하고
 * 하지 않은 종목) 그다음 최근 세션으로 넘어간다 (2026-08-01).
 */
export async function getLastRecordedSets(
  userId: string,
  exerciseName: string,
): Promise<LocalSet[] | null> {
  const supabase = getSupabaseBrowserClient();

  const { data: sessions, error: sErr } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .limit(20);
  if (sErr) throw sErr;
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return null;

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select("id, session_id, exercise_type, workout_sets(*)")
    .in("session_id", sessionIds)
    .eq("exercise_name", exerciseName);
  if (eErr) throw eErr;
  if (!exercises || exercises.length === 0) return null;

  // 가장 최근 세션(정렬된 sessionIds 앞쪽) 우선
  const byRecency = [...exercises].sort(
    (a, b) => sessionIds.indexOf(a.session_id) - sessionIds.indexOf(b.session_id),
  );

  for (const candidate of byRecency) {
    const sets = completedSetsInOrder(
      (candidate.workout_sets ?? []) as WorkoutSet[],
    );
    if (sets.length > 0) return sets.map(toLocalSet);
  }
  return null;
}

// ── 인증사진 (§11) ───────────────────────────────────────────────

export type VerificationSource = "camera" | "album";

/**
 * 압축된 사진을 비공개 버킷에 올리고 세션 인증 상태를 기록.
 * verification_status/server_uploaded_at은 RPC(서버시간)만 쓴다.
 */
export async function uploadWorkoutImage(input: {
  userId: string;
  sessionId: string;
  blob: Blob;
  source: VerificationSource;
  clientCapturedAt: Date | null;
}): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const path = `${input.userId}/${input.sessionId}/${Date.now()}.jpg`;

  const { error: upError } = await supabase.storage
    .from("workout-images")
    .upload(path, input.blob, { contentType: "image/jpeg" });
  if (upError) throw upError;

  const { error: rowError } = await supabase.from("workout_images").insert({
    session_id: input.sessionId,
    user_id: input.userId,
    image_path: path,
    source: input.source,
    client_captured_at: input.clientCapturedAt?.toISOString() ?? null,
  });
  if (rowError) throw rowError;

  const { data, error } = await supabase.rpc("set_workout_verification", {
    p_session_id: input.sessionId,
    p_source: input.source,
    p_client_captured_at: input.clientCapturedAt?.toISOString() ?? null,
  });
  if (error) throw error;
  return data as WorkoutSession;
}

export type PhotoXpResult = {
  awarded: boolean;
  xpAwarded?: number;
  /** 미지급 사유 — no_photo · too_late · not_daily_workout · already_awarded */
  reason?: string;
  levelUp?: boolean;
  newLevel?: number;
};

/**
 * 인증사진 XP 후등록 (0022 award_workout_photo_xp).
 *
 * 인증사진은 **완료 화면에만** 있으므로 사진 행은 항상 완료 뒤에 생긴다.
 * 그래서 완료 RPC의 사진 판정(완료 시점에 사진이 있는가)은 정상 흐름에서
 * 참이 될 수 없다 — 이 함수를 업로드 직후 불러야 10 XP가 지급된다.
 * (2026-07-26까지 호출부가 없어 사진 XP 지급 이력이 0건이었다.)
 *
 * 지급 조건은 서버가 판정한다: 완료 30분 이내 · 그날 첫 유효 운동 · 사진 실재.
 */
export async function awardWorkoutPhotoXp(
  sessionId: string,
): Promise<PhotoXpResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("award_workout_photo_xp", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  const row = (data ?? {}) as PhotoXpResult;
  return {
    awarded: row.awarded === true,
    xpAwarded: row.xpAwarded,
    reason: row.reason,
    levelUp: row.levelUp,
    newLevel: row.newLevel,
  };
}

// ── 지난 운동 복사 (§10) ─────────────────────────────────────────

/**
 * 지난 세션의 종목·세트 구조를 로컬 draft 재료로 조회.
 *
 * **완료 체크한 세트만** 가져온다 (2026-08-01). 완료 세션에도 체크하지 않은
 * 세트가 남아 있는데, 그건 계획만 하고 하지 않은 세트다. 완료 세트가 하나도
 * 없는 종목은 그날 하지 않은 운동이므로 목록에서 뺀다.
 * 값(중량·횟수·거리·시간)은 복사하되 완료 여부는 복사하지 않는다.
 */
export async function getSessionExerciseStructure(sessionId: string): Promise<
  {
    name: string;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
    bodyPart: BodyPart | null;
    sets: LocalSet[];
  }[]
> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_exercises")
    .select(
      "exercise_name, exercise_type, measure, body_part, sort_order, workout_sets(*)",
    )
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  type Row = {
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    body_part: BodyPart | null;
    sort_order: number;
    workout_sets: WorkoutSet[] | null;
  };

  return withCompletedSetsOnly(
    ((data ?? []) as Row[]).map((row) => ({
      exercise: row,
      sets: row.workout_sets ?? [],
    })),
  ).map(({ exercise: row, sets }) => ({
    name: row.exercise_name,
    exerciseType: row.exercise_type,
    measure: row.measure,
    bodyPart: row.body_part,
    sets: sets.map(toLocalSet),
  }));
}

/**
 * 공유용 운동 일지 데이터 — 종목+세트를 완료 여부(is_completed) 그대로 조회.
 * (getSessionExerciseStructure는 '지난 운동 복사'용이라 done을 초기화함 — 용도 분리)
 */
export async function getSessionLogExercises(
  sessionId: string,
): Promise<LogExercise[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("exercise_name, exercise_type, measure, sort_order, workout_sets(*)")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  type Row = {
    exercise_name: string;
    exercise_type: ExerciseType;
    measure: "reps" | "time" | null;
    sort_order: number;
    workout_sets: WorkoutSet[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    name: row.exercise_name,
    exerciseType: row.exercise_type,
    measure: row.measure,
    sets: [...(row.workout_sets ?? [])]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        distanceKm: Number(s.distance_meters ?? 0) / 1000,
        durationMin: Math.round((s.duration_seconds ?? 0) / 60),
        done: s.is_completed,
      })),
  }));
}

// ── 달력용 완료 세션 (§12 계산된 스탬프의 원천 데이터) ──────────────

/** 달력 스탬프·상세 시트의 원천 — 완료 세션 + 종목명 (도메인 CompletedSession 확장) */
export type CalendarSession = CompletedSession & {
  id: string;
  exerciseNames: string[];
  recordNote: string | null; // 🏅 기록 갱신 문구 (0018)
  tabataMinutes: number | null; // 🔥 타바타 코스 분수 (0019)
};

/** 내 completed 세션 전체 (달력 스탬프·월간요약·상세시트·복사용) */
/**
 * 완료한 운동이 하나라도 있나 (2026-08-06).
 *
 * 빈 기록 화면이 '최근 운동 불러오기'를 띄울지 정하는 데 필요한 것은 **1비트**다.
 * `getCompletedSessions`를 부르면 완료 세션 **전량**을 `workout_exercises` join까지
 * 걸어 받는다 — 상한이 없어 이력이 쌓일수록 커지고, 그걸 화면 진입마다 하게 된다.
 *
 * `head: true`라 **행을 하나도 안 받는다.** 목록은 사용자가 실제로 '지난 기록'을
 * 열 때 기존 `loadPastSessions()`가 평소대로 가져온다.
 */
export async function hasCompletedHistory(userId: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("workout_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getCompletedSessions(
  userId: string,
): Promise<CalendarSession[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id, completed_at, duration_minutes, verification_status, record_note, tabata_minutes, workout_exercises(exercise_name, sort_order)",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });
  if (error) throw error;

  type Row = {
    id: string;
    completed_at: string;
    duration_minutes: number | null;
    verification_status: CompletedSession["verification"];
    record_note?: string | null; // 0018 적용 전에는 컬럼이 없을 수 있음
    tabata_minutes?: number | null; // 0019
    workout_exercises: { exercise_name: string; sort_order: number }[] | null;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    completedAt: new Date(r.completed_at),
    verification: r.verification_status,
    durationSeconds: (r.duration_minutes ?? 0) * 60,
    exerciseNames: [...(r.workout_exercises ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => e.exercise_name),
    recordNote: r.record_note ?? null,
    tabataMinutes: r.tabata_minutes ?? null,
  }));
}

// ── 홈: 크루의 가장 최근 인증사진 운동 (§소셜 미리보기) ──────────────

export type LatestCrewWorkout = {
  sessionId: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  imageUrl: string; // 서명된 임시 URL
  completedAt: Date;
};

/**
 * 크루의 공개 완료 세션 중 인증사진이 있는 가장 최근 1건.
 * 비공개 버킷이라 서명 URL로 이미지를 노출한다. 없으면 null.
 */
export async function getLatestCrewWorkoutWithPhoto(
  myUserId: string,
): Promise<LatestCrewWorkout | null> {
  const supabase = getSupabaseBrowserClient();

  // 0039: 그룹 → 크루 연결. 본인도 포함한다 — 홈 카드가 "(나)" 표시를 이미 한다.
  const { data: links, error: lErr } = await supabase
    .from("crew_links")
    .select("user_a, user_b");
  if (lErr) throw lErr;
  const visibleIds = [
    myUserId,
    ...((links ?? []) as { user_a: string; user_b: string }[]).map((l) =>
      l.user_a === myUserId ? l.user_b : l.user_a,
    ),
  ];

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, user_id, completed_at, workout_images!inner(image_path)")
    .in("user_id", visibleIds)
    .eq("status", "completed")
    .eq("visibility", "group")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  type Row = {
    id: string;
    user_id: string;
    completed_at: string;
    workout_images: { image_path: string }[] | { image_path: string } | null;
  };

  const row = (data ?? [])[0] as Row | undefined;
  if (!row) return null;

  const image = Array.isArray(row.workout_images)
    ? row.workout_images[0]
    : row.workout_images;
  if (!image) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", row.user_id)
    .maybeSingle();

  const { data: signed, error: signErr } = await supabase.storage
    .from("workout-images")
    .createSignedUrl(image.image_path, 3600);
  if (signErr || !signed) return null;

  return {
    sessionId: row.id,
    userId: row.user_id,
    nickname: profile?.nickname ?? "크루원",
    avatarUrl: profile?.avatar_url ?? null,
    imageUrl: signed.signedUrl,
    completedAt: new Date(row.completed_at),
  };
}
