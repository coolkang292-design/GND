import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CompletedSession } from "@/lib/domain/calendar";
import type { VolumeSet } from "@/lib/domain/volume";
import type { LogExercise } from "@/lib/domain/workout-log";
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
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: LocalSet[];
};

export type WorkoutDraft = {
  version: 3;
  sessionId: string | null;
  startedAtMs: number | null; // 서버 started_at (RPC 응답 기준)
  scheduledPlanId: string | null; // 예정표에서 불러온 경우, 운동 시작 성공 후 정리
  effortMessage: string | null; // 지난 기록 불러오기 뒤 보여주는 선택형 노력 제안
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
    version: 3,
    sessionId: null,
    startedAtMs: null,
    scheduledPlanId: null,
    effortMessage: null,
    restSeconds,
    exercises: [],
  };
}

const draftKey = (userId: string) => `gnd-workout-draft:${userId}`;

export function loadDraft(userId: string): WorkoutDraft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as
      | WorkoutDraft
      | (Omit<WorkoutDraft, "version" | "scheduledPlanId" | "effortMessage"> & {
          version: 1;
        })
      | (Omit<WorkoutDraft, "version" | "effortMessage"> & { version: 2 });
    if (!parsed || !Array.isArray(parsed.exercises)) {
      return emptyDraft();
    }
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 3,
        scheduledPlanId: null,
        effortMessage: null,
      };
    }
    if (parsed.version === 2) {
      return { ...parsed, version: 3, effortMessage: null };
    }
    if (parsed.version !== 3) return emptyDraft();
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

// ── 지난 운동 복사 (§10) ─────────────────────────────────────────

/**
 * 지난 세션의 종목·세트 구조를 로컬 draft 재료로 조회.
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

  return ((data ?? []) as Row[]).map((row) => {
    const sets = [...(row.workout_sets ?? [])]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) =>
        newSet({
          weightKg: Number(s.weight_kg ?? 0),
          reps: s.reps ?? 0,
          distanceKm: Number(s.distance_meters ?? 0) / 1000,
          durationMin: Math.round((s.duration_seconds ?? 0) / 60),
        }),
      );
    return {
      name: row.exercise_name,
      exerciseType: row.exercise_type,
      measure: row.measure,
      bodyPart: row.body_part,
      sets: sets.length > 0 ? sets : defaultSets(row.exercise_type, row.measure),
    };
  });
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
};

/** 내 completed 세션 전체 (달력 스탬프·월간요약·상세시트·복사용) */
export async function getCompletedSessions(
  userId: string,
): Promise<CalendarSession[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id, completed_at, duration_minutes, verification_status, workout_exercises(exercise_name, sort_order)",
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
  groupId: string,
): Promise<LatestCrewWorkout | null> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, user_id, completed_at, workout_images!inner(image_path)")
    .eq("group_id", groupId)
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
