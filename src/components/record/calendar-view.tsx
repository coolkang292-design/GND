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
  addDaysToDateKey,
  isPlanDateAllowed,
  newPlanExercises,
} from "@/lib/domain/workout-plan";
import { formatWorkoutLog } from "@/lib/domain/workout-log";
import { getMyProfile } from "@/lib/crew";
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
import { ExercisePicker } from "./exercise-picker";

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
  routines,
  routinesLoading,
}: {
  userId: string;
  catalog: CatalogExercise[];
  /** 내 루틴 (0056) — 그 날짜의 예정표로 바로 저장할 수 있다 */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  onScheduleSession: (
    sessionId: string,
    planDate: string,
  ) => Promise<WorkoutPlan>;
  onLoadPlan: (plan: WorkoutPlan) => boolean;
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
  const [weeklyGoal, setWeeklyGoal] = useState(3);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, list, savedPlans] = await Promise.all([
          getMyProfile(userId),
          getCompletedSessions(userId),
          getWorkoutPlans(userId),
        ]);
        if (cancelled) return;
        if (profile) {
          setTimeZone(profile.timezone || timeZone);
          setWeeklyGoal(profile.weekly_goal);
        }
        setSessions(list);
        setPlans(savedPlans);
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

  // 공유용 일지 텍스트 프리페치 — iOS는 navigator.share를 사용자 제스처 안에서
  // 불러야 하므로, 시트가 열릴 때 미리 만들어 두고 클릭 시 즉시 공유한다.
  const [dayLog, setDayLog] = useState<{ date: string; text: string } | null>(
    null,
  );
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedDate || selectedSessions.length === 0) return;
      try {
        const lists = await Promise.all(
          selectedSessions.map((s) => getSessionLogExercises(s.id)),
        );
        if (!cancelled) {
          setDayLog({
            date: selectedDate,
            text: formatWorkoutLog(selectedDate, lists.flat()),
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

  const readyLogText =
    dayLog && dayLog.date === selectedDate ? dayLog.text : null;

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
      const saved = await onScheduleSession(copySource.id, copyDate);
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
      applySavedPlan(await onScheduleSession(sessionId, planPickerDate));
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
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {Math.round(summary.achievementRate * 100)}%
            </p>
            <p className="text-[11px] text-muted">달성률</p>
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
                      <p className="text-[11px] font-extrabold text-good">운동 예정</p>
                      <p className="mt-0.5 break-words text-sm font-bold">
                        {selectedPlan.exercises.map((exercise) => exercise.name).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {selectedPlan.exercises.length}종목 · 완료 전에는 통계에 포함되지 않아요
                      </p>
                    </div>
                    <button
                      onClick={handleDeletePlan}
                      disabled={planBusy}
                      className="shrink-0 text-xs font-bold text-warn disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                  {selectedDate === todayKey && (
                    <button
                      onClick={() => {
                        if (onLoadPlan(selectedPlan)) setSelectedDate(null);
                      }}
                      disabled={planBusy}
                      className="mt-3 h-10 w-full rounded-card-sm bg-good text-sm font-extrabold text-white disabled:opacity-50"
                    >
                      운동 준비하기
                    </button>
                  )}
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
                </div>
              )}
              {selectedSessions.map((s) => {
                const meta = VERIFICATION_META[s.verification];
                return (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-card border border-line bg-surface-2 p-3"
                  >
                    <span className="font-mono text-xs text-muted">
                      {timeLabel(s.completedAt, timeZone)}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">
                        {s.exerciseNames.length > 0
                          ? s.exerciseNames.join(" · ")
                          : "운동 기록"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {durationLabel(s.durationSeconds)} · {meta.glyph}{" "}
                        {meta.label}
                        {s.tabataMinutes && (
                          <span className="ml-1 font-bold text-accent">
                            · 🔥 타바타 {s.tabataMinutes}분
                          </span>
                        )}
                        {s.recordNote && (
                          <span className="ml-1 font-bold text-accent">
                            · 🏅 {s.recordNote}
                          </span>
                        )}
                      </p>
                    </div>
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
