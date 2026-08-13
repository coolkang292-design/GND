"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeDayStamps,
  sessionsInMonth,
  sessionsOnDay,
  summarizeMonth,
  type Verification,
} from "@/lib/domain/calendar";
import { dayKey } from "@/lib/domain/time";
import {
  canAttachPhotoLater,
  missingRequiredPhoto,
} from "@/lib/domain/photo-window";
import { LatePhotoButton } from "@/components/record/late-photo-button";
import {
  addDaysToDateKey,
  isPlanDateAllowed,
  newPlanExercises,
} from "@/lib/domain/workout-plan";
import {
  formatWorkoutLog,
  type LogExercise,
} from "@/lib/domain/workout-log";
import { INTERVAL_COPY } from "@/lib/domain/tabata";
import {
  buildMissedSessionProposal,
  type ProgramPlanMove,
} from "@/lib/domain/program-schedule";
import {
  cancelProgramEnrollment,
  getActiveProgramEnrollments,
  rescheduleProgramPlans,
  type ProgramEnrollment,
} from "@/lib/programs";
import { getMyProfile } from "@/lib/crew";
import { getMyWeeklyGoalDays } from "@/lib/challenge";
import { shareOrCopyText, shareResultToast } from "@/lib/share";
import type {
  BodyPart,
  CatalogExercise,
  ExerciseType,
} from "@/lib/types";
import {
  getCompletedSessions,
  getSessionLogExercises,
  type CalendarSession,
} from "@/lib/workout";
import {
  deleteWorkoutPlan,
  getWorkoutPlans,
  moveWorkoutPlan,
  saveWorkoutPlan,
  type WorkoutPlan,
} from "@/lib/workout-plan";
import type { WorkoutRoutine } from "@/lib/routines";
import { SetBreakdown } from "@/components/workout/set-breakdown";
import { ExercisePicker, type ConfiguredPick } from "./exercise-picker";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const VERIFICATION_META: Record<
  Verification,
  { glyph: string; label: string; camera: boolean }
> = {
  camera_verified: { glyph: "🔥", label: "카메라 인증", camera: true },
  photo_uploaded: { glyph: "●", label: "사진 업로드", camera: false },
  none: { glyph: "✓", label: "완료", camera: false },
};

/** 그레고리력 월 일수 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 그 달 1일의 요일 (0=일 … 6=토) */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-08-17" → "8월 17일". 날짜 키를 그대로 읽으므로 시간대에 흔들리지 않는다. */
function dateKeyLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

/** 회차 번호(1·2·3) → 프로그램 상세에서 본 기호(A·B·C) */
const PROGRAM_SESSION_KEYS = ["A", "B", "C"] as const;

/**
 * "2주차 · A". 주차나 회차가 비면 아무것도 그리지 않는다 — 등록을 지우면
 * `program_enrollment_id`만 null이 되고 메타는 남을 수 있어(0066 ON DELETE SET
 * NULL) 반쪽짜리 라벨이 나올 수 있다.
 */
function programSlotLabel(plan: {
  programWeek: number | null;
  programSession: number | null;
}): string | null {
  const key =
    plan.programSession === null
      ? undefined
      : PROGRAM_SESSION_KEYS[plan.programSession - 1];
  if (plan.programWeek === null || !key) return null;
  return `${plan.programWeek}주차 · ${key}`;
}

/** instant → tz 기준 "HH:MM" */
function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function durationLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

function totalTimeLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}

export function CalendarView({
  userId,
  catalog,
  onScheduleSession,
  onLoadPlan,
  onCreateCustom,
  photoRequired = false,
  routines,
  routinesLoading,
}: {
  userId: string;
  catalog: CatalogExercise[];
  /**
   * 참가 중인 챌린지가 인증 사진을 요구하는가 (2026-08-04).
   *
   * 사진 없는 세션이 집계에서 통째로 빠지는 것을 그 자리에서 알리는 데 쓴다.
   * 챌린지가 없거나 아직 못 불러왔으면 false — 모르면서 겁주지 않는다.
   */
  photoRequired?: boolean;
  /** 내 루틴 (0056) — 그 날짜의 예정표로 바로 저장할 수 있다 */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  onScheduleSession: (
    sessionId: string,
    planDate: string,
    /** 타바타 세션이면 코스 분수 — 예정표도 타바타로 남는다 (0059) */
    tabataMinutes?: number | null,
  ) => Promise<WorkoutPlan>;
  /**
   * 예정표를 오늘 운동으로 가져온다.
   *
   * `startNow`면 **불러오기와 시작을 한 번에** 한다 (사용자 지시 2026-08-12).
   * 계획은 종목·세트·반복·휴식을 이미 들고 있어 "준비"할 내용물이 없었다 —
   * 이미 정한 것을 한 번 더 묻는 단계였다.
   */
  onLoadPlan: (
    plan: WorkoutPlan,
    options?: { startNow?: boolean },
  ) => boolean | Promise<boolean>;
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) => Promise<CatalogExercise | null>;
}) {
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
  );
  // ⚠️ 기본 숫자를 넣지 마라 — 주간 기준은 진행 중 챌린지에서 온다(2026-08-08).
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const todayKey = useMemo(() => dayKey(new Date(), timeZone), [timeZone]);
  const [view, setView] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return { year: y, month: m };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [copySource, setCopySource] = useState<CalendarSession | null>(null);
  const [copyDate, setCopyDate] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planToast, setPlanToast] = useState<string | null>(null);
  const [planPickerDate, setPlanPickerDate] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  /**
   * 재배치 **미리보기**. null이면 아직 아무것도 계산하지 않았다는 뜻이다.
   *
   * ⚠️ 이 상태가 차 있다고 DB가 바뀐 것이 아니다. `buildMissedSessionProposal()`은
   *    순수 함수라 여기까지는 읽기뿐이고, 실제 이동은 사용자가 확인을 누른 뒤
   *    `rescheduleProgramPlans()` 한 번으로만 나간다.
   *
   * 어느 날짜에서 만든 제안인지 같이 들고 다닌다. 날짜를 옮겨 다닐 때 effect로
   * 지우면 렌더가 한 번 더 도는데(react-hooks/set-state-in-effect), 여기서는
   * 그냥 **다른 날짜면 없는 것으로 읽으면** 된다.
   */
  const [proposal, setProposal] = useState<{
    date: string;
    moves: ProgramPlanMove[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, list, savedPlans, goalDays, activePrograms] =
          await Promise.all([
            getMyProfile(userId),
            getCompletedSessions(userId),
            getWorkoutPlans(userId),
            // ⚠️ `profile.weekly_goal`이 아니다 — 홈과 같은 원천을 써야 두 화면의
            //    달성률이 갈라지지 않는다(2026-08-08).
            getMyWeeklyGoalDays(userId).catch(() => null),
            // 재배치 제안에 필요한 요일·시간 슬롯이 여기 있다. 실패해도 달력
            // 나머지는 그려야 하므로 삼키고 빈 목록으로 둔다 — 그 경우 프로그램
            // 계획은 보이되 '다시 잡기'만 막힌다.
            getActiveProgramEnrollments(userId).catch(() => []),
          ]);
        if (cancelled) return;
        if (profile) {
          setTimeZone(profile.timezone || timeZone);
        }
        setWeeklyGoal(goalDays);
        setSessions(list);
        setPlans(savedPlans);
        setEnrollments(activePrograms);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // timeZone 초기값은 fetch 내부에서 갱신 — 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const summary = useMemo(
    () => summarizeMonth(sessions, timeZone, view.year, view.month, weeklyGoal),
    [sessions, timeZone, view, weeklyGoal],
  );

  const stampByDate = useMemo(() => {
    const monthSessions = sessionsInMonth(
      sessions,
      timeZone,
      view.year,
      view.month,
    );
    const map = new Map<string, ReturnType<typeof computeDayStamps>[number]>();
    for (const s of computeDayStamps(monthSessions, timeZone)) {
      map.set(s.dateKey, s);
    }
    return map;
  }, [sessions, timeZone, view]);

  const planByDate = useMemo(
    () => new Map(plans.map((plan) => [plan.planDate, plan])),
    [plans],
  );

  const selectedSessions = useMemo(
    () =>
      selectedDate ? sessionsOnDay(sessions, timeZone, selectedDate) : [],
    [selectedDate, sessions, timeZone],
  );
  const selectedPlan = selectedDate ? planByDate.get(selectedDate) : undefined;

  // ── 공식 프로그램 계획 (0066·0067) ──────────────────────────
  //
  // 완료한 계획 행은 운동을 마칠 때 지워진다(`deleteWorkoutPlan`). 그래서 **남아
  // 있는** 지난 회차는 대부분 놓친 것이다. 다만 지우기가 실패했거나 사용자가
  // 다시 만든 경우가 있으므로, 그날 완료 세션이 있으면 놓친 것으로 세지 않는다.
  // DB만으로는 '완료 삭제'와 '수동 삭제'를 구분할 수 없다는 한계(0066)를
  // 화면에서 이렇게 좁힌다.
  const completedDateKeys = useMemo(
    () => new Set(sessions.map((s) => dayKey(s.completedAt, timeZone))),
    [sessions, timeZone],
  );

  const selectedEnrollment = useMemo(
    () =>
      selectedPlan?.programEnrollmentId
        ? (enrollments.find(
            (item) => item.id === selectedPlan.programEnrollmentId,
          ) ?? null)
        : null,
    [selectedPlan, enrollments],
  );

  const selectedPlanMissed = Boolean(
    selectedPlan?.programEnrollmentId &&
      selectedPlan.planDate < todayKey &&
      !completedDateKeys.has(selectedPlan.planDate),
  );

  /** 지금 열린 날짜에서 만든 제안만 보여준다 — 앞 날짜 것이 따라다니지 않게 */
  const activeProposal =
    proposal && selectedDate && proposal.date === selectedDate
      ? proposal.moves
      : null;

  /** 제안을 만든다 — **읽기만 한다.** 실제 이동은 확인 뒤 한 번뿐이다. */
  function openRescheduleProposal() {
    if (!selectedDate || !selectedPlan?.programEnrollmentId || !selectedEnrollment)
      return;
    const enrollmentId = selectedPlan.programEnrollmentId;
    const mine = plans.filter(
      (plan) => plan.programEnrollmentId === enrollmentId,
    );
    // 다른 프로그램·일반 계획이 있는 날은 비켜 간다 — 덮어쓰거나 지우지 않는다.
    const occupiedDates = new Set(
      plans
        .filter((plan) => plan.programEnrollmentId !== enrollmentId)
        .map((plan) => plan.planDate),
    );
    try {
      setProposal({
        date: selectedDate,
        moves: buildMissedSessionProposal({
          plans: mine.map((plan) => ({
            id: plan.id,
            date: plan.planDate,
            completed: completedDateKeys.has(plan.planDate),
          })),
          todayKey,
          preferredSlots: selectedEnrollment.preferredSlots,
          timeZone: selectedEnrollment.timeZone || timeZone,
          occupiedDates,
        }),
      });
    } catch {
      setProposal({ date: selectedDate, moves: [] });
      showPlanToast("일정을 다시 계산하지 못했어요");
    }
  }

  async function handleReschedule() {
    if (
      !selectedPlan?.programEnrollmentId ||
      !activeProposal ||
      activeProposal.length === 0
    ) {
      return;
    }
    const moves = activeProposal;
    const enrollmentId = selectedPlan.programEnrollmentId;
    setPlanBusy(true);
    try {
      await rescheduleProgramPlans({ enrollmentId, moves });
      const movedById = new Map(
        moves.map((move) => [move.planId, move] as const),
      );
      setPlans((current) =>
        current.map((plan) => {
          const move = movedById.get(plan.id);
          return move
            ? {
                ...plan,
                planDate: move.suggestedDate,
                scheduledAt: move.scheduledAt,
              }
            : plan;
        }),
      );
      setProposal(null);
      setSelectedDate(null);
      showPlanToast("남은 일정을 다시 잡았어요");
    } catch (error) {
      // 이미 지워진 계획을 옮기려 하면 RPC가 plan_not_found로 막는다. 0066은
      // '완료로 지움'과 '사용자가 지움'을 구분하지 못하므로, 지어내지 말고
      // 그대로 알리고 다시 열어 보게 한다.
      const message = error instanceof Error ? error.message : "";
      showPlanToast(
        message.includes("plan_not_found")
          ? "일정이 그새 바뀌었어요. 달력을 다시 열어 주세요"
          : "남은 일정을 다시 잡지 못했어요",
      );
      setProposal(null);
    } finally {
      setPlanBusy(false);
    }
  }

  // 공유용 일지 텍스트 프리페치 — iOS는 navigator.share를 사용자 제스처 안에서
  // 불러야 하므로, 시트가 열릴 때 미리 만들어 두고 클릭 시 즉시 공유한다.
  //
  // 같은 조회 결과를 **세션별로도 보관한다** (2026-08-04). 상세보기가 쓰는 데이터가
  // 공유 텍스트의 재료와 같은 것이라 새 질의가 필요 없다. flat()으로 접어 버리면
  // 어느 세션의 세트인지가 사라져서 상세를 그릴 수 없다.
  const [dayLog, setDayLog] = useState<{
    date: string;
    text: string;
    bySession: Record<string, LogExercise[]>;
  } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  /** 상세를 펼친 세션. 하루에 여러 세션이 있어도 한 번에 하나만 펼친다 */
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedDate || selectedSessions.length === 0) return;
      try {
        const lists = await Promise.all(
          selectedSessions.map((s) => getSessionLogExercises(s.id)),
        );
        if (!cancelled) {
          const bySession: Record<string, LogExercise[]> = {};
          selectedSessions.forEach((session, index) => {
            bySession[session.id] = lists[index] ?? [];
          });
          setDayLog({
            date: selectedDate,
            text: formatWorkoutLog(selectedDate, lists.flat()),
            bySession,
          });
        }
      } catch {
        // 조회 실패 시 버튼이 비활성으로 남는다 — 재시도는 시트 재오픈으로
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedSessions]);

  const dayLogIsCurrent = dayLog !== null && dayLog.date === selectedDate;
  const readyLogText = dayLogIsCurrent ? dayLog.text : null;

  async function handleShareDay() {
    if (!readyLogText) return;
    const msg = shareResultToast(await shareOrCopyText(readyLogText));
    if (msg) {
      setShareToast(msg);
      setTimeout(() => setShareToast(null), 2500);
    }
  }

  function showPlanToast(message: string) {
    setPlanToast(message);
    setTimeout(() => setPlanToast(null), 2500);
  }

  function openDate(date: string) {
    setSelectedDate(date);
    setMoveDate(date);
    // 다른 날을 열면 접어 둔다 — 안 그러면 새 날짜의 시트가 펼쳐진 채로 뜬다
    setExpandedSessionId(null);
  }

  async function handleSaveCopy() {
    if (!copySource || !isPlanDateAllowed(copyDate, todayKey)) return;
    const existing = planByDate.get(copyDate);
    if (
      existing &&
      !window.confirm("이 날짜의 기존 예정표를 새 운동으로 교체할까요?")
    ) {
      return;
    }
    setPlanBusy(true);
    try {
      const saved = await onScheduleSession(
        copySource.id,
        copyDate,
        copySource.tabataMinutes,
      );
      setPlans((current) => [
        ...current.filter((plan) => plan.planDate !== saved.planDate),
        saved,
      ]);
      setCopySource(null);
    } catch {
      // 상위 화면 토스트에 상세 오류가 표시된다.
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleMovePlan() {
    if (!selectedPlan || !isPlanDateAllowed(moveDate, todayKey)) return;
    if (moveDate === selectedPlan.planDate) return;
    const existing = planByDate.get(moveDate);
    const replace = Boolean(existing && existing.id !== selectedPlan.id);
    if (replace && !window.confirm("이 날짜의 기존 예정표를 교체할까요?")) {
      return;
    }
    setPlanBusy(true);
    try {
      const moved = await moveWorkoutPlan(selectedPlan.id, moveDate, replace);
      setPlans((current) => [
        ...current.filter(
          (plan) => plan.id !== moved.id && plan.planDate !== moved.planDate,
        ),
        moved,
      ]);
      setSelectedDate(moveDate);
      showPlanToast("예정 날짜를 옮겼어요");
    } catch {
      showPlanToast("예정 날짜를 옮기지 못했어요");
    } finally {
      setPlanBusy(false);
    }
  }

  /**
   * 프로그램을 통째로 그만둔다 (사용자 지적 2026-08-12).
   *
   * `삭제`는 **이 회차 하나만** 지운다. 그만두려는 사람에게 그 버튼만 있으면
   * 18번 눌러야 한다 — 프로그램을 보는 곳에서 프로그램을 끝낼 수 있어야 한다.
   *
   * ⚠️ 지우는 것은 **달력에 남은 회차**뿐이다. 완료한 운동은 마칠 때 계획 행이
   *    이미 지워져서 여기 없고, 기록은 `workout_sessions`에 그대로 남는다.
   */
  async function handleQuitProgram() {
    const enrollmentId = selectedPlan?.programEnrollmentId;
    if (!enrollmentId || planBusy) return;
    const title = selectedEnrollment?.title ?? "이 프로그램";
    const remaining = plans.filter(
      (plan) => plan.programEnrollmentId === enrollmentId,
    ).length;
    if (
      !window.confirm(
        `${title}을(를) 그만둘까요?\n달력에 남은 ${remaining}회가 사라져요. 이미 완료한 운동 기록은 그대로 남습니다.`,
      )
    ) {
      return;
    }
    setPlanBusy(true);
    try {
      const removed = await cancelProgramEnrollment(enrollmentId);
      setPlans((current) =>
        current.filter((plan) => plan.programEnrollmentId !== enrollmentId),
      );
      setEnrollments((current) =>
        current.filter((item) => item.id !== enrollmentId),
      );
      setSelectedDate(null);
      showPlanToast(`프로그램을 그만뒀어요 · ${removed}회 삭제`);
    } catch (error) {
      console.error("[program] 그만두기 실패", error);
      showPlanToast("그만두지 못했어요");
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleDeletePlan() {
    if (!selectedPlan || !window.confirm("이 운동 예정표를 삭제할까요?")) return;
    setPlanBusy(true);
    try {
      await deleteWorkoutPlan(selectedPlan.id);
      setPlans((current) => current.filter((plan) => plan.id !== selectedPlan.id));
      if (selectedSessions.length === 0) setSelectedDate(null);
      showPlanToast("예정표를 삭제했어요");
    } catch {
      showPlanToast("예정표를 삭제하지 못했어요");
    } finally {
      setPlanBusy(false);
    }
  }

  function applySavedPlan(saved: WorkoutPlan) {
    setPlans((current) => [
      ...current.filter((plan) => plan.planDate !== saved.planDate),
      saved,
    ]);
    setPlanPickerDate(null);
    showPlanToast("운동 계획을 저장했어요");
  }

  async function handleNewPlanPick(items: CatalogExercise[]) {
    if (!planPickerDate || items.length === 0 || planBusy) return;
    setPlanBusy(true);
    try {
      applySavedPlan(
        await saveWorkoutPlan({
          userId,
          planDate: planPickerDate,
          sourceSessionId: null,
          exercises: newPlanExercises(items),
        }),
      );
    } catch {
      showPlanToast("운동 계획을 저장하지 못했어요");
    } finally {
      setPlanBusy(false);
    }
  }

  /**
   * 추천 경로로 고른 것을 그 날짜의 예정표로 저장 (2026-08-06).
   *
   * `handleNewPlanPick`과 갈라 두는 이유는 세트다. 저쪽은 `newPlanExercises`가
   * 0값 세트 1개를 만들지만, 여기는 사용자가 **설정 화면에서 정한 세트**를
   * 그대로 예정표에 넣는다 — 정해 놓고 사라지면 그 화면이 무의미해진다.
   */
  async function handleNewPlanConfigured(picks: ConfiguredPick[]) {
    if (!planPickerDate || picks.length === 0 || planBusy) return;
    setPlanBusy(true);
    try {
      applySavedPlan(
        await saveWorkoutPlan({
          userId,
          planDate: planPickerDate,
          sourceSessionId: null,
          exercises: picks.map(({ item, sets }) => ({
            name: item.name,
            bodyPart: item.body_part,
            exerciseType: item.exercise_type,
            measure: item.measure,
            isCustom: item.is_custom,
            sets: sets.map((set) => ({
              weightKg: set.weightKg,
              reps: set.reps,
              distanceKm: set.distanceKm,
              durationMin: set.durationMin,
            })),
          })),
        }),
      );
    } catch {
      showPlanToast("운동 계획을 저장하지 못했어요");
    } finally {
      setPlanBusy(false);
    }
  }

  /** 내 루틴을 그 날짜의 예정표로 저장 (0056). 원본 세션이 없으므로 sourceSessionId는 null. */
  async function handleNewPlanFromRoutine(
    routine: WorkoutRoutine,
  ): Promise<boolean> {
    if (!planPickerDate || planBusy) return false;
    setPlanBusy(true);
    try {
      applySavedPlan(
        await saveWorkoutPlan({
          userId,
          planDate: planPickerDate,
          sourceSessionId: null,
          exercises: routine.exercises,
        }),
      );
      return true;
    } catch {
      showPlanToast("운동 계획을 저장하지 못했어요");
      return false;
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleNewPlanFromPast(sessionId: string): Promise<boolean> {
    if (!planPickerDate || planBusy) return false;
    setPlanBusy(true);
    try {
      const source = sessions.find((s) => s.id === sessionId);
      applySavedPlan(
        await onScheduleSession(
          sessionId,
          planPickerDate,
          source?.tabataMinutes,
        ),
      );
      return true;
    } catch {
      showPlanToast("운동 계획을 저장하지 못했어요");
      return false;
    } finally {
      setPlanBusy(false);
    }
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const idx = (v.year * 12 + (v.month - 1)) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }

  function goToday() {
    const [y, m] = todayKey.split("-").map(Number);
    setView({ year: y, month: m });
  }

  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (loadError) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        달력 데이터를 불러오지 못했어요. 다시 시도해 주세요.
      </p>
    );
  }

  const offset = firstWeekday(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-3.5 pb-24">
      {/* 월간 요약 */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold">
            {view.year}년 {view.month}월
          </h3>
          <div className="flex items-center gap-1 text-muted">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold"
            >
              오늘
            </button>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {summary.sessionCount}회
            </p>
            <p className="text-[11px] text-muted">이번 달 운동</p>
          </div>
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {totalTimeLabel(summary.totalDurationSeconds)}
            </p>
            <p className="text-[11px] text-muted">총 운동시간</p>
          </div>
          {/* ⚠️ `achievementRate ?? 0`으로 뭉개지 마라. 목표를 안 정한 사람에게
              `0%`를 보여주면 실패한 것처럼 읽힌다 (2026-08-08). */}
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {summary.achievementRate === null
                ? "—"
                : `${Math.round(summary.achievementRate * 100)}%`}
            </p>
            <p className="text-[11px] text-muted">
              {summary.achievementRate === null ? "목표 미설정" : "달성률"}
            </p>
          </div>
        </div>
      </section>

      {/* 달력 그리드 */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-0.5 text-center text-[10.5px] font-bold text-faint"
            >
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} className="aspect-square" />;
            const dateKey = `${view.year}-${pad(view.month)}-${pad(day)}`;
            const stamp = stampByDate.get(dateKey);
            const plan = planByDate.get(dateKey);
            const meta = stamp ? VERIFICATION_META[stamp.verification] : null;
            const isToday = dateKey === todayKey;
            /**
             * 빈 날짜도 **오늘 이후면 열린다** (2026-08-02).
             *
             * 전에는 `disabled={!stamp && !plan}`이라 빈 셀이 전부 잠겨 있었다.
             * 계획은 0015 RLS상 `plan_date >= 오늘`만 허용되고 미래에는 기록도
             * 계획도 없으니 **모든 미래 셀이 잠긴 상태**였고, "새 운동 계획
             * 만들기"는 오늘 이미 운동을 완료한 경우에만 도달할 수 있었다.
             *
             * 과거의 빈 날짜는 계속 잠근다 — 보여줄 기록도 없고 계획도 못 세운다.
             * 눌리는데 아무 일도 안 일어나는 편이 더 나쁘다.
             */
            const canPlan = isPlanDateAllowed(dateKey, todayKey);
            const openable = Boolean(stamp) || Boolean(plan) || canPlan;
            return (
              <button
                key={dateKey}
                aria-label={`${view.month}월 ${day}일`}
                onClick={() => openable && openDate(dateKey)}
                disabled={!openable}
                className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[11px] border text-xs ${
                  meta?.camera
                    ? "border-accent/35 bg-accent-weak"
                    : plan
                      ? "border-good/40 bg-good-weak"
                      : openable
                        ? "border-dashed border-line bg-surface"
                        : "border-line bg-surface"
                } ${isToday ? "outline outline-2 outline-accent outline-offset-1" : ""} ${
                  openable ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`font-mono text-[11px] ${meta?.camera ? "text-accent" : "text-muted"}`}
                >
                  {day}
                </span>
                {meta && <span className="text-[15px] leading-none">{meta.glyph}</span>}
                {plan && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none font-extrabold text-good">
                    예정
                  </span>
                )}
                {stamp && stamp.count > 1 && (
                  <span className="absolute right-0.5 top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent px-0.5 font-mono text-[9px] font-extrabold text-accent-ink">
                    {stamp.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="mt-3.5 flex flex-wrap gap-2.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded border border-accent bg-accent-weak" />
            카메라 인증
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded border border-line bg-surface-2" />
            사진 업로드
          </span>
          <span className="inline-flex items-center gap-1">✓ 사진 없음</span>
          <span className="inline-flex items-center gap-1 font-bold text-good">
            예정
          </span>
        </div>
      </section>

      {sessions.length === 0 && plans.length === 0 && (
        <p className="text-center text-xs text-muted">
          아직 완료한 운동이 없어요. 첫 운동을 기록하면 스탬프가 찍혀요 💪
        </p>
      )}

      {/* 날짜 상세 시트 */}
      {selectedDate && (
        <>
          <button
            aria-label="닫기"
            onClick={() => setSelectedDate(null)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[20px] border-t border-line bg-surface p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {Number(selectedDate.slice(5, 7))}월{" "}
                {Number(selectedDate.slice(8, 10))}일
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-xs font-bold text-faint"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {!selectedPlan && selectedSessions.length === 0 && (
                <p className="text-[12.5px] text-muted">
                  아직 이 날의 계획이 없어요. 종목을 담아 두면 그날 바로 시작할 수
                  있어요.
                </p>
              )}
              {!selectedPlan && isPlanDateAllowed(selectedDate, todayKey) && (
                <button
                  onClick={() => {
                    setPlanPickerDate(selectedDate);
                    setSelectedDate(null);
                  }}
                  className="h-11 w-full rounded-card border border-accent bg-surface text-sm font-extrabold text-accent"
                >
                  ➕ 새 운동 계획 만들기
                </button>
              )}
              {selectedPlan && (
                <div className="rounded-card border border-good/40 bg-good-weak p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-good">
                        {selectedPlan.programEnrollmentId
                          ? "📋 프로그램 예정"
                          : selectedPlan.tabataMinutes
                            ? `🔥 ${INTERVAL_COPY.session(selectedPlan.tabataMinutes)} 예정`
                            : "운동 예정"}
                      </p>
                      {selectedPlan.programEnrollmentId && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          {selectedPlan.title && (
                            <span className="text-[12.5px] font-extrabold">
                              {selectedPlan.title}
                            </span>
                          )}
                          {programSlotLabel(selectedPlan) && (
                            <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-bold text-muted">
                              {programSlotLabel(selectedPlan)}
                            </span>
                          )}
                          {/* `--warn-weak` 토큰은 없다. 배지 하나 때문에 팔레트를
                              늘리지 않고 기존 --warn을 옅게 깐다 */}
                          {selectedPlanMissed && (
                            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-extrabold text-warn">
                              놓친 운동
                            </span>
                          )}
                        </div>
                      )}
                      <p className="mt-0.5 break-words text-sm font-bold">
                        {selectedPlan.exercises.map((exercise) => exercise.name).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {selectedPlan.exercises.length}종목 · 완료 전에는 통계에 포함되지 않아요
                      </p>
                    </div>
                    {/*
                      두 삭제의 범위를 라벨로 가른다 — `이 회차만`과
                      `프로그램 그만두기`. 그냥 `삭제` 하나만 두면 프로그램을
                      끝내려는 사람이 18번 눌러야 한다 (사용자 지적 2026-08-12).
                    */}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <button
                        onClick={handleDeletePlan}
                        disabled={planBusy}
                        className="text-xs font-bold text-warn disabled:opacity-50"
                      >
                        {selectedPlan.programEnrollmentId ? "이 회차만 삭제" : "삭제"}
                      </button>
                      {selectedPlan.programEnrollmentId && (
                        <button
                          onClick={handleQuitProgram}
                          disabled={planBusy}
                          className="text-[11px] font-bold text-muted underline decoration-line underline-offset-4 disabled:opacity-50"
                        >
                          프로그램 그만두기
                        </button>
                      )}
                    </div>
                  </div>
                  {/*
                    계획 상세 (2026-08-04) — 세트·수량은 `workout_plans.exercises`
                    jsonb에 이미 있다. 새 조회 없이 편다. 계획에는 완료 여부가
                    없으므로 SetBreakdown이 완료 표시를 그리지 않는다.
                  */}
                  <div className="mt-2.5">
                    <SetBreakdown exercises={selectedPlan.exercises} />
                  </div>
                  {/*
                    계획이 있으면 **한 번에 시작한다** (사용자 지시 2026-08-13).

                    인터벌도 마찬가지다. 예전에는 시트에서 종목과 코스를 다시
                    확인해야 해서 '준비하기'로 남겨 뒀는데, 계획이 이미 그 둘을
                    들고 있다. 한 번 더 묻는 것은 확인이 아니라 단계다.
                  */}
                  {selectedDate === todayKey && (
                    <button
                      onClick={() => {
                        void (async () => {
                          const started = await onLoadPlan(selectedPlan, {
                            startNow: true,
                          });
                          if (started) setSelectedDate(null);
                        })();
                      }}
                      disabled={planBusy}
                      className="mt-3 h-10 w-full rounded-card-sm bg-good text-sm font-extrabold text-white disabled:opacity-50"
                    >
                      {selectedPlan.tabataMinutes
                        ? "🔥 전신 인터벌 시작하기"
                        : "운동 시작하기"}
                    </button>
                  )}
                  {/*
                    프로그램 계획은 **한 장씩 옮기지 않는다** (계획 2026-08-12).
                    18회는 최소 2일 회복 간격으로 짜인 한 덩어리라, 한 장만 밀면
                    나머지와 간격이 깨진다. 남은 회차를 통째로 다시 잡는다.
                  */}
                  {selectedPlan.programEnrollmentId && selectedPlanMissed ? (
                    <div className="mt-2">
                      {activeProposal === null ? (
                        <button
                          onClick={openRescheduleProposal}
                          disabled={planBusy || !selectedEnrollment}
                          className="h-10 w-full rounded-card-sm border border-line bg-surface px-3 text-xs font-bold text-accent disabled:opacity-40"
                        >
                          남은 일정 다시 잡기
                        </button>
                      ) : activeProposal.length === 0 ? (
                        <div className="rounded-card-sm border border-line bg-surface p-2.5">
                          <p className="text-[11.5px] text-muted">
                            지금은 옮길 회차가 없어요.
                          </p>
                          <button
                            onClick={() => setProposal(null)}
                            className="mt-2 h-9 w-full rounded-card-sm border border-line text-xs font-bold text-muted"
                          >
                            닫기
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-card-sm border border-accent/40 bg-surface p-2.5">
                          <p className="text-[11.5px] font-extrabold">
                            이렇게 옮길게요 · {activeProposal.length}회차
                          </p>
                          <ul className="mt-1.5 flex flex-col gap-0.5">
                            {activeProposal.map((move) => (
                              <li
                                key={move.planId}
                                className="text-[11.5px] text-muted"
                              >
                                {dateKeyLabel(move.fromDate)} →{" "}
                                <span className="font-bold text-accent">
                                  {dateKeyLabel(move.suggestedDate)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-1.5 text-[10.5px] text-faint">
                            이미 마친 회차와 다른 예정표는 그대로 둬요.
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => setProposal(null)}
                              disabled={planBusy}
                              className="h-9 flex-1 rounded-card-sm border border-line text-xs font-bold text-muted disabled:opacity-40"
                            >
                              취소
                            </button>
                            <button
                              onClick={handleReschedule}
                              disabled={planBusy}
                              className="h-9 flex-1 rounded-card-sm bg-accent text-xs font-extrabold text-white disabled:opacity-40"
                            >
                              이대로 옮기기
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : !selectedPlan.programEnrollmentId ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="date"
                        min={todayKey}
                        value={moveDate}
                        onChange={(event) => setMoveDate(event.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-card-sm border border-line bg-surface px-2 text-xs"
                      />
                      <button
                        onClick={handleMovePlan}
                        disabled={
                          planBusy ||
                          moveDate === selectedPlan.planDate ||
                          !isPlanDateAllowed(moveDate, todayKey)
                        }
                        className="h-10 shrink-0 rounded-card-sm border border-line bg-surface px-3 text-xs font-bold text-accent disabled:opacity-40"
                      >
                        날짜 이동
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              {selectedSessions.map((s) => {
                const meta = VERIFICATION_META[s.verification];
                const time = timeLabel(s.completedAt, timeZone);
                const expanded = expandedSessionId === s.id;
                const detail = dayLogIsCurrent
                  ? dayLog.bySession[s.id]
                  : undefined;
                return (
                  <div
                    key={s.id}
                    className="rounded-card border border-line bg-surface-2 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-muted">
                        {time}
                      </span>
                      {/*
                        요약 줄 자체가 상세 토글이다 (2026-08-04). 복사 버튼과
                        같은 자리에 두면 버튼 안에 버튼이 되므로 형제로 나눈다.
                      */}
                      <button
                        type="button"
                        aria-label={`${time} 운동 상세`}
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedSessionId(expanded ? null : s.id)
                        }
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-sm font-bold">
                          {s.exerciseNames.length > 0
                            ? s.exerciseNames.join(" · ")
                            : "운동 기록"}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-muted">
                          {durationLabel(s.durationSeconds)} · {meta.glyph}{" "}
                          {meta.label}
                          {s.tabataMinutes && (
                            <span className="ml-1 font-bold text-accent">
                              · 🔥 전신 인터벌 {s.tabataMinutes}분
                            </span>
                          )}
                          {s.recordNote && (
                            <span className="ml-1 font-bold text-accent">
                              · 🏅 {s.recordNote}
                            </span>
                          )}
                          <span className="ml-1 font-bold text-accent">
                            {expanded ? "· 접기 ▲" : "· 상세 ▼"}
                          </span>
                        </span>
                      </button>
                      {s.exerciseNames.length > 0 && (
                        <button
                          onClick={() => {
                            setSelectedDate(null);
                            setCopySource(s);
                            setCopyDate(addDaysToDateKey(todayKey, 1));
                          }}
                          className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-accent"
                        >
                          📋 복사
                        </button>
                      )}
                    </div>
                    {/*
                      왜 이 운동이 챌린지에 안 잡히는지 그 자리에서 말한다
                      (2026-08-04). 재기록 동기를 없애는 것이 목적이다 —
                      신고 4805090f는 사진을 붙이려 같은 운동을 다시 기록했다.
                    */}
                    {missingRequiredPhoto({
                      hasPhoto: s.verification !== "none",
                      photoRequired,
                    }) && (
                      <p className="mt-2 rounded-card-sm border border-warn/40 bg-surface px-2.5 py-1.5 text-[11px] font-bold text-warn">
                        ⚠️ 사진이 없어 <b>챌린지 성과에 안 잡혀요.</b> 이 챌린지는
                        인증 사진이 필수예요.
                      </p>
                    )}
                    {canAttachPhotoLater({
                      completedAt: s.completedAt,
                      now: new Date(),
                      timeZone,
                      hasPhoto: s.verification !== "none",
                    }) && (
                      <LatePhotoButton
                        userId={userId}
                        sessionId={s.id}
                        onDone={(verification) =>
                          setSessions((current) =>
                            current.map((item) =>
                              item.id === s.id
                                ? { ...item, verification }
                                : item,
                            ),
                          )
                        }
                        onToast={setShareToast}
                      />
                    )}
                    {expanded && (
                      <div className="mt-2.5">
                        {detail ? (
                          <SetBreakdown exercises={detail} />
                        ) : (
                          <p className="text-[12.5px] text-muted">
                            세트 기록을 불러오는 중…
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedSessions.length > 0 && (
              <button
                onClick={handleShareDay}
                disabled={!readyLogText}
                className="mt-3 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
              >
                📤 AI 코치에게 공유
              </button>
            )}
            {selectedSessions.length > 0 && (
              <p className="mt-2.5 text-left text-[11px] text-muted">
                📋 복사는 종목·세트를 선택한 날짜의 예정표로 저장해요. 📤 공유는
                세트별 기록을 텍스트로 내보내요.
              </p>
            )}
          </div>
          {shareToast && (
            <div
              className="fixed inset-x-8 z-[60] rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
            >
              {shareToast}
            </div>
          )}
        </>
      )}

      {copySource && (
        <>
          <button
            aria-label="복사 취소"
            onClick={() => setCopySource(null)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-line bg-surface p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <h3 className="text-base font-extrabold">운동 예정표로 복사</h3>
            <p className="mt-1 break-words text-xs text-muted">
              {copySource.exerciseNames.join(" · ")}
            </p>
            <label className="mt-4 block text-[11px] font-bold text-muted">
              운동할 날짜
            </label>
            <input
              type="date"
              min={todayKey}
              value={copyDate}
              onChange={(event) => setCopyDate(event.target.value)}
              className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold"
            />
            {planByDate.has(copyDate) && (
              <p className="mt-2 text-[11px] font-bold text-warn">
                이 날짜에는 이미 예정표가 있어요. 저장할 때 교체 확인을 받습니다.
              </p>
            )}
            <button
              onClick={handleSaveCopy}
              disabled={planBusy || !isPlanDateAllowed(copyDate, todayKey)}
              className="mt-4 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {planBusy ? "저장 중…" : "예정표로 저장"}
            </button>
          </div>
        </>
      )}

      {/* 새 운동 계획 피커 — 기록 탭과 같은 피커 재사용 (설계 2026-07-19) */}
      <ExercisePicker
        open={planPickerDate !== null}
        catalog={catalog}
        pastSessions={sessions}
        pastLoading={false}
        onClose={() => setPlanPickerDate(null)}
        onPickMany={(items) => void handleNewPlanPick(items)}
        onPickConfigured={(picks) => void handleNewPlanConfigured(picks)}
        onPickPast={handleNewPlanFromPast}
        onCreateCustom={onCreateCustom}
        routines={routines}
        routinesLoading={routinesLoading}
        onPickRoutine={routines ? handleNewPlanFromRoutine : undefined}
      />

      {planToast && (
        <div
          className="fixed inset-x-8 z-[60] rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
        >
          {planToast}
        </div>
      )}
    </div>
  );
}
