import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  completedSetsInOrder,
  withCompletedSetsOnly,
} from "@/lib/domain/workout-import";
import {
  DEFAULT_HOLD_SECONDS,
  durationSecondsOf,
} from "@/lib/domain/set-timer";
import {
  parseSavedSetTimer,
  type SavedSetTimer,
} from "@/lib/domain/set-timer-restore";
import { dayKey, resolveTimeZone } from "@/lib/domain/time";
import { firstWorkoutImagePath, workoutImageList } from "@/lib/domain/social";
import {
  capturedAtForPhotos,
  nextPhotoSlot,
  sortWorkoutPhotos,
  verificationSourceForPhotos,
  type SessionPhoto,
  type VerificationSource,
  type WorkoutPhotoRow,
} from "@/lib/domain/workout-photos";
import type { CompletedSession } from "@/lib/domain/calendar";
import type { VolumeSet } from "@/lib/domain/volume";
import type { LogExercise } from "@/lib/domain/workout-log";
import type { ComparableExercise } from "@/lib/domain/record-beaten";
import type {
  EffortFeedback,
  PreviousCompletedSet,
} from "@/lib/domain/program-load";
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
  /**
   * ⚠️ **계획·루틴 호환용으로만 남아 있다.** 실제 시간 기록은 `durationSec`다.
   *
   * 달력 계획·루틴·공식 프로그램 JSON이 이 키를 쓰고 서버 RPC가 `?&`로 **존재를
   * 검사**한다(0066·0069·0070·0073). 지우면 계획 저장이 통째로 거부된다.
   * 읽을 때는 언제나 `durationSecondsOf()`를 거친다.
   */
  durationMin: number;
  /**
   * 시간 기록의 **진실** — 초 (2026-08-28 사장님 지시).
   *
   * DB는 처음부터 초다(`workout_sets.duration_seconds`, 0004). 분으로 눌러
   * 담던 탓에 매달리기 37초는 **입력조차 못 했고** 러닝 32분 40초는 40초를
   * 잃었다. 이제 세트 시계가 잰 초가 그대로 들어온다.
   *
   * 선택 필드인 이유: `effortFeedback`(0067)과 같다 — 옛 draft·계획에서 온
   * 세트에는 없다. 없으면 `durationMin * 60`으로 읽는다(`durationSecondsOf`).
   * 그래서 **draft 버전을 올리지 않았다.**
   */
  durationSec?: number;
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
    durationSec: 0,
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
  version: 7;
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
  /**
   * 이 draft를 **기계가 담아 준 날** (2026-08-16). 사용자가 직접 담았으면 `null`.
   *
   * ⚠️ 이 칸이 차 있다는 것은 "아직 제안 그대로"라는 뜻이다. 사용자가 종목을
   *    더하거나 빼는 **순간 `null`로 만든다** — 그때부터 본인 것이므로 다음 날
   *    지우면 안 된다.
   */
  suggestedForDayKey: string | null;
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

/** 제안 필드의 초기값 — v6 이하 승격과 새 세션이 같이 쓴다 (2026-08-16) */
const SUGGESTION_DEFAULTS = { suggestedForDayKey: null } as const;

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
    version: 7,
    sessionId: null,
    startedAtMs: null,
    scheduledPlanId: null,
    sourceSessionId: null,
    effortMessage: null,
    restSeconds,
    exercises: [],
    ...IDLE_DEFAULTS,
    ...PROGRAM_DEFAULTS,
    ...SUGGESTION_DEFAULTS,
  };
}

const draftKey = (userId: string) => `gnd-workout-draft:${userId}`;

export function loadDraft(userId: string): WorkoutDraft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return emptyDraft();
    type IdleFields = keyof typeof IDLE_DEFAULTS;
    type ProgramFields = keyof typeof PROGRAM_DEFAULTS;
    type SuggestionFields = keyof typeof SUGGESTION_DEFAULTS;
    type LegacyDraft<V extends number, Missing extends keyof WorkoutDraft> = Omit<
      WorkoutDraft,
      "version" | Missing | IdleFields | ProgramFields | SuggestionFields
    > & { version: V };

    const parsed = JSON.parse(raw) as
      | WorkoutDraft
      | LegacyDraft<1, "scheduledPlanId" | "sourceSessionId" | "effortMessage">
      | LegacyDraft<2, "sourceSessionId" | "effortMessage">
      | LegacyDraft<3, "sourceSessionId">
      | LegacyDraft<4, never>
      | (Omit<WorkoutDraft, "version" | ProgramFields | SuggestionFields> & {
          version: 5;
        })
      | (Omit<WorkoutDraft, "version" | SuggestionFields> & { version: 6 });
    if (!parsed || !Array.isArray(parsed.exercises)) {
      return emptyDraft();
    }
    // ⚠️ 승격 경로는 **전부 v7에서 끝난다.** 하나라도 옛 번호로 끝내면 그 draft는
    //    `parsed.version !== 7`에 걸려 통째로 버려진다 — 진행 중이던 운동이 날아간다.
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 7,
        scheduledPlanId: null,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 2) {
      return {
        ...parsed,
        version: 7,
        sourceSessionId: null,
        effortMessage: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 3) {
      return {
        ...parsed,
        version: 7,
        sourceSessionId: null,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 4) {
      return {
        ...parsed,
        version: 7,
        ...IDLE_DEFAULTS,
        ...PROGRAM_DEFAULTS,
        ...SUGGESTION_DEFAULTS,
      };
    }
    if (parsed.version === 5) {
      return { ...parsed, version: 7, ...PROGRAM_DEFAULTS, ...SUGGESTION_DEFAULTS };
    }
    if (parsed.version === 6) {
      return { ...parsed, version: 7, ...SUGGESTION_DEFAULTS };
    }
    if (parsed.version !== 7) return emptyDraft();
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

// ── 세트 시계 (2026-09-23) ─────────────────────────────────────
// draft와 **다른 키**다 — 이유는 `set-timer-restore.ts` 머리 주석.
// 되살릴지 말지(세션 대조·6시간)는 `restoreSetTimer`가 정한다. 여기는 넣고 빼기만.

const setTimerKey = (userId: string) => `gnd-set-timer:${userId}`;

export function loadSetTimer(userId: string): SavedSetTimer | null {
  try {
    const raw = localStorage.getItem(setTimerKey(userId));
    return raw ? parseSavedSetTimer(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSetTimer(userId: string, timer: SavedSetTimer): void {
  try {
    localStorage.setItem(setTimerKey(userId), JSON.stringify(timer));
  } catch {
    // 저장 실패는 치명적이지 않다 — 새로고침만 안 하면 시계는 그대로 돈다
  }
}

export function clearSetTimer(userId: string): void {
  try {
    localStorage.removeItem(setTimerKey(userId));
  } catch {
    /* noop */
  }
}

/**
 * 어제 담긴 제안을 지운다 (2026-08-16) — **순수 함수다.**
 *
 * `loadDraft` 안에 넣지 않는 이유: 저장소 접근과 만료 규칙은 다른 일이고,
 * 규칙만 따로 있어야 테스트가 localStorage 없이 잡는다.
 *
 * ⚠️ **스탬프가 없으면 손대지 않는다.** 그건 사용자가 직접 담은 것이다 —
 *    지우면 어제 저녁에 짜 둔 운동이 아침에 사라진다.
 *
 * ⚠️ 판정은 `< todayKey`가 아니라 **`!== todayKey`** 다. 기기 시계가 앞서 있거나
 *    타임존을 옮기면 스탬프가 미래일 수 있는데, `<`면 그 draft가 영영 안 지워진다.
 *
 * ⚠️ 운동 중이면 어떤 경우에도 손대지 않는다. 세션이 진행 중인 채로 목록만 비면
 *    화면과 서버가 어긋난다.
 */
export function expireStaleSuggestion(
  draft: WorkoutDraft,
  todayKey: string,
): WorkoutDraft {
  if (draft.suggestedForDayKey === null) return draft;
  if (draft.suggestedForDayKey === todayKey) return draft;
  if (draft.startedAtMs !== null) return draft;
  return {
    ...emptyDraft(draft.restSeconds),
    suggestedForDayKey: null,
  };
}

/** 유형별 기본 첫 세트 (목업 addExercise 기준) */
export function defaultSets(
  type: ExerciseType,
  measure?: "reps" | "time" | null,
): LocalSet[] {
  if (type === "weight") return [newSet({ weightKg: 20, reps: 10 })];
  if (type === "bodyweight") {
    // 초가 진실이다 (2026-08-28). `durationMin`이던 시절 기본값은 **1분**이라
    // 매달리기를 담자마자 못 채울 목표가 서 있었다.
    if (measure === "time") {
      return [
        newSet({
          durationSec: DEFAULT_HOLD_SECONDS,
          durationMin: Math.round((DEFAULT_HOLD_SECONDS / 60) * 1000) / 1000,
        }),
      ];
    }
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
      // ⚠️ **`set_number`로 정렬한다** (2026-08-24). 예전엔 Supabase가 준 순서를
      //    그대로 썼는데, 그건 보장이 없다. 완료 판정은 합계를 보므로 순서가
      //    안 중요했지만, 운동 중 '지난번 기록'은 **같은 번호 세트끼리** 견주므로
      //    (`previous-set.ts`) 순서가 어긋나면 1세트에 지난번 3세트가 붙는다.
      //    반환 타입에 `set_number`가 없어 호출자는 정렬할 수 없다 — 여기가 유일한 자리다.
      sets: (row.workout_sets ?? [])
        .slice()
        .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
        .map((s) => ({
          weightKg: Number(s.weight_kg ?? 0),
          reps: s.reps ?? 0,
          distanceKm: Number(s.distance_meters ?? 0) / 1000,
          durationMin: Math.round((s.duration_seconds ?? 0) / 60),
          durationSec: s.duration_seconds ?? 0,
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
      /*
        시간은 **초가 진실**이다 (2026-08-28). 예전엔 `durationMin * 60`이라
        세트 시계가 잰 37초를 담을 수 없었다 — `durationMin`은 분 스테퍼라
        0분 아니면 1분이었다. `durationSecondsOf`가 계획(분)에서 온 세트도
        같은 규칙으로 읽어 준다.
      */
      duration_seconds:
        isCardio || isTime ? Math.round(durationSecondsOf(s)) : null,
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
    durationSec: s.duration_seconds ?? 0,
  });
}

/**
 * 직전 기록 불러오기 — 같은 이름 운동의 가장 최근 **완료 세트** 구조 (§10).
 *
 * 완료 체크한 세트만 본다. 가장 최근 세션에 완료 세트가 없으면(계획만 하고
 * 하지 않은 종목) 그다음 최근 세션으로 넘어간다 (2026-08-01).
 */
/**
 * 프로그램 무게 추천의 **근거 세트** — 무게·횟수·완료 여부·체감을 같이 준다.
 *
 * ⚠️ `getLastRecordedSets()`와 굳이 나눈 이유: 그쪽 결과는 '직전 기록 불러오기'가
 *    **draft에 그대로 담는다.** 거기에 지난 체감을 실으면 새 세트가 이미
 *    답한 것으로 보여(`alreadyAnswered`) 피드백 시트가 영영 안 뜬다.
 *    근거는 여기서만 읽고 draft에는 넣지 않는다.
 */
export async function getProgramLoadEvidence(
  userId: string,
  exerciseName: string,
): Promise<PreviousCompletedSet[]> {
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
  if (sessionIds.length === 0) return [];

  const { data: exercises, error: eErr } = await supabase
    .from("workout_exercises")
    .select("id, session_id, workout_sets(*)")
    .in("session_id", sessionIds)
    .eq("exercise_name", exerciseName);
  if (eErr) throw eErr;
  if (!exercises || exercises.length === 0) return [];

  // 가장 최근 세션 우선 — 완료 세트가 있는 첫 세션 하나만 근거로 쓴다
  const byRecency = [...exercises].sort(
    (a, b) => sessionIds.indexOf(a.session_id) - sessionIds.indexOf(b.session_id),
  );
  for (const candidate of byRecency) {
    const rows = ((candidate.workout_sets ?? []) as WorkoutSet[])
      .slice()
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
    const completed = rows.filter((row) => row.is_completed);
    if (completed.length === 0) continue;
    return completed.map((row) => ({
      weightKg: Number(row.weight_kg ?? 0),
      reps: row.reps ?? 0,
      isCompleted: true,
      effortFeedback:
        (row as { effort_feedback?: EffortFeedback | null }).effort_feedback ??
        null,
    }));
  }
  return [];
}

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

export type { VerificationSource };

/** 사진 행 조회용 컬럼 — 목록·확정·삭제가 같은 모양을 본다 */
const PHOTO_COLS = "id, image_path, source, sort_order, client_captured_at";

/**
 * 이 세션의 사진들 — `sort_order` 오름차순, 경로 그대로(서명 전).
 *
 * ⓘ RLS `images_select_own_or_crew`가 이미 "내 것 또는 크루 공개"로 좁힌다.
 *   여기서는 `session_id`만 걸면 된다.
 */
export async function listSessionPhotoRows(
  sessionId: string,
): Promise<WorkoutPhotoRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_images")
    .select(PHOTO_COLS)
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return sortWorkoutPhotos((data ?? []) as unknown as WorkoutPhotoRow[]);
}

/** 이 세션의 사진들 + 서명 URL (1h) — 화면이 바로 쓰는 모양 */
export async function listSessionPhotos(
  sessionId: string,
): Promise<SessionPhoto[]> {
  const rows = await listSessionPhotoRows(sessionId);
  if (rows.length === 0) return [];

  const supabase = getSupabaseBrowserClient();
  // 한 번의 배치 서명 — 장수만큼 왕복하지 않는다 (`social.ts`와 같은 규약)
  const { data, error } = await supabase.storage
    .from("workout-images")
    .createSignedUrls(
      rows.map((r) => r.image_path),
      3600,
    );
  if (error || !data) return [];

  const photos: SessionPhoto[] = [];
  rows.forEach((row, i) => {
    const signed = data[i];
    // 한 장이 실패해도 나머지는 살린다 — 5장 중 1장 때문에 전부 사라지면 안 된다
    if (!signed?.signedUrl || signed.error) return;
    photos.push({
      id: row.id,
      url: signed.signedUrl,
      source: row.source,
      sortOrder: row.sort_order,
    });
  });
  return photos;
}

/**
 * 압축된 사진 한 장을 비공개 버킷에 올리고 `workout_images` 행을 만든다.
 *
 * ⚠️⚠️ **여기서 인증을 확정하지 않는다 (2026-09-10, 0103).** 예전에는 이 함수가
 * 끝에서 `set_workout_verification`까지 불렀는데, 그 RPC는 `status = 'completed'`
 * 인 세션만 받는다. **운동 중(active)에 사진을 찍으려면** 저장과 확정이 갈려야 한다.
 *
 * ⛔ 그렇다고 RPC가 active를 받도록 고치지 마라. 사진을 저장하는 것과 운동을
 *    인증하는 것은 **다른 사건**이다. 확정은 완료 뒤 `finalizeWorkoutVerification`이
 *    한 번 한다.
 *
 * ⓘ 슬롯은 `nextPhotoSlot`이 정한다. 두 장을 동시에 올리면 같은 슬롯을 계산할 수
 *   있는데, 그때 DB가 23505로 거절하는 것이 **맞다** — 다시 읽어 한 번 재시도한다.
 *   진실은 DB에 있고 클라의 낙관적 계산이 아니다.
 */
export async function uploadWorkoutImage(input: {
  userId: string;
  sessionId: string;
  blob: Blob;
  source: VerificationSource;
  clientCapturedAt: Date | null;
}): Promise<WorkoutPhotoRow> {
  const supabase = getSupabaseBrowserClient();
  const path = `${input.userId}/${input.sessionId}/${Date.now()}.jpg`;

  const existing = await listSessionPhotoRows(input.sessionId);
  let slot = nextPhotoSlot(existing);
  if (slot === null) throw new Error("photo_limit_reached");

  // ⚠️ 업로드가 먼저다. `images_insert_own` 정책이 **스토리지 객체의 존재**를
  //    조건으로 걸고 있어서, 행을 먼저 넣으면 정책에 막힌다.
  const { error: upError } = await supabase.storage
    .from("workout-images")
    .upload(path, input.blob, { contentType: "image/jpeg" });
  if (upError) throw upError;

  const insertAt = (at: number) =>
    supabase
      .from("workout_images")
      .insert({
        session_id: input.sessionId,
        user_id: input.userId,
        image_path: path,
        source: input.source,
        sort_order: at,
        client_captured_at: input.clientCapturedAt?.toISOString() ?? null,
      })
      .select(PHOTO_COLS)
      .single();

  let { data, error } = await insertAt(slot);

  // 23505 = 그 슬롯을 내 다른 탭·동시 촬영이 먼저 가져갔다. 다시 읽고 한 번만.
  if (error?.code === "23505") {
    slot = nextPhotoSlot(await listSessionPhotoRows(input.sessionId));
    if (slot === null) throw new Error("photo_limit_reached");
    ({ data, error } = await insertAt(slot));
  }
  if (error) throw error;
  return data as unknown as WorkoutPhotoRow;
}

/**
 * 완료된 세션의 인증 상태를 **한 번** 확정한다 (§8).
 *
 * 사진이 0장이면 아무것도 하지 않고 `null`을 돌려준다.
 * 등급은 `verificationSourceForPhotos`가 정한다 — **camera가 하나라도 있으면
 * `camera_verified`, 전부 album이면 `photo_uploaded`.**
 *
 * ⚠️ `client_captured_at`은 **camera 사진에 실제로 저장된 값** 중 가장 이른 것을
 *    쓴다. 없으면 `null`이다 — 지어내지 않는다.
 * ⚠️ 사진 XP는 여기서 청구하지 않는다. `award_workout_photo_xp`는 세션 기준
 *    멱등이라 5장을 올려도 한 번뿐이고, 호출 시점은 화면이 정한다.
 */
export async function finalizeWorkoutVerification(
  sessionId: string,
): Promise<WorkoutSession | null> {
  const rows = await listSessionPhotoRows(sessionId);
  const source = verificationSourceForPhotos(rows);
  if (source === null) return null;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("set_workout_verification", {
    p_session_id: sessionId,
    p_source: source,
    p_client_captured_at: capturedAtForPhotos(rows),
  });
  if (error) throw error;
  return data as WorkoutSession;
}

/**
 * 사진 순서 바꾸기 — `imageIds`가 **그 세션 사진 전량**이어야 한다.
 *
 * ⚠️ 테이블을 PATCH 하지 않는다. `workout_images`에는 UPDATE grant도 정책도
 *    없고(0096), 슬롯 맞바꾸기는 두 번에 나누면 23505로 깨진다. RPC가 한
 *    트랜잭션에서 전량을 다시 매긴다 (0104).
 */
export async function reorderWorkoutImages(
  sessionId: string,
  imageIds: string[],
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reorder_workout_images", {
    p_session_id: sessionId,
    p_image_ids: imageIds,
  });
  if (error) throw error;
}

/**
 * 사진 한 장 삭제 — 행 · 스토리지 객체 · 슬롯 · 인증 상태를 **같이** 정리한다.
 *
 * 순서가 중요하다:
 *  1. `workout_images` 행 (RLS `images_delete_own`: 내 것만)
 *  2. 스토리지 객체 (0104의 `workout_images_delete_own` 정책이 있어야 지워진다)
 *  3. 남은 사진이 있으면 슬롯을 다시 매긴다 — **구멍을 남기면 안 된다**
 *  4. 하나도 안 남으면 인증을 해제한다 (0105)
 *
 * ⚠️ 행을 먼저 지운다. 스토리지를 먼저 지우면 실패했을 때 **없는 파일을 가리키는
 *    행**이 남아 카드에 깨진 이미지가 뜬다. 반대 순서의 실패는 고아 객체 하나로
 *    끝난다(운영에 이미 95개 있고 화면에 아무 영향이 없다).
 *
 * ⚠️ 3번을 빼먹으면 0·1·2를 지운 뒤 남은 3·4에서 다음 슬롯이 5가 되어
 *    **2장뿐인데 추가가 막힌다** (`nextPhotoSlot` 주석 참조).
 */
export async function deleteWorkoutImage(input: {
  sessionId: string;
  imageId: string;
  imagePath: string;
}): Promise<{ remaining: number; verificationCleared: boolean }> {
  const supabase = getSupabaseBrowserClient();

  const { error: rowError } = await supabase
    .from("workout_images")
    .delete()
    .eq("id", input.imageId);
  if (rowError) throw rowError;

  await supabase.storage.from("workout-images").remove([input.imagePath]);

  const rest = await listSessionPhotoRows(input.sessionId);
  if (rest.length > 0) {
    await reorderWorkoutImages(
      input.sessionId,
      rest.map((r) => r.id),
    );
    return { remaining: rest.length, verificationCleared: false };
  }

  const { error: clearError } = await supabase.rpc(
    "clear_workout_verification",
    { p_session_id: input.sessionId },
  );
  if (clearError) throw clearError;
  return { remaining: 0, verificationCleared: true };
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
/**
 * 그 세션의 종목 이름만. **완료 여부로 거르지 않는다** (2026-08-13).
 *
 * 인터벌 복사가 쓴다. 인터벌은 횟수를 코스가 정하므로(4분 2회·8분 4회·16분 8회)
 * 세트가 완료로 저장됐는지와 무관하게 이름만 있으면 복원할 수 있다 —
 * 는 완료 세트만 주기 때문에 여기에 쓸 수 없다.
 */
export async function getSessionExerciseNames(
  sessionId: string,
): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("exercise_name, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { exercise_name: string }[]).map(
    (row) => row.exercise_name,
  );
}
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
        durationSec: s.duration_seconds ?? 0,
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
  /**
   * 이 세션에 붙은 사진 수 (0103) — `LatePhotoButton`을 그릴지 정한다.
   *
   * ⚠️ **`verification`으로 대신하지 마라.** 예전 호출부가 `verification !== "none"`을
   *    "사진이 있다"로 썼는데, 그 값은 **장수를 모른다** — 1장이든 5장이든 같다.
   *    상한이 5가 된 지금은 실제 수가 있어야 "더 붙일 수 있는가"를 답할 수 있다.
   * ⓘ 왕복은 안 는다. 이미 부르던 질의에 `workout_images(id)` 임베드만 더한 것이다.
   */
  photoCount: number;
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

/**
 * 제안 분기에 필요한 세 가지를 **한 번에** 읽는다 (2026-08-16).
 *
 * ⚠️ 완료 **수**를 세지 않는다. 화면은 유무(`hasCompletedHistory`)만 알면 되고,
 *    수를 요구하면 서버(브리핑 라우트)와 입력이 갈릴 여지가 생긴다 —
 *    설계 §3이 막으려는 것이 정확히 그 갈림이다.
 */
export async function getSuggestionFacts(userId: string): Promise<{
  didWorkoutToday: boolean;
  lastSessionWasInterval: boolean;
  signedUpDayKey: string;
}> {
  const supabase = getSupabaseBrowserClient();
  const tz = resolveTimeZone();
  const [lastRes, profileRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("completed_at, tabata_minutes")
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("created_at").eq("id", userId).single(),
  ]);
  const last = lastRes.data;
  return {
    didWorkoutToday: last
      ? dayKey(new Date(last.completed_at as string), tz) === dayKey(new Date(), tz)
      : false,
    lastSessionWasInterval: last ? last.tabata_minutes !== null : false,
    signedUpDayKey: profileRes.data
      ? dayKey(new Date(profileRes.data.created_at as string), tz)
      : "1970-01-01",
  };
}

/**
 * 완료 세션의 **날짜와 분만** — 기록 화면 오늘 카드용 (2026-08-19).
 *
 * ⚠️ `getCompletedSessions`를 쓰지 않는다. 그건 `workout_exercises`를 join해
 *    종목명까지 끌고 온다(달력·상세시트용). 여기 필요한 건 두 컬럼뿐이라,
 *    **랜딩 화면**에 그 무게를 얹을 이유가 없다.
 *
 * ⚠️⚠️ **기간을 자르지 않는다.** 막대는 7일만 쓰지만 **스트릭은 전체 이력이
 *    있어야 맞는다.** 90일로 잘랐다가 90일 넘는 스트릭을 만나면 이 화면만
 *    작은 숫자를 말하고, 사용자는 홈과 기록 중 어느 쪽이 맞는지 확인하러
 *    탭을 오간다. 홈(`getCompletedSessions`)과 **같은 모집단**이어야 한다.
 *
 * ⚠️ `getSuggestionFacts`에 합치지 마라. 그 함수의 입력은 **브리핑 서버와 같은
 *    판정**을 해야 해서, 화면 사정으로 늘리면 둘이 갈린다(그 함수 주석 §3).
 *
 * 실패하면 던진다 — 부르는 쪽이 빈 배열로 떨어뜨려 카드만 안 그린다.
 */
export async function getCompletedSessionMinutes(
  userId: string,
): Promise<{ completedAt: Date; durationMinutes: number | null }[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("completed_at, duration_minutes")
    .eq("user_id", userId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    completedAt: new Date(r.completed_at as string),
    durationMinutes: (r.duration_minutes as number | null) ?? null,
  }));
}

export async function getCompletedSessions(
  userId: string,
): Promise<CalendarSession[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      // workout_images(id) — 사진 **수**만 세려고 붙인다 (0103). 별도 질의를
      // 만들지 않는다. `!inner`가 아니므로 사진 없는 세션도 그대로 온다.
      "id, completed_at, duration_minutes, verification_status, record_note, tabata_minutes, workout_exercises(exercise_name, sort_order), workout_images(id)",
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
    workout_images: { id: string }[] | { id: string } | null;
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
    photoCount: workoutImageList(r.workout_images).length,
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
    .select(
      "id, user_id, completed_at, workout_images!inner(image_path, sort_order)",
    )
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

  /**
   * ⚠️ 예전에는 `Array.isArray(...)[0]`으로 아무거나 집었다. 세션당 1장이던
   *    시절에는 정답이 하나뿐이라 안 보이던 버그인데, 0103으로 최대 5장이 되면서
   *    **홈 크루 카드에 아무 사진이나 뜨게 된다** — 임베드 반환 순서는 보장되지
   *    않는다. `firstWorkoutImagePath`가 `sort_order`로 대표 한 장을 정한다.
   */
  const imagePath = firstWorkoutImagePath(row.workout_images);
  if (!imagePath) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", row.user_id)
    .maybeSingle();

  const { data: signed, error: signErr } = await supabase.storage
    .from("workout-images")
    .createSignedUrl(imagePath, 3600);
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

// ── 게시물 캡션 (2026-08-30) ─────────────────────────────────

/**
 * 완료한 운동에 붙이는 **내 말**을 저장한다.
 *
 * 자리는 `workout_sessions.title` — 0004부터 있던 컬럼인데
 * (`check (title is null or char_length(title) <= 60)`) 아무도 쓰지도 보여주지도
 * 않고 있었다. 피드는 이미 이 값을 조회해서 `FeedItem.title`로 들고 있었다.
 * 그래서 **마이그레이션이 필요 없다.**
 *
 * RPC가 아닌 이유 — `sessions_update_own` 정책(0004:234)이
 * `user_id = auth.uid()`로 주인의 UPDATE를 이미 연다. 정의자 함수를 새로 놓으면
 * 같은 판정이 두 곳으로 갈라진다.
 *
 * ⚠️ 길이 검사는 부르기 **전에** `isValidCaption`으로 한다. 60자를 넘기면
 *    서버 CHECK에 걸려 UPDATE가 통째로 실패하는데, 화면에서 막지 않으면
 *    사용자는 저장이 왜 안 되는지 알 길이 없다.
 */
export async function updateSessionCaption(
  sessionId: string,
  caption: string | null,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .update({ title: caption })
    .eq("id", sessionId)
    // ⚠️⚠️ **`.select()`를 빼지 마라 (2026-08-30에 이걸로 샜다).**
    //    빼면 PostgREST가 `Prefer: return=minimal`로 보내고, 그러면
    //    **한 줄도 안 바뀌어도 `error`가 null이다.** RLS에 막히든 id가 틀리든
    //    화면은 "저장했어요"라고 말하고 피드에는 아무것도 안 뜬다 —
    //    실제로 완료 세션 136개 전부 `title`이 null인 채로 조용히 실패했다.
    //    바뀐 행을 돌려받아 **0행이면 실패로 취급한다.**
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("caption_not_saved");
  }
}

// ── 이 운동 따라하기 (2026-08-31) ────────────────────────────

/**
 * 따라할 세션의 **메타 한 줄** — 타바타인지 가르는 데만 쓴다.
 *
 * ⚠️⚠️ **이 함수가 없으면 친구 타바타가 일반 운동으로 변질된다.**
 *    `addPastSession`은 타바타 판정을 `pastSessions`에서 세션을 찾아서 한다.
 *    그런데 그 목록을 채우는 `getCompletedSessions`는 `.eq("user_id", userId)` —
 *    **내 세션만**이다. 친구 세션은 거기 없으니 타바타인 줄 모르고 일반 복사로
 *    떨어져서, `🔥 8분 타바타`가 **맨몸운동 몇 개짜리 화면**이 된다.
 *
 * ⚠️ `getSessionExerciseStructure`로는 알 수 없다 — 그건 `workout_exercises`만
 *    읽어서 `tabata_minutes`를 모른다.
 *
 * 반환은 `tabataResumeFromSession`이 요구하는 **최소 모양**이다. 운동 내용은
 * 여전히 `getSessionExerciseStructure`가 가져온다 — 여기서 중복해 싣지 않는다.
 *
 * RLS(`sessions_select_own_or_crew`)가 크루 공개 완료 세션만 통과시킨다.
 * 볼 수 없는 세션이면 `null`.
 */
export async function getSessionCopySource(sessionId: string): Promise<{
  tabataMinutes: number | null;
  exerciseNames: string[];
  ownerId: string;
} | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id, user_id, tabata_minutes, workout_exercises(exercise_name, sort_order)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as {
    user_id: string;
    tabata_minutes: number | null;
    workout_exercises: { exercise_name: string; sort_order: number }[] | null;
  };

  return {
    tabataMinutes: row.tabata_minutes ?? null,
    exerciseNames: [...(row.workout_exercises ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => e.exercise_name),
    ownerId: row.user_id,
  };
}
