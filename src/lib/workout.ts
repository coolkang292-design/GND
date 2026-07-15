import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VolumeSet } from "@/lib/domain/volume";
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
};

export function newSet(partial: Partial<Omit<LocalSet, "key">> = {}): LocalSet {
  return {
    key: localId(),
    weightKg: 0,
    reps: 0,
    distanceKm: 0,
    durationMin: 0,
    done: false,
    ...partial,
  };
}

export type LocalExercise = {
  key: string; // 로컬 식별자 (uuid)
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  isCustom: boolean;
  sets: LocalSet[];
};

export type WorkoutDraft = {
  version: 1;
  sessionId: string | null;
  startedAtMs: number | null; // 서버 started_at (RPC 응답 기준)
  restSeconds: number; // 세트 사이 휴식 사전설정 (§10, 기본 90초)
  exercises: LocalExercise[];
};

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
    version: 1,
    sessionId: null,
    startedAtMs: null,
    restSeconds,
    exercises: [],
  };
}

const draftKey = (userId: string) => `gnd-workout-draft:${userId}`;

export function loadDraft(userId: string): WorkoutDraft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as WorkoutDraft;
    if (parsed?.version !== 1 || !Array.isArray(parsed.exercises)) {
      return emptyDraft();
    }
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
export function defaultSets(type: ExerciseType): LocalSet[] {
  if (type === "weight") return [newSet({ weightKg: 20, reps: 10 })];
  if (type === "bodyweight") return [newSet({ reps: 12 })];
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
  userId: string;
}): Promise<CatalogExercise> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("exercise_catalog")
    .insert({
      name: input.name.trim(),
      body_part: input.bodyPart,
      exercise_type: input.exerciseType,
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
}): Promise<WorkoutSession> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ group_id: input.groupId, timezone: input.timezone })
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
        sort_order: i,
      })),
    )
    .select("id");
  if (exError) throw exError;
  if (!inserted || inserted.length !== exercises.length) {
    throw new Error("운동 저장 결과가 요청과 다릅니다");
  }

  const setRows = exercises.flatMap((ex, i) =>
    ex.sets.map((s, si) => ({
      workout_exercise_id: inserted[i].id,
      set_number: si + 1,
      weight_kg: ex.exerciseType === "weight" ? s.weightKg : null,
      reps: ex.exerciseType === "cardio" ? null : s.reps,
      distance_meters:
        ex.exerciseType === "cardio" ? Math.round(s.distanceKm * 1000) : null,
      duration_seconds:
        ex.exerciseType === "cardio" ? Math.round(s.durationMin * 60) : null,
      is_completed: s.done,
    })),
  );
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

/** 직전 기록 불러오기 — 같은 이름 운동의 가장 최근 완료 세트 구조 (§10) */
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
  const latest = byRecency[0];
  const sets = ((latest.workout_sets ?? []) as WorkoutSet[])
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) =>
      newSet({
        weightKg: Number(s.weight_kg ?? 0),
        reps: s.reps ?? 0,
        distanceKm: Number(s.distance_meters ?? 0) / 1000,
        durationMin: Math.round((s.duration_seconds ?? 0) / 60),
      }),
    );
  return sets.length > 0 ? sets : null;
}
