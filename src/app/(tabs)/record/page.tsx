"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { CalendarView } from "@/components/record/calendar-view";
import { ExerciseCard } from "@/components/record/exercise-card";
import {
  ExercisePicker,
  type ConfiguredPick,
} from "@/components/record/exercise-picker";
import { RecordEmptyState } from "@/components/record/record-empty-state";
import { ExerciseReorderSheet } from "@/components/record/exercise-reorder-sheet";
import { IdlePauseModal } from "@/components/record/idle-pause-modal";
import { RoutineSaveSheet } from "@/components/record/routine-save-sheet";
import { ZeroWeightSheet } from "@/components/record/zero-weight-sheet";
import { shouldAskBodyweight } from "@/lib/domain/zero-weight";
import { TabataSheet } from "@/components/record/tabata-sheet";
import { RestBar } from "@/components/record/rest-bar";
import { ActiveSessionOverlay } from "@/components/record/active-session-overlay";
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
  sessionGoalContribution,
  toPeriodSessionRow,
  type GoalContribution,
} from "@/lib/challenge";
import { getLevelRewards, getProgressSummary } from "@/lib/progression";
import {
  asTabataMinutes,
  tabataDraftExercises,
  tabataPickFromNames,
  tabataResumeFromSession,
  type TabataMinutes,
} from "@/lib/domain/tabata";
import { moveItem } from "@/lib/domain/reorder";
import {
  getRestCountdownTogglePlan,
  nextRestSeconds,
} from "@/lib/domain/rest-countdown";
import { nextUpSet } from "@/lib/domain/next-up";
import {
  exerciseSetProgress,
  workoutProgress,
} from "@/lib/domain/workout-progress";
import {
  advanceSetFocus,
  clampSetFocus,
} from "@/lib/domain/focus-exercise";
import { amountFields } from "@/lib/domain/set-input";
import { workoutCompletionMessage } from "@/lib/domain/workout-complete-message";
import {
  COMPLETION_AUTO_FINISH_MS,
  overlayMode,
  shouldAutoFinishAfterRest,
  shouldRestAfterCompletion,
} from "@/lib/domain/session-flow";
import { dayKey } from "@/lib/domain/time";
import { XpResultModal } from "@/components/record/xp-result-modal";
import { buildXpEvents, type XpEvent } from "@/lib/domain/xp-events";
import { shareOrCopyText, shareResultToast } from "@/lib/share";
import { prepareRestCountdownAudio } from "@/lib/rest-countdown-audio";
import { getMyGroups } from "@/lib/crew";
import type {
  BodyPart,
  CatalogExercise,
  ExerciseType,
  UserGoal,
} from "@/lib/types";
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
  hasCompletedHistory,
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
  /** 이번 운동이 챌린지 목표에 보탠 양 (2026-08-04) — draft가 비워지기 전에 계산한다 */
  challengeGains: GoalContribution[];
};

/** 예정표에서 연 타바타의 미리 채움 (0059) */
type TabataPrefill = {
  picked: CatalogExercise[];
  minutes: TabataMinutes;
  /**
   * 완료하면 지울 예정표 id — **예정표에서 연 경우에만** 있다 (0059).
   * 지난 기록에서 되살린 타바타는 지울 계획이 없으므로 생략한다.
   */
  planId?: string;
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
  /**
   * 큰 팝업을 접어 뒀는가 (2026-08-04, 설계 ②).
   *
   * **저장하지 않는다.** 열림 여부의 진실은 `active`이고 이건 잠깐 접어 둔
   * 상태일 뿐이다. localStorage에 넣으면 draft 버전을 올려야 하고 승격 코드가
   * 또 는다. 새로고침하면 다시 펴지는데, 운동 중이라는 사실이 더 중요하다.
   */
  const [minimized, setMinimized] = useState(false);
  /**
   * 팝업이 보여줄 **한 종목**의 위치 (2026-08-04, 사용자 지적으로 추가).
   *
   * 파생하지 않고 상태로 든다 — "미완료 첫 세트가 있는 종목"으로 매번 계산하면
   * 뒤 종목으로 옮겨 기록하는 순간 앞 종목에 미완료가 남아 화면이 튕겨 돌아간다.
   */
  const [focusIndex, setFocusIndex] = useState(0);
  /** 팝업이 보여줄 세트 번호 — 목업의 `현재 세트 1 / 5` */
  const [focusSetIndex, setFocusSetIndex] = useState(0);
  const [tabataOpen, setTabataOpen] = useState(false);
  /** 예정표에서 연 타바타 — 종목·코스를 채운 채 열고, 완료하면 그 계획을 지운다 */
  const [tabataPrefill, setTabataPrefill] = useState<TabataPrefill | null>(null);
  const tabataMinutesRef = useRef<number | null>(null);
  const [pastSessions, setPastSessions] = useState<CalendarSession[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  /**
   * 완료한 운동이 하나라도 있나 — 빈 화면의 '최근 운동 불러오기' 노출 판정.
   *
   * ⚠️ `pastSessions.length > 0`으로 대신할 수 없다. 그건 **피커를 연 뒤에만**
   * 채워지므로(`loadPastSessions`의 `pastLoaded` 가드), 빈 화면에서는 항상
   * `[]`라 버튼이 영영 안 뜬다. 그렇다고 마운트에서 목록을 통째로 받으면
   * 이력이 쌓일수록 커지는 무한 질의가 된다 — 필요한 건 1비트다.
   */
  const [hasHistory, setHasHistory] = useState(false);
  /** 피커를 어느 화면으로 열지 — 기본은 진입 허브 */
  const [pickerMode, setPickerMode] = useState<"hub" | "past">("hub");
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
  /**
   * 내 챌린지 목표 원본 (2026-08-04). 피커의 '챌린지 미반영' 판정과 완료 화면의
   * 기여 표시가 **같은 목표 묶음**을 쓴다 — 두 번 조회하면 갈라진다.
   */
  const [challengeGoals, setChallengeGoals] = useState<UserGoal[] | null>(null);
  const challengeCategories = useMemo(
    () =>
      challengeGoals && challengeGoals.length > 0
        ? goalCategories(challengeGoals)
        : null,
    [challengeGoals],
  );
  const [challengePhotoRequired, setChallengePhotoRequired] = useState(false);
  /** 완료 화면에서 인증사진을 올렸는가 — 기여 문구가 "쌓여요"→"쌓였어요"로 바뀐다 */
  const [resultPhotoDone, setResultPhotoDone] = useState(false);
  /** 0kg 되묻기 — 열려 있는 질문과, 종목별로 이미 물어봤는지 */
  const [zeroWeightAsk, setZeroWeightAsk] = useState<{
    exKey: string;
    name: string;
  } | null>(null);
  const [zeroWeightAsked, setZeroWeightAsked] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [slotLimit, setSlotLimit] = useState(routineSlotLimit(1, []));
  const [nextSlotLevel, setNextSlotLevel] = useState<number | null>(null);
  const [result, setResult] = useState<CompletedResult | null>(null);
  const [xpEvents, setXpEvents] = useState<XpEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const finishingRef = useRef(false); // 종료 재진입 방지
  const [loadingExerciseKey, setLoadingExerciseKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 축하 화면 → 결과 화면 자동 전환 타이머 (B안). 언마운트·취소 시 반드시 끈다 */
  const autoFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = draft.sessionId !== null && draft.startedAtMs !== null;

  const clearAutoFinish = useCallback(() => {
    if (autoFinishTimer.current) {
      clearTimeout(autoFinishTimer.current);
      autoFinishTimer.current = null;
    }
  }, []);

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
    adjustRest,
    stopRest,
    cancelRestForSource,
  } = useRestCountdown(active, () => {
    /**
     * 휴식이 끝난 순간 (2026-08-04, 사용자 신고로 추가).
     *
     * 담은 세트를 전부 끝냈으면 **인증 사진 화면으로 자연스럽게 넘어간다.**
     * 전에는 여기서 토스트만 띄웠고, 모드가 입력으로 되돌아가 이미 완료한
     * 세트가 `현재 세트 1 / 1`로 다시 떴다.
     *
     * ⚠️ 남은 세트가 있으면 절대 자동으로 끝내지 않는다. 미완료 0건일 때만이라
     * `handleFinish`의 확인창도 뜨지 않는다.
     */
    const pending = draftRef.current.exercises.reduce(
      (count, exercise) =>
        count + exercise.sets.filter((set) => !set.done).length,
      0,
    );
    if (shouldAutoFinishAfterRest({ pendingSetCount: pending })) {
      // `handleFinish`는 함수 선언이라 호이스팅되고, 훅이 최신 클로저를
      // ref로 잡으므로 여기서 바로 불러도 옛 상태를 보지 않는다.
      void handleFinish();
      return;
    }
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

  // 화면을 떠나면 자동 전환 타이머를 끈다 — 남아 있으면 다른 탭에서 운동이 끝난다
  useEffect(() => clearAutoFinish, [clearAutoFinish]);

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
   * 이력이 있는 사용자인가 (2026-08-06) — 빈 화면의 보조 CTA 노출 판정.
   *
   * `head: true` 개수 질의라 행을 하나도 안 받는다. 실패하면 `false`로 남긴다 —
   * 못 읽었을 때 버튼을 띄우면 눌러도 빈 목록이 나온다.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await hasCompletedHistory(userId);
        if (!cancelled) setHasHistory(has);
      } catch {
        // 기록 자체는 막지 않는다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
        // 사진 필수 여부는 달력이 "사진이 없어 안 잡혀요"를 말하는 데 쓴다
        setChallengePhotoRequired(Boolean(active.photo_required));
        setChallengeGoals(goals.filter((g) => g.user_id === userId));
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

  /**
   * 추천 경로 — 세트·목표·무게까지 정해서 담는다 (2026-08-06).
   *
   * `addExercises`와 다른 점은 세트를 `defaultSets`가 아니라 **설정 화면이 준
   * 것**으로 쓴다는 것뿐이다. 그래서 두 함수를 합치지 않고 세트만 갈아 끼운다.
   */
  function addConfiguredExercises(picks: ConfiguredPick[]) {
    if (picks.length === 0) return;
    const added: LocalExercise[] = picks.map(({ item, sets }) => ({
      key: localId(),
      name: item.name,
      bodyPart: item.body_part,
      exerciseType: item.exercise_type,
      measure: item.measure,
      isCustom: item.is_custom,
      sets,
    }));
    markActivity();
    setDraft((d) => ({ ...d, exercises: [...d.exercises, ...added] }));
    setPickerOpen(false);
    showToast(
      picks.length === 1
        ? `'${picks[0].item.name}' 추가됨`
        : `운동 ${picks.length}개 추가됨`,
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

  /**
   * 지난 기록 목록을 한 번만 가져온다 — 운동 추가 시트와 타바타 시트가 같이 쓴다.
   *
   * 타바타 시트에서도 불러야 한다 (2026-08-05). 안 부르면 그쪽 '지난 기록' 탭이
   * "아직 완료한 운동이 없어요"로 남는다.
   */
  async function loadPastSessions() {
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

  async function openExercisePicker(mode: "hub" | "past" = "hub") {
    setPickerMode(mode);
    setPickerOpen(true);
    await loadPastSessions();
  }

  async function openTabataSheet(prefill: TabataPrefill | null = null) {
    setTabataPrefill(prefill);
    setTabataOpen(true);
    await loadPastSessions();
  }

  async function addPastSession(sessionId: string): Promise<boolean> {
    /*
      지난 **타바타**는 타바타로 되살린다 (2026-08-07, 사용자 지시).

      예전에는 여기서도 종목만 뽑아 담아서, 지난 타바타를 부르면 음원도 코스도
      없는 맨몸 운동 4개가 됐다. 예정표(0059)는 코스를 싣고 다니는데 이 경로만
      안 실어서 **같은 기록을 어디서 부르느냐에 따라 결과가 달랐다.**

      타바타가 아니거나 종목을 못 찾으면 `null`이라 아래 평소 경로로 흘러간다.
    */
    const resume = tabataResumeFromSession({
      session: pastSessions.find((s) => s.id === sessionId),
      catalog,
    });
    if (resume) {
      setPickerOpen(false);
      setSubTab("workout");
      void openTabataSheet({ picked: resume.picked, minutes: resume.minutes });
      return true;
    }

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
    // 그 종목을 다 끝냈으면 다음 종목으로 옮겨 준다 (설계 ②).
    // 해제(willDone=false)에는 움직이지 않는다 — 되돌리는 중에 화면이 튀면 안 된다.
    if (willDone) {
      const after = draftRef.current.exercises.map((exercise) =>
        exercise.key === exKey
          ? {
              ...exercise,
              sets: exercise.sets.map((set, index) =>
                index === si ? { ...set, done: true } : set,
              ),
            }
          : exercise,
      );
      const moved = advanceSetFocus(after, {
        exerciseIndex: focusIndex,
        setIndex: focusSetIndex,
      });
      setFocusIndex(moved.exerciseIndex);
      setFocusSetIndex(moved.setIndex);
    }

    // 0kg 웨이트 세트면 그 자리에서 되묻는다 (2026-08-04) — 데이터로 추측해
    // 자동으로 옮기지 않는 이유는 domain/zero-weight.ts 주석에 있다.
    if (
      shouldAskBodyweight({
        exerciseType: ex.exerciseType,
        weightKg: set.weightKg,
        reps: set.reps,
        willDone,
        alreadyAsked: zeroWeightAsked.has(exKey),
      })
    ) {
      setZeroWeightAsked((current) => new Set(current).add(exKey));
      setZeroWeightAsk({ exKey, name: ex.name });
    }
    /**
     * 마지막 세트에는 휴식을 걸지 않는다 (2026-08-04, 사용자 결정 = B안).
     *
     * 더 할 세트가 없는데 타이머를 돌릴 이유가 없다. 무엇보다 유산소는 애초에
     * 휴식이 안 걸려서(`shouldStartRestCountdown`), "휴식이 끝나면 넘어간다"에
     * 기대면 **유산소로 끝낸 날은 자동 전환이 영영 안 온다.**
     * 대신 축하 화면을 3초 보여주고 결과·인증 사진 화면으로 넘어간다.
     */
    const pendingAfter = draftRef.current.exercises.reduce(
      (count, exercise) =>
        count +
        exercise.sets.filter((set, index) => {
          const isToggled = exercise.key === exKey && index === si;
          return isToggled ? !willDone : !set.done;
        }).length,
      0,
    );
    const restAllowed = shouldRestAfterCompletion({
      pendingSetCountAfter: pendingAfter,
    });

    if (restPlan.timerAction === "start" && restAllowed) {
      startRest(sourceKey, draft.restSeconds);
    } else if (restPlan.timerAction === "cancel") {
      cancelRestForSource(sourceKey);
    }

    if (willDone && pendingAfter === 0) {
      stopRest(); // 앞 세트의 휴식이 돌고 있으면 축하 화면을 가린다
      scheduleAutoFinish();
    } else {
      clearAutoFinish();
    }
  }

  /**
   * 되묻기에 "맨몸으로 바꾸기"로 답했을 때 — 담아 둔 종목의 유형을 바꾼다.
   *
   * 이름은 그대로 둔다. `workout_exercises`는 카탈로그 FK가 아니라 이름·유형을
   * 각각 text로 저장하므로 맨몸인 '스쿼트'가 그대로 표현된다. 카탈로그의
   * '맨몸 스쿼트'로 갈아 끼우는 방법도 있지만 이름 매칭이라 부서지기 쉽다.
   */
  function switchToBodyweight(exKey: string) {
    updateExercise(exKey, (ex) => ({
      ...ex,
      exerciseType: "bodyweight",
      measure: "reps",
      // 맨몸은 무게 칸을 안 그린다 — 남겨 두면 다음에 다시 되묻게 된다
      sets: ex.sets.map((s) => ({ ...s, weightKg: 0 })),
    }));
    setZeroWeightAsk(null);
    showToast("맨몸 운동으로 바꿨어요 — 챌린지 맨몸 실적에 들어가요");
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

  /**
   * 휴식 사전설정 증감 — **운동 중에도 열려 있다** (2026-08-04, 사용자 결정).
   *
   * 돌고 있는 휴식이 있으면 같이 옮긴다. 설정값만 바꾸고 진행 중인 휴식을 두면
   * "10초 줄였다"가 두 가지 뜻이 되어, 사용자는 눌러도 아무 일이 없다고 느낀다.
   * 클램프 규칙은 `nextRestSeconds`가, 하한 1초는 `adjustRest`가 갖는다.
   */
  /**
   * 휴식 프리셋 — 누르면 기본값이 바뀌고 **돌고 있는 휴식도 그 값으로 다시
   * 맞춰진다** (사용자 결정 2026-08-04). ±10초와 같은 규약이다.
   */
  function setRestSeconds(seconds: number) {
    markActivity();
    const current = draftRef.current.restSeconds;
    setDraft((d) => ({ ...d, restSeconds: seconds }));
    adjustRest(seconds - current);
  }

  function stepRest(delta: number) {
    markActivity();
    setDraft((d) => ({ ...d, restSeconds: nextRestSeconds(d.restSeconds, delta) }));
    adjustRest(delta);
  }

  async function handleScheduleFromPast(
    sessionId: string,
    planDate: string,
    /** 그 세션이 타바타였으면 코스 분수 — 예정표도 타바타로 남는다 (0059) */
    tabataMinutes?: number | null,
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
      const course = asTabataMinutes(tabataMinutes);
      const plan = await saveWorkoutPlan({
        userId,
        planDate,
        sourceSessionId: sessionId,
        exercises: toPlanExercises(exercises),
        tabataMinutes: course,
      });
      const what = course ? `🔥 타바타 ${course}분을` : "운동을";
      showToast(
        `${what} ${Number(planDate.slice(5, 7))}월 ${Number(planDate.slice(8))}일 예정표로 저장했어요`,
      );
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
    minutes: TabataMinutes,
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
    // 예정표에서 연 타바타면 그 계획 id를 이어받는다 (2026-08-05). emptyDraft로
    // 갈아엎으면서 버리면 타바타를 완료해도 예정표가 그대로 남는다.
    const scheduledPlanId = tabataPrefill?.planId ?? null;
    setDraft((d) => ({
      ...emptyDraft(d.restSeconds),
      exercises: tabataDraftExercises(picked, localId, minutes),
      scheduledPlanId,
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
    /*
      타바타 계획은 운동 목록이 아니라 **타바타 시트**로 연다 (2026-08-05).
      draft에 종목만 부어 넣으면 음원도 코스도 없는 맨몸 운동 4개가 될 뿐이다.
    */
    if (plan.tabataMinutes) {
      const picked = tabataPickFromNames(
        plan.exercises.map((exercise) => exercise.name),
        catalog,
      );
      if (picked.length === 0) {
        showToast("예정표의 타바타 종목을 운동 목록에서 찾지 못했어요");
        return false;
      }
      setSubTab("workout");
      void openTabataSheet({
        picked,
        minutes: plan.tabataMinutes,
        planId: plan.id,
      });
      return true;
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
      setMinimized(false); // 시작하면 큰 팝업으로 전환한다 (설계 ②)
      setFocusIndex(0);
      setFocusSetIndex(0);
      showToast("운동 시작! 💪");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * 축하 화면을 잠깐 보여준 뒤 결과·인증 사진 화면으로 넘긴다 (B안).
   *
   * `handleFinish`는 재진입 가드(`finishingRef`)가 있어 사용자가 '지금 바로 보기'를
   * 먼저 눌러도 두 번 종료되지 않는다.
   */
  function scheduleAutoFinish() {
    clearAutoFinish();
    autoFinishTimer.current = setTimeout(() => {
      autoFinishTimer.current = null;
      void handleFinish();
    }, COMPLETION_AUTO_FINISH_MS);
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
        // draft를 비우기 전에 계산한다 — 아래 setDraft(emptyDraft())가 지운다
        challengeGains:
          challengeGoals && challengeGoals.length > 0
            ? sessionGoalContribution({
                session: toPeriodSessionRow({
                  userId,
                  completedAtMs,
                  exercises: draft.exercises,
                  // 타바타를 빠뜨리면 tabata_count 목표가 늘 0으로 보인다
                  // (신고 a2ffb44a) — draft가 비워지기 전에 읽는다
                  tabataMinutes: draft.tabataMinutes,
                }),
                goals: challengeGoals,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            : [],
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
    clearAutoFinish();
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
  /**
   * 화면 분기의 단일 진실 (사용자 지시 2026-08-06).
   *
   * 운동을 하나도 안 담았고 세션도 안 시작했으면, 볼륨·휴식·시작·타바타·복구
   * 안내는 전부 지금 할 일과 무관하다 — 아예 안 그린다. 새 상태를 만들지
   * 않는다: `draft.exercises.length`가 이미 그 정보를 갖고 있다.
   */
  const isEmpty = !active && draft.exercises.length === 0;
  // 팝업 열림은 `active`에서 파생한다 — 별도 저장 없음 (설계 ②)
  const overlayOpen = active && !minimized;
  const nextUp = nextUpSet(draft.exercises);
  /** 아직 완료하지 않은 세트 수 — 1이면 지금 보는 것이 오늘의 마지막이다 */
  const pendingSetCount = draft.exercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => !set.done).length,
    0,
  );
  // 문구는 날짜 기준 로테이션이다 — 렌더 중 랜덤은 재렌더마다 문구가 바뀐다
  const completionMessage = workoutCompletionMessage({
    todayKey: dayKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    ),
  });
  /**
   * 입력 카드는 한 벌만 만든다 (설계 ②).
   *
   * 팝업이 열려 있으면 팝업 안에, 아니면 기존 자리에 그린다. 새 입력
   * 컴포넌트를 만들지 않는 이유는 프리필·볼륨 계산·완료 토글이 두 벌이 되면
   * 갈라지기 때문이다.
   */
  const setFocus = clampSetFocus(draft.exercises, {
    exerciseIndex: focusIndex,
    setIndex: focusSetIndex,
  });
  const focus = setFocus.exerciseIndex;
  const focusedExercise = draft.exercises[focus] ?? null;
  const focusedSet = focusedExercise?.sets[setFocus.setIndex] ?? null;
  const exerciseCards = draft.exercises.map((ex, i) => (
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
  ));
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
        {/*
          이번 운동이 챌린지 목표에 얼마나 보탰는지 (2026-08-04, 사용자 요청).
          사진 필수 챌린지인데 아직 사진이 없으면 "쌓여요"(미래형)로 말하고,
          바로 아래 촬영 버튼으로 이어 준다 — 경고보다 이쪽이 동기가 된다.
        */}
        {result.challengeGains.length > 0 &&
          (() => {
            const gained = result.challengeGains.filter((g) => g.delta > 0);
            // 하나도 못 보탰으면 **그 사실과 이유**를 말한다. 카드를 감추면
            // "왜 안 오르지?"에 침묵하게 된다 (2026-08-04 사용자 지적).
            if (gained.length === 0) {
              return (
                <section className="rounded-card border border-warn/40 bg-surface p-4">
                  <p className="text-xs font-extrabold text-warn">
                    🎯 이번 운동은 챌린지 성과에 안 잡혔어요
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                    운동 기록과 XP는 그대로 쌓였어요. 다만 지금 내 챌린지 목표와
                    맞는 게 없어요.
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {result.challengeGains.map((gain) => (
                      <li key={gain.type} className="text-[12.5px] font-bold">
                        · {gain.label}{" "}
                        <span className="font-normal text-muted">
                          (목표 {gain.target}
                          {gain.unit})
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            }
            return (
              <section className="rounded-card border border-accent/40 bg-accent-weak p-4">
                <p className="text-xs font-extrabold text-accent">
                  🎯 챌린지 목표에{" "}
                  {challengePhotoRequired && !resultPhotoDone
                    ? "쌓일 몫"
                    : "쌓였어요"}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {gained.map((gain) => (
                    <li
                      key={gain.type}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="font-bold">{gain.label}</span>
                      <span className="font-mono font-extrabold text-accent">
                        +{gain.delta}
                        {gain.unit}
                        <span className="ml-1 font-sans text-[11px] font-bold text-muted">
                          / 목표 {gain.target}
                          {gain.unit}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {challengePhotoRequired && !resultPhotoDone && (
                  <p className="mt-2.5 text-[11.5px] font-bold text-warn">
                    📷 아래에서 인증 사진을 올려야 챌린지 성과에 반영돼요.
                  </p>
                )}
              </section>
            );
          })()}

        {/* 인증사진 (§11) — 지금 촬영만 (앨범 선택은 2026-08-01에 제거) */}
        <VerificationPhoto
          userId={userId}
          sessionId={result.sessionId}
          durationMinutes={result.durationMinutes}
          completedAtMs={result.completedAtMs}
          onToast={showToast}
          onUploaded={() => setResultPhotoDone(true)}
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

  // 하단 고정 '운동 시작'이 뜨면 마지막 카드가 그 뒤로 숨는다 — 여백을 늘린다.
  // RestBar와는 공존하지 않는다(RestBar는 운동 중에만) — 겹칠 일이 없다.
  const showFixedStart =
    subTab === "workout" && !active && draft.exercises.length > 0;

  return (
    <div
      className={`flex flex-col gap-3 ${showFixedStart ? "pb-40" : "pb-24"}`}
    >
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">운동 기록</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {active ? "운동 중" : isEmpty ? "처음이라면 운동부터 추가해보세요" : "준비"}
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
            photoRequired={challengePhotoRequired}
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
      {/*
        등록된 운동이 0개면 볼륨·휴식·시작·타바타·복구 안내를 **하나도** 안
        그린다 (사용자 지시 2026-08-06). 여기서 중요한 건 무엇을 더 그리느냐가
        아니라 무엇을 **안 그리느냐**다 — 지금 할 일은 하나다.
      */}
      {isEmpty && (
        <RecordEmptyState
          hasHistory={hasHistory}
          onAdd={() => void openExercisePicker("hub")}
          onLoadRecent={() => void openExercisePicker("past")}
        />
      )}

      {/* 세션 헤더 (§10) */}
      {!isEmpty && (
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
      )}

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

      {/* 팝업이 열려 있으면 카드는 그 안에만 그린다 — 같은 카드를 두 곳에 두지 않는다 */}
      {!overlayOpen && exerciseCards}

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

      {/*
        운동 추가는 **보조 버튼**이다 (사용자 지시 2026-08-06) — 목록이 있으면
        핵심 행동은 '시작'이지 '더 담기'가 아니다.
        운동 중에는 '운동 종료'가 여기 그대로 남는다: 진행 중 흐름(오버레이·
        RestBar·자동완료)을 건드리면 위험만 늘고 요구에도 없다.
      */}
      {/* ⚠️ 빈 상태에는 안 낸다 — `첫 운동 추가하기`와 같은 일을 하는 버튼이
          두 개가 된다 (사용자 지적 2026-08-06) */}
      {!isEmpty && (
        <div className="flex gap-2">
          <button
            onClick={() => void openExercisePicker()}
            className="h-12 flex-1 rounded-card border border-line bg-surface text-sm font-bold text-accent"
          >
            + 운동 추가
          </button>
          {active && (
            <button
              onClick={handleFinish}
              disabled={busy || loadingExerciseKey !== null}
              className="h-12 flex-1 rounded-card bg-good text-sm font-extrabold text-white disabled:opacity-60"
            >
              {busy ? "처리 중…" : "운동 종료"}
            </button>
          )}
        </div>
      )}

      {/*
        세트 사이 휴식은 **운동 목록 아래 부가 설정**으로 내렸다 (사용자 지시).
        시작 전 화면의 최상단은 오늘 담은 운동이어야 한다.
      */}
      {!isEmpty && (
        <section className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3 shadow-card">
          <div>
            <p className="text-sm font-bold">세트 사이 휴식</p>
            <p className="text-[11.5px] text-muted">
              {active
                ? "지금 쉬는 중이면 남은 시간도 같이 바뀌어요"
                : "완료 체크하면 이 시간으로 시작해요"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => stepRest(-10)}
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
              aria-label="10초 늘리기"
              className="h-9 w-9 rounded-full border border-line bg-surface-2 text-lg font-bold disabled:opacity-40"
            >
              +
            </button>
          </div>
        </section>
      )}
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
      {/*
        🔥 타바타 버튼은 여기 없다 — '운동 추가' 진입 허브로 옮겼다
        (사용자 지적 2026-08-06). 타바타도 "오늘 운동을 어떻게 할까"의 한
        가지인데 혼자만 기록 화면에 상설 버튼으로 붙어 있었다.

        ⚠️ 옮기면서 **거꾸로였던 조건도 같이 고쳐졌다.** 직전 구현은
        `!isEmpty`라, 잃을 목록이 없어 타바타에 가장 좋은 순간(0개)에는
        숨기고, 타바타가 목록을 지워 버리는 순간(1개 이상)에만 보였다.
        이제 어느 쪽이든 허브를 거치고, 목록이 있으면 `beginTabata`가
        "지우고 시작할까요?"를 한 번 더 묻는다.
      */}
      {!isEmpty && (
        <p className="text-center text-xs text-muted">
          완료 체크한 세트만 볼륨에 반영돼요. 새로고침해도 진행 중 기록은 복구됩니다.
        </p>
      )}

      {/*
        운동 시작은 **하단 고정 CTA**다 (사용자 지시 2026-08-06).
        0개일 때는 렌더 자체를 안 한다 — 전에는 눌리기는 하고 "운동을 먼저
        추가하세요" 토스트만 뜨는 막다른 길이었다. 비활성으로 남기지도 않는다.
        위치 규약은 RestBar와 같다(safe-area + 72px = 탭 바 높이). 둘은
        공존하지 않는다 — RestBar는 운동 중에만 뜬다.
      */}
      {showFixedStart && (
        <div
          className="fixed inset-x-3 z-30"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        >
          <button
            onClick={handleStart}
            disabled={busy || loadingExerciseKey !== null}
            className="h-14 w-full rounded-card bg-accent text-[15px] font-extrabold text-accent-ink shadow-card disabled:opacity-60"
          >
            {busy ? "처리 중…" : "운동 시작"}
          </button>
        </div>
      )}

      <TabataSheet
        open={tabataOpen}
        catalog={catalog}
        onClose={() => {
          setTabataOpen(false);
          setTabataPrefill(null);
        }}
        onCreateCustom={handleCreateCustom}
        onBegin={beginTabata}
        onComplete={completeTabata}
        onCancelWorkout={cancelTabata}
        pastSessions={pastSessions}
        pastLoading={pastLoading}
        routines={routines ?? undefined}
        routinesLoading={routinesLoading}
        initialPicked={tabataPrefill?.picked}
        initialMinutes={tabataPrefill?.minutes}
      />

      {/*
        ⚠️ **큰 팝업이 열려 있으면 안 그린다** (2026-08-07, 사용자 지시 ①).

        팝업의 휴식 화면이 이미 남은 시간·±10초·프리셋을 다 갖고 있어서, 둘이
        같이 뜨면 같은 타이머가 화면에 두 번 보인다. RestBar가 있어야 하는 건
        `▾ 최소화`로 접었을 때뿐이다 — 그때는 남은 시간을 볼 수단이 이것뿐이다.
      */}
      {restRemaining !== null && !overlayOpen && (
        <RestBar
          remainingSeconds={restRemaining}
          nextUp={nextUp}
          onAdjust={(delta) => stepRest(delta)}
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
        initialMode={pickerMode}
        catalog={catalog}
        pastSessions={pastSessions}
        pastLoading={pastLoading}
        onClose={() => setPickerOpen(false)}
        onPickMany={addExercises}
        onPickConfigured={addConfiguredExercises}
        onPickPast={addPastSession}
        onOpenTabata={() => {
          setPickerOpen(false);
          void openTabataSheet();
        }}
        onCreateCustom={handleCreateCustom}
        challengeCategories={challengeCategories}
        routines={routines ?? undefined}
        routinesLoading={routinesLoading}
        onPickRoutine={addRoutine}
        onRenameRoutine={handleRenameRoutine}
        onDeleteRoutine={handleDeleteRoutine}
      />

      <ZeroWeightSheet
        exerciseName={zeroWeightAsk?.name ?? null}
        onKeepWeight={() => setZeroWeightAsk(null)}
        onSwitchToBodyweight={() => {
          if (zeroWeightAsk) switchToBodyweight(zeroWeightAsk.exKey);
        }}
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

      {/*
        운동 중 큰 팝업 (설계 ② 2026-08-04, 사용자 목업 기준 재구성).

        `input`(세트 하나 입력) ↔ `rest`(휴식·다음 운동)가 번갈아 뜬다.
        z-20이라 운동 추가 시트(z-40/50)·무동작 정지 모달(z-50)이 이 위에 뜬다.
        탭바는 덮지 않는다 — 달력·피드로 바로 갈 수 있어야 한다(사용자 결정).
      */}
      <ActiveSessionOverlay
        open={overlayOpen}
        mode={overlayMode({
          resting: restRemaining !== null,
          pendingSetCount,
        })}
        elapsedLabel={`${hh}:${mm}:${ss}`}
        exerciseName={focusedExercise?.name ?? null}
        progress={workoutProgress(draft.exercises)}
        setProgress={exerciseSetProgress(focusedExercise)}
        setPosition={{
          index: setFocus.setIndex,
          total: focusedExercise?.sets.length ?? 0,
        }}
        fields={
          focusedExercise
            ? amountFields(focusedExercise.exerciseType, focusedExercise.measure)
            : []
        }
        values={{
          weightKg: focusedSet?.weightKg ?? 0,
          reps: focusedSet?.reps ?? 0,
          distanceKm: focusedSet?.distanceKm ?? 0,
          durationMin: focusedSet?.durationMin ?? 0,
        }}
        restSeconds={restRemaining ?? draft.restSeconds}
        restPresetSeconds={draft.restSeconds}
        nextUp={
          nextUp
            ? { exerciseName: nextUp.exerciseName, amount: nextUp.amount }
            : null
        }
        isLastPendingSet={pendingSetCount === 1 && !focusedSet?.done}
        completionMessage={completionMessage}
        paused={paused}
        busy={busy}
        onChangeAmount={(key, value) => {
          if (!focusedExercise) return;
          updateSet(focusedExercise.key, setFocus.setIndex, { [key]: value });
        }}
        onCompleteSet={() => {
          if (!focusedExercise || !focusedSet || focusedSet.done) return;
          toggleDone(focusedExercise.key, setFocus.setIndex);
        }}
        onLoadLast={() => {
          if (focusedExercise) void loadLastExercise(focusedExercise);
        }}
        onAdjustRest={(delta) => stepRest(delta)}
        onPickRestPreset={(seconds) => setRestSeconds(seconds)}
        onStartNext={() => {
          markActivity();
          stopRest();
        }}
        onMinimize={() => setMinimized(true)}
        onFinish={() => void handleFinish()}
        onCancel={() => void handleCancel()}
      />

      {/* 접어 뒀을 때 돌아갈 문 — 없으면 팝업을 다시 못 연다 */}
      {active && minimized && (
        <button
          onClick={() => setMinimized(false)}
          className="fixed inset-x-3 z-20 flex items-center justify-between rounded-card border border-accent bg-surface px-4 py-3 shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        >
          <span className="text-xs font-extrabold text-accent">
            {paused ? "⏸ 정지됨 — 무동작" : "운동 중"}
          </span>
          <span className="font-mono text-sm font-extrabold">
            {hh}:{mm}:{ss}
          </span>
          <span className="text-xs font-bold text-muted">다시 열기 ▴</span>
        </button>
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
