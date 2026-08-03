"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { CalendarView } from "@/components/record/calendar-view";
import { ExerciseCard } from "@/components/record/exercise-card";
import { ExercisePicker } from "@/components/record/exercise-picker";
import { ExerciseReorderSheet } from "@/components/record/exercise-reorder-sheet";
import { IdlePauseModal } from "@/components/record/idle-pause-modal";
import { RoutineSaveSheet } from "@/components/record/routine-save-sheet";
import { TabataSheet } from "@/components/record/tabata-sheet";
import { RestBar } from "@/components/record/rest-bar";
import { VerificationPhoto } from "@/components/record/verification-photo";
import { useIdleGuard, type IdleGuardSnapshot } from "@/hooks/use-idle-guard";
import { useRestCountdown } from "@/hooks/use-rest-countdown";
import {
  accumulatedPausedSeconds,
  activeElapsedSeconds,
  shouldGuardIdle,
} from "@/lib/domain/idle-guard";
import { summarizeVolume, type VolumeSummary } from "@/lib/domain/volume";
import { formatWorkoutLog } from "@/lib/domain/workout-log";
import {
  applyLastRecordedSetsToExercises,
  buildEffortMessage,
  mergeImportedExercises,
} from "@/lib/domain/workout-import";
import {
  toDraftExercises,
  toPlanExercises,
} from "@/lib/domain/workout-plan";
import {
  exerciseImprovementNote,
  exerciseMetric,
  recordBeatenSummary,
  type ExerciseImprovement,
} from "@/lib/domain/record-beaten";
import {
  nextRoutineSlotLevel,
  routineSlotLimit,
} from "@/lib/domain/routines";
import {
  deleteRoutine,
  getMyRoutines,
  renameRoutine,
  saveRoutine,
  updateRoutineExercises,
  ROUTINE_DUPLICATE_NAME,
  ROUTINE_SLOT_LIMIT,
  type WorkoutRoutine,
} from "@/lib/routines";
import {
  getChallengeGoals,
  getMyChallenges,
  goalCategories,
  type GoalCategory,
} from "@/lib/challenge";
import { getLevelRewards, getProgressSummary } from "@/lib/progression";
import { tabataDraftExercises } from "@/lib/domain/tabata";
import { moveItem } from "@/lib/domain/reorder";
import { getRestCountdownTogglePlan } from "@/lib/domain/rest-countdown";
import { dayKey } from "@/lib/domain/time";
import { XpResultModal } from "@/components/record/xp-result-modal";
import { buildXpEvents, type XpEvent } from "@/lib/domain/xp-events";
import { shareOrCopyText, shareResultToast } from "@/lib/share";
import { prepareRestCountdownAudio } from "@/lib/rest-countdown-audio";
import { getMyGroups } from "@/lib/crew";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";
import {
  deleteWorkoutPlan,
  saveWorkoutPlan,
  type WorkoutPlan,
} from "@/lib/workout-plan";
import {
  cancelWorkout,
  clearDraft,
  finishWorkout,
  createCustomExercise,
  createDraftSession,
  defaultSets,
  emptyDraft,
  getCompletedSessions,
  getExerciseCatalog,
  getLastCompletedWeightVolume,
  getLastRecordedSets,
  getMyActiveSession,
  getPreviousExerciseRecords,
  getSessionById,
  getSessionExerciseStructure,
  loadDraft,
  localId,
  markRecordBeaten,
  newSet,
  saveDraft,
  saveSessionExercises,
  startWorkout,
  toVolumeSets,
  type CalendarSession,
  type LocalExercise,
  type LocalSet,
  type WorkoutDraft,
} from "@/lib/workout";

export default function RecordPage() {
  const { userId, loading, configured, error } = useAuth();

  if (!configured) {
    return (
      <p className="pt-10 text-center text-sm text-muted">
        Supabase 설정(.env.local)이 필요해요.
      </p>
    );
  }
  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (!userId) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        익명 인증에 실패했어요{error ? ` — ${error}` : ""}. 홈 탭에서 상태를
        확인해 주세요.
      </p>
    );
  }
  return <WorkoutScreen userId={userId} />;
}

type CompletedResult = {
  sessionId: string;
  completedAtMs: number;
  durationMinutes: number;
  summary: VolumeSummary;
  logText: string; // 완료 시점에 미리 생성 — draft가 비워진 뒤에도 공유 가능
  recordNote: string | null; // 기록 갱신 문구 (원본 세션 초과 시)
};

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("active_session_exists")) return "이미 진행 중인 운동이 있어요";
  if (msg.includes("invalid_status")) return "세션 상태가 맞지 않아요. 새로고침해 주세요";
  if (msg.includes("session_not_found")) return "세션을 찾을 수 없어요";
  if (msg.includes("duplicate key")) return "이미 같은 이름의 운동이 있어요";
  return `오류: ${msg}`;
}

function WorkoutScreen({ userId }: { userId: string }) {
  // 임시저장 복구: 렌더 전 lazy 초기화 (§10 새로고침 복구)
  const [draft, setDraftState] = useState(() => loadDraft(userId));
  const draftRef = useRef(draft);
  const setDraft = useCallback((action: SetStateAction<WorkoutDraft>) => {
    const nextDraft =
      typeof action === "function" ? action(draftRef.current) : action;
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
  }, []);
  const [subTab, setSubTab] = useState<"workout" | "calendar">("workout");
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [prevVolume, setPrevVolume] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [tabataOpen, setTabataOpen] = useState(false);
  const tabataMinutesRef = useRef<number | null>(null);
  const [pastSessions, setPastSessions] = useState<CalendarSession[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  // ── 나만의 루틴 (0056) ────────────────────────────────────────────
  /**
   * null = 루틴 기능을 쓸 수 없다 (0056 미적용이거나 조회 실패).
   *
   * ⚠️ 빈 배열로 두면 안 된다. `[]`는 "루틴이 0개"라는 정상 상태라서 탭과
   * 저장 버튼이 멀쩡히 뜨고, 누르면 Postgres 오류 문구가 그대로 보인다
   * (2026-08-02 개발 서버 확인에서 사용자가 잡았다).
   */
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [routineSaveOpen, setRoutineSaveOpen] = useState(false);
  const [challengeCategories, setChallengeCategories] =
    useState<ReadonlySet<GoalCategory> | null>(null);
  const [slotLimit, setSlotLimit] = useState(routineSlotLimit(1, []));
  const [nextSlotLevel, setNextSlotLevel] = useState<number | null>(null);
  const [result, setResult] = useState<CompletedResult | null>(null);
  const [xpEvents, setXpEvents] = useState<XpEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const finishingRef = useRef(false); // 종료 재진입 방지
  const [loadingExerciseKey, setLoadingExerciseKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = draft.sessionId !== null && draft.startedAtMs !== null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);
  const {
    remainingSeconds: restRemaining,
    lastRestEndsAtMs,
    startRest,
    extendRest,
    stopRest,
    cancelRestForSource,
  } = useRestCountdown(active, () => {
    showToast("휴식 끝! 다음 세트 시작 💪");
  });

  // ── 무동작 감지 (설계 2026-08-01) ────────────────────────────────
  const handleIdleChange = useCallback(
    (next: IdleGuardSnapshot) => {
      setDraft((d) => ({ ...d, ...next }));
    },
    [setDraft],
  );
  const {
    paused,
    nowMs,
    markActivity,
    resumeFromPause,
    totalPausedSeconds,
  } = useIdleGuard({
    active,
    guarded: shouldGuardIdle({
      exercises: draft.exercises,
      isTabata: draft.tabataMinutes !== null,
    }),
    lastRestEndsAtMs,
    snapshot: {
      pausedSeconds: draft.pausedSeconds,
      pausedAtMs: draft.pausedAtMs,
      lastActivityMs: draft.lastActivityMs,
    },
    onChange: handleIdleChange,
  });

  // 자동 임시저장 (§10)
  useEffect(() => {
    saveDraft(userId, draft);
  }, [userId, draft]);

  // 카탈로그·크루·직전 볼륨 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, groups, prev] = await Promise.all([
          getExerciseCatalog(),
          getMyGroups(),
          getLastCompletedWeightVolume(userId),
        ]);
        if (cancelled) return;
        setCatalog(cat);
        setGroupId(groups[0]?.id ?? null);
        setPrevVolume(prev);
      } catch {
        if (!cancelled) showToast("데이터를 불러오지 못했어요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  /**
   * 내 루틴 + 슬롯 한도 (0056).
   *
   * 한도는 `level_definitions`(보상 표)와 현재 레벨로 계산한다 — 레벨 12·27을
   * 코드에 박지 않는다. 서버 트리거도 같은 표를 읽으므로 화면과 서버가
   * 갈라지지 않는다. 조회에 실패해도 루틴 기능만 조용히 비고 기록은 막지 않는다.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mine, rewards, progress] = await Promise.all([
          getMyRoutines(userId),
          getLevelRewards(),
          getProgressSummary(),
        ]);
        if (cancelled) return;
        const level = progress.currentLevel;
        setRoutines(mine);
        setSlotLimit(routineSlotLimit(level, rewards));
        setNextSlotLevel(nextRoutineSlotLevel(level, rewards));
      } catch {
        // 0056 적용 전이면 테이블이 없어 실패한다. routines를 null로 남겨
        // 루틴 탭·저장 버튼을 아예 감춘다 — 기록 자체는 막지 않는다.
        if (!cancelled) setRoutines(null);
      } finally {
        if (!cancelled) setRoutinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * 진행 중인 챌린지에서 내 목표가 덮는 분류 (2026-08-04, 사용자 요청).
   *
   * 신고 0783ca35는 목표가 맨몸·유산소뿐인데 웨이트 스쿼트를 100회 기록하고서야
   * 챌린지 %가 안 오른다는 걸 알았다. 피커가 고르는 자리에서 말해 주려면
   * 여기서 미리 목표를 읽어 둬야 한다.
   *
   * 실패하면 null로 남긴다 — 모를 때 경고하면 멀쩡한 운동을 말리게 된다.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = (await getMyChallenges(userId)).find(
          (c) => c.status === "active" && c.myStatus !== "invited",
        );
        if (!active) return;
        const goals = await getChallengeGoals(active.id);
        if (cancelled) return;
        const mine = goals.filter((g) => g.user_id === userId);
        if (mine.length > 0) setChallengeCategories(goalCategories(mine));
      } catch {
        // 챌린지가 없거나 못 읽어도 기록은 그대로 돼야 한다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 세션 상태 대사(對査): 로컬 draft ↔ 서버 상태 (§10 복구)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadDraft(userId);
      if (local.sessionId) {
        const s = await getSessionById(local.sessionId).catch(() => null);
        if (cancelled) return;
        if (s && s.status === "active" && s.started_at) {
          const startedAtMs = new Date(s.started_at).getTime();
          setDraft((d) => ({ ...d, startedAtMs }));
        } else if (s && s.status === "draft") {
          setDraft((d) => ({ ...d, startedAtMs: null }));
        } else {
          // 다른 기기에서 완료·취소됐거나 삭제됨
          setDraft((d) => emptyDraft(d.restSeconds));
        }
      } else {
        const s = await getMyActiveSession(userId).catch(() => null);
        if (cancelled || !s?.started_at) return;
        const startedAtMs = new Date(s.started_at).getTime();
        setDraft((d) => ({ ...d, sessionId: s.id, startedAtMs }));
        showToast("진행 중이던 운동을 이어서 기록해요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast, setDraft]);

  // 경과 시간 틱은 useIdleGuard가 함께 돌린다 (nowMs) — 인터벌을 둘로 두지 않는다.

  const updateExercise = useCallback(
    (key: string, updater: (ex: LocalExercise) => LocalExercise) => {
      markActivity();
      setDraft((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => (ex.key === key ? updater(ex) : ex)),
      }));
    },
    [markActivity, setDraft],
  );

  /** 선택한 운동 여러 개를 한 번에 추가 (다중 선택 피커) */
  function addExercises(items: CatalogExercise[]) {
    if (items.length === 0) return;
    const added: LocalExercise[] = items.map((item) => ({
      key: localId(),
      name: item.name,
      bodyPart: item.body_part,
      exerciseType: item.exercise_type,
      measure: item.measure,
      isCustom: item.is_custom,
      sets: defaultSets(item.exercise_type, item.measure),
    }));
    markActivity();
    setDraft((d) => ({ ...d, exercises: [...d.exercises, ...added] }));
    setPickerOpen(false);
    showToast(
      items.length === 1
        ? `'${items[0].name}' 추가됨`
        : `운동 ${items.length}개 추가됨`,
    );
  }

  async function loadLastExercise(exercise: LocalExercise) {
    if (active || loadingExerciseKey !== null) return;

    setLoadingExerciseKey(exercise.key);
    try {
      const recordedSets = await getLastRecordedSets(userId, exercise.name);
      if (!recordedSets) {
        showToast("아직 불러올 직전 기록이 없어요");
        return;
      }

      const current = draftRef.current;
      const applied = applyLastRecordedSetsToExercises({
        active: current.sessionId !== null && current.startedAtMs !== null,
        exercises: current.exercises,
        targetKey: exercise.key,
        recordedSets,
      });
      if (!applied.loaded) return;

      const nextDraft = {
        ...current,
        exercises: applied.exercises,
        effortMessage: buildEffortMessage([applied.loaded]),
      };
      setDraft(nextDraft);
      showToast(`${applied.loaded.name} 직전 기록을 불러왔어요`);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setLoadingExerciseKey(null);
    }
  }

  async function openExercisePicker() {
    setPickerOpen(true);
    if (pastLoaded || pastLoading) return;
    setPastLoading(true);
    try {
      setPastSessions(await getCompletedSessions(userId));
      setPastLoaded(true);
    } catch {
      showToast("지난 기록을 불러오지 못했어요");
    } finally {
      setPastLoading(false);
    }
  }

  async function addPastSession(sessionId: string): Promise<boolean> {
    try {
      const items = await getSessionExerciseStructure(sessionId);
      if (items.length === 0) {
        showToast("불러올 운동 종목이 없어요");
        return false;
      }

      const byName = new Map(catalog.map((item) => [item.name, item]));
      const imported: LocalExercise[] = items.map((item) => ({
        key: localId(),
        name: item.name,
        bodyPart: byName.get(item.name)?.body_part ?? item.bodyPart ?? "코어",
        exerciseType: item.exerciseType,
        measure: item.measure,
        isCustom: byName.get(item.name)?.is_custom ?? false,
        sets: item.sets.map((set) => ({ ...set, done: false })),
      }));
      const merged = mergeImportedExercises(draft.exercises, imported);

      if (merged.added.length === 0) {
        showToast("이 기록의 운동은 이미 모두 추가되어 있어요");
        return false;
      }

      setDraft((current) => ({
        ...current,
        exercises: mergeImportedExercises(current.exercises, imported).exercises,
        effortMessage: buildEffortMessage(merged.added),
      }));
      const skipped = merged.skippedCount > 0
        ? ` · 중복 ${merged.skippedCount}개 제외`
        : "";
      showToast(`지난 기록에서 ${merged.added.length}개 추가했어요${skipped}`);
      return true;
    } catch (error) {
      showToast(errorMessage(error));
      return false;
    }
  }

  // ── 나만의 루틴 (0056) ────────────────────────────────────────────

  /**
   * 루틴 불러오기는 **교체가 아니라 병합**이다.
   *
   * '운동 추가' 시트 안에서 일어나는 일이므로 '지난 기록' 탭과 같아야 한다.
   * (예정표의 `handleLoadPlan`은 "지우고 바꿀까요?"를 묻지만 그건 그날의 계획을
   * 통째로 여는 별개 흐름이다.)
   */
  async function addRoutine(routine: WorkoutRoutine): Promise<boolean> {
    const imported = toDraftExercises(routine.exercises, localId);
    const merged = mergeImportedExercises(draft.exercises, imported);

    if (merged.added.length === 0) {
      showToast("이 루틴의 운동은 이미 모두 추가되어 있어요");
      return false;
    }

    setDraft((current) => ({
      ...current,
      exercises: mergeImportedExercises(current.exercises, imported).exercises,
      effortMessage: buildEffortMessage(merged.added),
    }));
    const skipped =
      merged.skippedCount > 0 ? ` · 중복 ${merged.skippedCount}개 제외` : "";
    showToast(`'${routine.name}'에서 ${merged.added.length}개 추가했어요${skipped}`);
    return true;
  }

  function routineErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : "";
    if (message === ROUTINE_DUPLICATE_NAME) {
      return "같은 이름의 루틴이 이미 있어요";
    }
    if (message === ROUTINE_SLOT_LIMIT) {
      return `루틴 슬롯 ${slotLimit}개를 모두 썼어요`;
    }
    // 0056 미적용 등으로 테이블이 없을 때 PostgREST가 내는 문구를 그대로
    // 흘리면 사용자에게 "schema cache" 같은 말이 보인다.
    if (message.includes("workout_routines")) {
      return "루틴 기능을 아직 쓸 수 없어요. 잠시 후 다시 시도해 주세요";
    }
    return errorMessage(error);
  }

  async function handleSaveRoutine(name: string): Promise<boolean> {
    const exercises = toPlanExercises(draft.exercises);
    if (exercises.length === 0) {
      showToast("저장할 운동이 없어요");
      return false;
    }
    try {
      const saved = await saveRoutine({ userId, name, exercises });
      setRoutines((current) => [saved, ...(current ?? [])]);
      showToast(`'${saved.name}' 루틴을 저장했어요`);
      return true;
    } catch (error) {
      showToast(routineErrorMessage(error));
      return false;
    }
  }

  /** 기존 루틴의 종목을 지금 담은 목록으로 갈아 끼운다 (2026-08-04) */
  async function handleOverwriteRoutine(routineId: string): Promise<boolean> {
    const exercises = toPlanExercises(draft.exercises);
    if (exercises.length === 0) {
      showToast("저장할 운동이 없어요");
      return false;
    }
    try {
      const updated = await updateRoutineExercises(routineId, exercises);
      setRoutines((current) =>
        (current ?? []).map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
      showToast(`'${updated.name}' 루틴의 운동을 바꿨어요`);
      return true;
    } catch (error) {
      showToast(routineErrorMessage(error));
      return false;
    }
  }

  async function handleRenameRoutine(
    routineId: string,
    name: string,
  ): Promise<boolean> {
    try {
      const renamed = await renameRoutine(routineId, name);
      setRoutines((current) =>
        (current ?? []).map((item) => (item.id === renamed.id ? renamed : item)),
      );
      return true;
    } catch (error) {
      showToast(routineErrorMessage(error));
      return false;
    }
  }

  async function handleDeleteRoutine(routine: WorkoutRoutine): Promise<void> {
    try {
      await deleteRoutine(routine.id);
      setRoutines((current) =>
        (current ?? []).filter((item) => item.id !== routine.id),
      );
      showToast(`'${routine.name}' 루틴을 삭제했어요`);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function handleCreateCustom(input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }): Promise<CatalogExercise | null> {
    try {
      const created = await createCustomExercise({ ...input, userId });
      setCatalog((c) => [...c, created]);
      return created; // 피커가 선택 목록에 담는다 — 추가는 '선택한 n개 추가'로
    } catch (e) {
      showToast(errorMessage(e));
      return null;
    }
  }

  function updateSet(exKey: string, si: number, patch: Partial<LocalSet>) {
    updateExercise(exKey, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === si ? { ...s, ...patch } : s)),
    }));
  }

  function toggleDone(exKey: string, si: number) {
    if (!active) {
      showToast("운동을 먼저 시작하세요 💪");
      return;
    }
    const ex = draft.exercises.find((e) => e.key === exKey);
    const set = ex?.sets[si];
    if (!set) return;

    const willDone = !set.done;
    const sourceKey = `${exKey}:${set.key}`;
    const restPlan = getRestCountdownTogglePlan(ex.exerciseType, willDone);
    if (restPlan.prepareAudio) prepareRestCountdownAudio();
    updateSet(exKey, si, { done: willDone });
    if (restPlan.timerAction === "start") {
      startRest(sourceKey, draft.restSeconds);
    } else if (restPlan.timerAction === "cancel") {
      cancelRestForSource(sourceKey);
    }
  }

  function addSet(exKey: string) {
    updateExercise(exKey, (ex) => {
      const last = ex.sets.at(-1);
      // 새 세트는 직전값 복사 (§10)
      return {
        ...ex,
        sets: [
          ...ex.sets,
          newSet(
            last
              ? {
                  weightKg: last.weightKg,
                  reps: last.reps,
                  distanceKm: last.distanceKm,
                  durationMin: last.durationMin,
                }
              : {},
          ),
        ],
      };
    });
  }

  function removeSet(exKey: string) {
    updateExercise(exKey, (ex) =>
      ex.sets.length > 1 ? { ...ex, sets: ex.sets.slice(0, -1) } : ex,
    );
  }

  function removeExercise(exKey: string) {
    markActivity();
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.filter((ex) => ex.key !== exKey),
    }));
  }

  function stepRest(delta: number) {
    setDraft((d) => ({
      ...d,
      restSeconds: Math.min(600, Math.max(10, d.restSeconds + delta)),
    }));
  }

  async function handleScheduleFromPast(
    sessionId: string,
    planDate: string,
  ): Promise<WorkoutPlan> {
    setBusy(true);
    try {
      const items = await getSessionExerciseStructure(sessionId);
      if (items.length === 0) {
        throw new Error("복사할 종목이 없어요");
      }
      const byName = new Map(catalog.map((c) => [c.name, c]));
      const exercises: LocalExercise[] = items.map((it) => ({
        key: localId(),
        name: it.name,
        bodyPart: byName.get(it.name)?.body_part ?? it.bodyPart ?? "코어",
        exerciseType: it.exerciseType,
        measure: it.measure,
        isCustom: byName.get(it.name)?.is_custom ?? false,
        sets: it.sets,
      }));
      const plan = await saveWorkoutPlan({
        userId,
        planDate,
        sourceSessionId: sessionId,
        exercises: toPlanExercises(exercises),
      });
      showToast(`${Number(planDate.slice(5, 7))}월 ${Number(planDate.slice(8))}일 예정표로 저장했어요`);
      return plan;
    } catch (e) {
      showToast(errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // ── 타바타 모드 (설계 2026-07-19) — 시작/자동완료/취소를 기존 세션 흐름에 위임 ──

  async function beginTabata(
    picked: CatalogExercise[],
    minutes: number,
  ): Promise<boolean> {
    if (active) {
      showToast("이미 운동 중이에요");
      return false;
    }
    if (
      draftRef.current.exercises.length > 0 &&
      !window.confirm("준비 중인 운동 목록을 지우고 타바타를 시작할까요?")
    ) {
      return false;
    }
    setDraft((d) => ({
      ...emptyDraft(d.restSeconds),
      exercises: tabataDraftExercises(picked, localId),
      // 타바타는 무동작 감지 대상이 아니다 — 음원을 따라 하는 동안 앱을 만지지 않는다.
      tabataMinutes: minutes,
    }));
    tabataMinutesRef.current = minutes;
    try {
      await handleStart();
    } finally {
      tabataMinutesRef.current = null; // 일반 운동 시작에 표식이 새지 않게
    }
    return draftRef.current.startedAtMs !== null;
  }

  async function completeTabata() {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((set) => ({ ...set, done: true })),
      })),
    }));
    await handleFinish();
  }

  async function cancelTabata() {
    const d = draftRef.current;
    try {
      if (d.sessionId) await cancelWorkout(d.sessionId);
    } catch {
      // 세션 취소 실패해도 로컬 초기화는 진행 — 다음 시작 시 대사로 복구됨
    }
    setDraft(emptyDraft(d.restSeconds));
  }

  function handleLoadPlan(plan: WorkoutPlan): boolean {
    if (active) {
      showToast("운동 중에는 다른 예정표를 불러올 수 없어요");
      return false;
    }
    if (
      draft.exercises.length > 0 &&
      !window.confirm("준비 중인 운동 목록을 지우고 예정표로 바꿀까요?")
    ) {
      return false;
    }
    const exercises = toDraftExercises(plan.exercises, localId);
    setDraft((current) => ({
      ...current,
      scheduledPlanId: plan.id,
      sourceSessionId: plan.sourceSessionId,
      effortMessage: null,
      exercises,
    }));
    setSubTab("workout");
    showToast("예정표를 불러왔어요 — 준비되면 운동을 시작하세요");
    return true;
  }

  async function handleStart() {
    // 타바타 등에서 setDraft 직후 같은 틱에 호출돼도 최신 상태를 보도록 ref 사용
    const draft = draftRef.current;
    if (loadingExerciseKey !== null) {
      showToast("직전 기록을 불러오는 중이에요. 잠시만 기다려 주세요");
      return;
    }
    if (draft.exercises.length === 0) {
      showToast("운동을 먼저 추가하세요");
      return;
    }
    setBusy(true);
    try {
      let sessionId = draft.sessionId;
      if (!sessionId) {
        const tz =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
        const s = await createDraftSession({
          groupId,
          timezone: tz,
          tabataMinutes: tabataMinutesRef.current ?? undefined,
        });
        sessionId = s.id;
        setDraft((d) => ({ ...d, sessionId }));
      }
      const started = await startWorkout(sessionId);
      const startedAtMs = new Date(started.started_at!).getTime();
      setDraft((d) => ({
        ...d,
        sessionId,
        startedAtMs,
      }));
      showToast("운동 시작! 💪");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    // 타바타 자동 완료가 setDraft 직후 호출해도 최신 상태를 보도록 ref 사용
    const draft = draftRef.current;
    if (!draft.sessionId) return;
    // 재진입 방지 — 버튼 disabled와 별개로, 타바타 자동 완료가 진행 중인
    // 수동 종료와 겹치면 같은 세션을 두 번 종료하려다 오류가 난다.
    if (finishingRef.current) return;
    const incomplete = draft.exercises
      .flatMap((e) => e.sets)
      .filter((s) => !s.done).length;
    if (
      incomplete > 0 &&
      !window.confirm(
        `미완료 세트 ${incomplete}개는 볼륨에 반영되지 않아요.\n이대로 완료할까요?`,
      )
    ) {
      return; // 취소 — 아직 가드를 세우지 않았으므로 다음 종료가 막히지 않는다
    }
    finishingRef.current = true;
    stopRest();
    setBusy(true);
    try {
      await saveSessionExercises(draft.sessionId, draft.exercises);
      // 완료 + XP를 한 트랜잭션으로 처리한다(0022 complete_workout_v2).
      // finishWorkout는 이미 완료된 세션(0 XP 재종료 등)을 오류가 아니라
      // 조용한 성공으로 처리해, 종료 불가 상태에 갇히지 않게 한다.
      // v2는 XP 결과만 돌려주므로 완료 시각·소요 시간은 세션을 다시 읽는다.
      const sessionId = draft.sessionId;
      // 무동작으로 멈춰 있던 시간은 서버 duration에서 뺀다 (0055).
      const xp = await finishWorkout(sessionId, totalPausedSeconds());
      const s = await getSessionById(sessionId);
      const completedAtMs = s?.completed_at
        ? new Date(s.completed_at).getTime()
        : Date.now();
      let planCleanupFailed = false;
      if (draft.scheduledPlanId) {
        try {
          await deleteWorkoutPlan(draft.scheduledPlanId);
        } catch {
          planCleanupFailed = true;
        }
      }
      // 기록 갱신 판정 — 종목마다 그 종목의 직전 기록과 비교한다. 구성이
      // 달라도 성립한다. 판정·RPC 실패는 완료 흐름을 막지 않는다.
      let recordNote: string | null = null;
      try {
        const names = draft.exercises.map((ex) => ex.name);
        const previousByName = await getPreviousExerciseRecords(
          userId,
          names,
          sessionId,
        );

        const improvements: ExerciseImprovement[] = [];
        for (const ex of draft.exercises) {
          const previous = previousByName.get(ex.name);
          if (!previous) continue;

          const current = {
            name: ex.name,
            exerciseType: ex.exerciseType,
            measure: ex.measure,
            sets: ex.sets.map((set) => ({
              weightKg: set.weightKg,
              reps: set.reps,
              distanceKm: set.distanceKm,
              durationMin: set.durationMin,
              isCompleted: set.done,
            })),
          };

          const note = exerciseImprovementNote(previous, current);
          if (!note) continue;

          const before = exerciseMetric(previous);
          improvements.push({
            note,
            ratio: before > 0 ? (exerciseMetric(current) - before) / before : 0,
          });
        }

        recordNote = recordBeatenSummary(improvements);
        if (recordNote) await markRecordBeaten(sessionId, recordNote);
      } catch {
        recordNote = null;
      }
      setResult({
        sessionId,
        completedAtMs,
        durationMinutes: s?.duration_minutes ?? 0,
        summary: summarizeVolume(toVolumeSets(draft.exercises)),
        logText: formatWorkoutLog(
          dayKey(
            new Date(completedAtMs),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
          draft.exercises,
        ),
        recordNote,
      });
      setXpEvents(buildXpEvents(xp)); // 멱등 재생·XP 0이면 빈 배열 → 모달 없음
      clearDraft(userId);
      setDraft(emptyDraft(draft.restSeconds));
      // 완료 직후 다시 운동을 준비할 때 방금 기록도 목록에 포함한다.
      setPastLoaded(false);
      setPastSessions([]);
      if (planCleanupFailed) {
        showToast("운동은 완료됐지만 예정표는 달력에서 직접 삭제해 주세요");
      }
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
      finishingRef.current = false;
    }
  }

  async function handleCancel() {
    if (!window.confirm("운동을 취소할까요? 이번 기록은 저장되지 않아요.")) {
      return;
    }
    stopRest();
    setBusy(true);
    try {
      if (draft.sessionId) await cancelWorkout(draft.sessionId);
      setDraft(emptyDraft(draft.restSeconds));
      showToast("운동을 취소했어요");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = summarizeVolume(toVolumeSets(draft.exercises));
  // 멈춰 있던 시간은 경과 시간에서 뺀다. 정지 중에는 정지 시작 시점에 멈춰 있다.
  const elapsedSec =
    active && draft.startedAtMs
      ? activeElapsedSeconds({
          startedAtMs: draft.startedAtMs,
          nowMs,
          pausedSeconds: draft.pausedSeconds,
          pausedAtMs: draft.pausedAtMs,
        })
      : 0;
  const pausedForSec = accumulatedPausedSeconds({
    pausedSeconds: 0,
    pausedAtMs: draft.pausedAtMs,
    nowMs,
  });
  const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const restMm = String(Math.floor(draft.restSeconds / 60)).padStart(2, "0");
  const restSs = String(draft.restSeconds % 60).padStart(2, "0");
  const today = new Date();
  const volumeDelta =
    prevVolume !== null ? summary.weightVolumeKg - prevVolume : null;

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <header className="pt-2 pb-1">
          <h1 className="text-[19px] font-extrabold tracking-tight">운동 기록</h1>
        </header>
        <section className="rounded-card border border-good bg-surface p-6 text-center shadow-card">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-1 text-lg font-extrabold">오늘 운동 완료!</h2>
          <p className="mt-1 text-sm text-muted">
            {result.durationMinutes}분 · 볼륨{" "}
            {result.summary.weightVolumeKg.toLocaleString()}kg · 완료 세트{" "}
            {result.summary.completedSetCount}개
          </p>
          {result.recordNote && (
            <p className="mt-2 rounded-card-sm bg-accent-weak px-3 py-2 text-sm font-extrabold text-accent">
              🏅 기록 갱신! 지난번보다 {result.recordNote}
            </p>
          )}
        </section>
        {/* 인증사진 (§11) — 지금 촬영만 (앨범 선택은 2026-08-01에 제거) */}
        <VerificationPhoto
          userId={userId}
          sessionId={result.sessionId}
          durationMinutes={result.durationMinutes}
          completedAtMs={result.completedAtMs}
          onToast={showToast}
        />
        <p className="text-center text-xs text-muted">
          &lsquo;달력&rsquo; 탭에서 오늘 스탬프를 확인할 수 있어요. 카메라
          인증은 🔥, 업로드는 ●로 찍혀요.
        </p>
        <button
          onClick={async () => {
            const msg = shareResultToast(await shareOrCopyText(result.logText));
            if (msg) showToast(msg);
          }}
          className="h-12 rounded-card border border-line bg-surface-2 text-sm font-bold"
        >
          📤 AI 코치에게 공유
        </button>
        <button
          onClick={() => setResult(null)}
          className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          확인
        </button>
        {xpEvents.length > 0 && (
          <XpResultModal events={xpEvents} onClose={() => setXpEvents([])} />
        )}
        {toast && (
          <div
            className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
          >
            {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">운동 기록</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {active ? "운동 중" : "준비"}
          </p>
        </div>
        {active && subTab === "workout" && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="text-xs font-bold text-faint"
          >
            취소
          </button>
        )}
      </header>

      {/* 운동 / 달력 서브탭 (§12) */}
      <div className="flex gap-1 rounded-card border border-line bg-surface-2 p-1">
        {(["workout", "calendar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`h-9 flex-1 rounded-[9px] text-sm font-bold transition-colors ${
              subTab === t
                ? "bg-surface text-accent shadow-card"
                : "text-muted"
            }`}
          >
            {t === "workout" ? "운동" : "달력"}
          </button>
        ))}
      </div>

      {subTab === "calendar" ? (
        <>
          <CalendarView
            userId={userId}
            catalog={catalog}
            routines={routines ?? undefined}
            routinesLoading={routinesLoading}
            onScheduleSession={handleScheduleFromPast}
            onLoadPlan={handleLoadPlan}
            onCreateCustom={handleCreateCustom}
          />
          {toast && (
            <div
              className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
            >
              {toast}
            </div>
          )}
        </>
      ) : (
        <>
      {/* 세션 헤더 (§10) */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <p
              className={`text-xs font-bold ${paused ? "text-warn" : "text-accent"}`}
            >
              {paused ? "⏸ 정지됨 — 무동작" : active ? "운동 중" : "준비"}
            </p>
            {active ? (
              <p
                className={`mt-1 font-mono text-2xl font-extrabold ${
                  paused ? "text-muted" : ""
                }`}
              >
                {hh}:{mm}:{ss}
              </p>
            ) : (
              <p className="mt-1 font-mono text-sm text-muted">
                {today.getMonth() + 1}월 {today.getDate()}일
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">완료 볼륨</p>
            <p className="font-mono text-[26px] leading-tight font-extrabold">
              {summary.weightVolumeKg.toLocaleString()}
              <span className="text-[15px]">kg</span>
            </p>
            {volumeDelta !== null && (
              <p className="font-mono text-xs text-muted">
                이전 대비{" "}
                <span className={volumeDelta >= 0 ? "text-good" : "text-warn"}>
                  {volumeDelta >= 0 ? "+" : ""}
                  {volumeDelta.toLocaleString()}kg
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 휴식 사전설정 — 운동 시작 전 10초 단위 (§10) */}
      <section className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <div>
          <p className="text-sm font-bold">세트 사이 휴식</p>
          <p className="text-[11.5px] text-muted">
            {active ? "운동 중에는 변경할 수 없어요" : "완료 체크하면 이 시간으로 시작해요"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepRest(-10)}
            disabled={active}
            aria-label="10초 줄이기"
            className="h-9 w-9 rounded-full border border-line bg-surface-2 text-lg font-bold disabled:opacity-40"
          >
            –
          </button>
          <span className="w-12 text-center font-mono text-sm font-extrabold">
            {restMm}:{restSs}
          </span>
          <button
            onClick={() => stepRest(10)}
            disabled={active}
            aria-label="10초 늘리기"
            className="h-9 w-9 rounded-full border border-line bg-surface-2 text-lg font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
      </section>

      {/* 운동 카드 목록 */}
      {draft.effortMessage && (
        <section className="flex items-start gap-3 rounded-card border border-accent/40 bg-accent-weak px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-accent">오늘의 한 번 더</p>
            <p className="mt-1 text-sm leading-5 font-bold">
              {draft.effortMessage}
            </p>
          </div>
          <button
            type="button"
            aria-label="노력 제안 닫기"
            title="닫기"
            onClick={() =>
              setDraft((current) => ({ ...current, effortMessage: null }))
            }
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-lg text-muted"
          >
            ×
          </button>
        </section>
      )}

      {draft.exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.key}
          exercise={ex}
          index={i}
          active={active}
          loadingLast={loadingExerciseKey === ex.key}
          loadLastDisabled={loadingExerciseKey !== null}
          onLoadLast={() => void loadLastExercise(ex)}
          onUpdateSet={(si, patch) => updateSet(ex.key, si, patch)}
          onToggleDone={(si) => toggleDone(ex.key, si)}
          onAddSet={() => addSet(ex.key)}
          onRemoveSet={() => removeSet(ex.key)}
          onRemoveExercise={() => removeExercise(ex.key)}
          onLongPress={() => setReorderOpen(true)}
        />
      ))}

      {reorderOpen && (
        <ExerciseReorderSheet
          exercises={draft.exercises}
          onMove={(from, to) =>
            setDraft((d) => ({
              ...d,
              exercises: moveItem(d.exercises, from, to),
            }))
          }
          onRemove={removeExercise}
          onClose={() => setReorderOpen(false)}
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void openExercisePicker()}
          className="h-12 flex-1 rounded-card border border-line bg-surface text-sm font-bold text-accent"
        >
          + 운동 추가
        </button>
        <button
          onClick={active ? handleFinish : handleStart}
          disabled={busy || loadingExerciseKey !== null}
          className={`h-12 flex-1 rounded-card text-sm font-extrabold disabled:opacity-60 ${
            active ? "bg-good text-white" : "bg-accent text-accent-ink"
          }`}
        >
          {busy ? "처리 중…" : active ? "운동 종료" : "운동 시작"}
        </button>
      </div>
      {!active && draft.exercises.length > 0 && routines !== null && (
        <button
          onClick={() => setRoutineSaveOpen(true)}
          disabled={busy}
          className="h-12 rounded-card border border-line bg-surface text-sm font-bold text-accent disabled:opacity-60"
        >
          💾 이 목록을{" "}
          {routines.length >= slotLimit && routines.length > 0
            ? "기존 루틴에 덮어쓰기"
            : "루틴으로 저장"}{" "}
          ({routines.length}/{slotLimit})
        </button>
      )}
      {!active && (
        <button
          onClick={() => setTabataOpen(true)}
          disabled={busy}
          className="h-12 rounded-card border border-accent bg-surface text-sm font-extrabold text-accent disabled:opacity-60"
        >
          🔥 타바타 — 음원 따라 4분, 기록은 자동
        </button>
      )}
      <p className="text-center text-xs text-muted">
        완료 체크한 세트만 볼륨에 반영돼요. 새로고침해도 진행 중 기록은 복구됩니다.
      </p>

      <TabataSheet
        open={tabataOpen}
        catalog={catalog}
        onClose={() => setTabataOpen(false)}
        onCreateCustom={handleCreateCustom}
        onBegin={beginTabata}
        onComplete={completeTabata}
        onCancelWorkout={cancelTabata}
      />

      {restRemaining !== null && (
        <RestBar
          remainingSeconds={restRemaining}
          onExtend={() => {
            markActivity();
            extendRest();
          }}
          onSkip={() => {
            markActivity();
            stopRest();
          }}
        />
      )}

      <ExercisePicker
        open={pickerOpen}
        catalog={catalog}
        pastSessions={pastSessions}
        pastLoading={pastLoading}
        onClose={() => setPickerOpen(false)}
        onPickMany={addExercises}
        onPickPast={addPastSession}
        onCreateCustom={handleCreateCustom}
        challengeCategories={challengeCategories}
        routines={routines ?? undefined}
        routinesLoading={routinesLoading}
        onPickRoutine={addRoutine}
        onRenameRoutine={handleRenameRoutine}
        onDeleteRoutine={handleDeleteRoutine}
      />

      <RoutineSaveSheet
        open={routineSaveOpen}
        exerciseNames={draft.exercises.map((exercise) => exercise.name)}
        savedCount={routines?.length ?? 0}
        slotLimit={slotLimit}
        nextSlotLevel={nextSlotLevel}
        routines={(routines ?? []).map((routine) => ({
          id: routine.id,
          name: routine.name,
          exerciseNames: routine.exercises.map((exercise) => exercise.name),
        }))}
        onClose={() => setRoutineSaveOpen(false)}
        onSave={handleSaveRoutine}
        onOverwrite={handleOverwriteRoutine}
      />

      {toast && (
        <div
          className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
        >
          {toast}
        </div>
      )}
        </>
      )}

      {/* 무동작 정지 — 달력 탭을 보고 있어도 떠야 한다 (설계 2026-08-01) */}
      {paused && (
        <IdlePauseModal
          pausedSeconds={pausedForSec}
          busy={busy}
          onResume={resumeFromPause}
          onFinish={() => void handleFinish()}
        />
      )}
    </div>
  );
}
