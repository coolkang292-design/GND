"use client";

import { useMemo, useState } from "react";
import type { StrengthProgram } from "@/lib/domain/official-programs";
import { programSaveErrorText } from "@/lib/domain/program-error-text";
import {
  buildProgramSchedule,
  type PreferredSlot,
} from "@/lib/domain/program-schedule";
import { addDaysToDateKey } from "@/lib/domain/workout-plan";
import type {
  CreateProgramEnrollmentInput,
  ResolvedProgramSession,
} from "@/lib/programs";
import type { WorkoutPlan } from "@/lib/workout-plan";

type ScheduleStep = "start" | "slots" | "preview";
type TimeMode = "same" | "per-day";

type ProgramScheduleSetupProps = {
  today: string;
  timeZone: string;
  /** 아직 근력 전용 — 인터벌 등록은 2단계(0070)에서 붙인다 */
  program: StrengthProgram;
  resolvedSessions: readonly ResolvedProgramSession[];
  occupiedPlans: readonly WorkoutPlan[];
  onConfirm: (input: CreateProgramEnrollmentInput) => Promise<void>;
};

const WEEKDAYS = [
  { value: 0, short: "일", label: "일요일" },
  { value: 1, short: "월", label: "월요일" },
  { value: 2, short: "화", label: "화요일" },
  { value: 3, short: "수", label: "수요일" },
  { value: 4, short: "목", label: "목요일" },
  { value: 5, short: "금", label: "금요일" },
  { value: 6, short: "토", label: "토요일" },
] as const;

const PRESETS = {
  "월 · 수 · 금": [1, 3, 5],
  "화 · 목 · 토": [2, 4, 6],
} as const;

const STEP_ORDER: readonly ScheduleStep[] = ["start", "slots", "preview"];
const STEP_LABEL: Record<ScheduleStep, string> = {
  start: "시작일",
  slots: "요일·시간",
  preview: "미리보기",
};

function sameDays(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort((a, b) => a - b).every((day, index) => day === [...right].sort((a, b) => a - b)[index])
  );
}

function ScheduleProgress({ step }: { step: ScheduleStep }) {
  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <ol aria-label="일정 등록 진행" className="mb-6 grid grid-cols-3 gap-2">
      {STEP_ORDER.map((item, index) => {
        const active = index === currentIndex;
        const complete = index < currentIndex;
        return (
          <li
            key={item}
            aria-current={active ? "step" : undefined}
            className={`border-t-2 pt-2 ${active || complete ? "border-accent" : "border-line"}`}
          >
            <span className={`block text-[10px] font-extrabold ${active ? "text-accent" : complete ? "text-text" : "text-muted"}`}>
              {index + 1}. {STEP_LABEL[item]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function startOfWeek(dateKey: string): string {
  const weekday = weekdayOf(dateKey);
  return addDaysToDateKey(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

function dateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find((item) => item.value === weekday)?.short ?? "";
}

/**
 * 고른 요일이 주 3회 조건을 만족하는가.
 *
 * 요일 사이 간격 제한은 없앴다 (사용자 확정 2026-08-12) — 금·토·일처럼 몰아서
 * 하는 사람을 막고 있었다. **서로 다른 요일 3개**라는 조건만 남는다.
 */
function hasThreeDistinctDays(days: readonly number[]): boolean {
  return days.length === 3 && new Set(days).size === 3;
}

export function ProgramScheduleSetup({
  today,
  timeZone,
  program,
  resolvedSessions,
  occupiedPlans,
  onConfirm,
}: ProgramScheduleSetupProps) {
  const nextMonday = addDaysToDateKey(startOfWeek(today), 7);
  const [step, setStep] = useState<ScheduleStep>("start");
  const [startDate, setStartDate] = useState(nextMonday);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const [customMode, setCustomMode] = useState(false);
  const [timeMode, setTimeMode] = useState<TimeMode>("same");
  const [sameTime, setSameTime] = useState("19:00");
  const [times, setTimes] = useState<Record<number, string>>({
    0: "19:00",
    1: "19:00",
    2: "19:00",
    3: "19:00",
    4: "19:00",
    5: "19:00",
    6: "19:00",
  });
  const [levelAtStart, setLevelAtStart] = useState<"beginner" | "experienced">("beginner");
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const preferredSlots = useMemo<PreferredSlot[]>(
    () =>
      [...selectedDays]
        .sort((a, b) => a - b)
        .map((weekday) => ({
          weekday: weekday as PreferredSlot["weekday"],
          time: timeMode === "same" ? sameTime : times[weekday],
        })),
    [sameTime, selectedDays, timeMode, times],
  );
  const occupiedDates = useMemo(
    () => new Set(occupiedPlans.map((plan) => plan.planDate)),
    [occupiedPlans],
  );
  const schedule = useMemo(() => {
    if (!hasThreeDistinctDays(selectedDays)) return null;
    try {
      return buildProgramSchedule({
        startDate,
        slots: preferredSlots,
        timeZone,
        occupiedDates,
      });
    } catch {
      return null;
    }
  }, [occupiedDates, preferredSlots, selectedDays, startDate, timeZone]);

  function choosePreset(days: readonly number[]) {
    setCustomMode(false);
    setSelectedDays([...days]);
    setValidation(null);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : current.length < 3
          ? [...current, day]
          : current,
    );
    setValidation(null);
  }

  function showPreview() {
    if (!hasThreeDistinctDays(selectedDays)) {
      setValidation("서로 다른 요일 3개를 골라 주세요.");
      return;
    }
    if (!schedule) {
      setValidation("선택한 날짜와 시간을 확인해 주세요.");
      return;
    }
    setValidation(null);
    setStep("preview");
  }

  async function confirmSchedule() {
    if (!schedule || pending) return;
    setPending(true);
    setSaveError(null);
    try {
      await onConfirm({
        program,
        sessions: resolvedSessions,
        schedule: schedule.plans,
        levelAtStart,
        startDate,
        timeZone,
        preferredSlots,
      });
    } catch (error) {
      // ⚠️ `catch {}`로 되돌리지 마라. 오류를 삼키면 연속 3일 등록이 왜 실패하는지
      //    화면에도 콘솔에도 안 남는다 — 2026-08-12에 실제로 그렇게 막혔다.
      console.error("[program] 일정 저장 실패", error);
      setSaveError(programSaveErrorText(error));
    } finally {
      setPending(false);
    }
  }

  if (step === "start") {
    return (
      <section className="mx-auto w-full max-w-2xl pb-4">
        <ScheduleProgress step={step} />
        <p className="text-xs font-extrabold text-accent">1/3 · 시작일</p>
        <h1 className="mt-2 text-xl font-black text-text">언제 시작할까요?</h1>
        <p className="mt-1 text-xs leading-5 text-muted">첫 주부터 주 3회가 순서대로 배치됩니다.</p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setStartDate(today);
              setStep("slots");
            }}
            className="min-h-14 rounded-card border border-line bg-surface text-sm font-bold text-text"
          >
            이번 주 시작
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDate(nextMonday);
              setStep("slots");
            }}
            className="min-h-14 rounded-card border border-accent bg-accent/10 text-sm font-black text-accent"
          >
            다음 주 시작
          </button>
        </div>
        <label className="mt-6 block text-xs font-bold text-muted" htmlFor="program-start-date">
          날짜 직접 선택
        </label>
        <input
          id="program-start-date"
          type="date"
          min={today}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm text-text"
        />
        <button
          type="button"
          onClick={() => setStep("slots")}
          className="mt-3 min-h-12 w-full rounded-card bg-accent text-sm font-black text-accent-ink"
        >
          선택한 날짜로 계속
        </button>
      </section>
    );
  }

  if (step === "slots") {
    return (
      <section className="mx-auto w-full max-w-2xl pb-4">
        <ScheduleProgress step={step} />
        <p className="text-xs font-extrabold text-accent">2/3 · 요일과 시간</p>
        <h1 className="mt-2 text-xl font-black text-text">주 3회 시간을 정하세요</h1>
        <p className="mt-1 text-xs leading-5 text-muted">원하는 요일 3개를 고르세요. 연속으로 몰아서 해도 됩니다.</p>

        <p className="mt-5 text-xs font-black text-text">추천 요일</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {Object.entries(PRESETS).map(([label, days]) => (
            <button
              type="button"
              key={label}
              aria-pressed={!customMode && sameDays(selectedDays, days)}
              onClick={() => choosePreset(days)}
              className={`min-h-12 rounded-card-sm border text-xs font-bold ${!customMode && sameDays(selectedDays, days) ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-text"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={customMode}
          onClick={() => {
            setCustomMode(true);
            setSelectedDays([]);
            setValidation(null);
          }}
          className={`mt-2 min-h-11 w-full rounded-card-sm border border-dashed text-xs font-bold ${customMode ? "border-accent bg-accent/10 text-accent" : "border-line bg-transparent text-muted"}`}
        >
          직접 선택
        </button>

        {customMode && (
          <fieldset className="mt-3">
            <legend className="text-xs font-bold text-muted">운동할 요일 3개</legend>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="text-center text-xs text-muted">
                  <input
                    type="checkbox"
                    aria-label={day.label}
                    checked={selectedDays.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                    className="sr-only"
                  />
                  <span className={`grid min-h-11 place-items-center rounded-card-sm border ${selectedDays.includes(day.value) ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-text"}`}>
                    {day.short}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="mt-5 text-xs font-black text-text">운동 시간</p>
        <div className="mt-2 flex gap-1 rounded-card-sm border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setTimeMode("same")}
            className={`min-h-10 flex-1 rounded-card-sm text-xs font-bold ${timeMode === "same" ? "bg-accent text-accent-ink" : "text-muted"}`}
          >
            같은 시간
          </button>
          <button
            type="button"
            onClick={() => setTimeMode("per-day")}
            className={`min-h-10 flex-1 rounded-card-sm text-xs font-bold ${timeMode === "per-day" ? "bg-accent text-accent-ink" : "text-muted"}`}
          >
            요일별 시간
          </button>
        </div>

        {timeMode === "same" ? (
          <label className="mt-3 block text-xs font-bold text-muted">
            세 요일 모두 같은 시간
            <input
              type="time"
              value={sameTime}
              onChange={(event) => setSameTime(event.target.value)}
              className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm text-text"
            />
          </label>
        ) : (
          <div className="mt-3 space-y-2">
            {[...selectedDays].sort((a, b) => a - b).map((day) => (
              <label key={day} className="flex items-center gap-3 text-xs font-bold text-muted">
                <span className="w-14">{weekdayLabel(day)}요일</span>
                <input
                  type="time"
                  aria-label={`${weekdayLabel(day)}요일 시간`}
                  value={times[day]}
                  onChange={(event) => setTimes((current) => ({ ...current, [day]: event.target.value }))}
                  className="h-11 flex-1 rounded-card-sm border border-line bg-surface px-3 text-sm text-text"
                />
              </label>
            ))}
          </div>
        )}

        <fieldset className="mt-5">
          <legend className="text-xs font-bold text-muted">운동 경험</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["beginner", "experienced"] as const).map((level) => (
              <label key={level} className={`min-h-11 rounded-card-sm border px-3 py-3 text-center text-xs font-bold ${levelAtStart === level ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-text"}`}>
                <input
                  type="radio"
                  name="program-level"
                  value={level}
                  checked={levelAtStart === level}
                  onChange={() => setLevelAtStart(level)}
                  className="sr-only"
                />
                {level === "beginner" ? "초보" : "운동 경험 있음"}
              </label>
            ))}
          </div>
        </fieldset>

        {validation && <p role="alert" className="mt-3 text-xs font-bold text-warn">{validation}</p>}
        <button
          type="button"
          onClick={showPreview}
          className="mt-4 min-h-12 w-full rounded-card bg-accent text-sm font-black text-accent-ink"
        >
          일정 미리보기
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl pb-4">
      <ScheduleProgress step={step} />
      <p className="text-xs font-extrabold text-accent">3/3 · 18회 미리보기</p>
      <h1 className="mt-2 text-xl font-black text-text">6주 계획을 확인하세요</h1>
      <p className="mt-1 text-xs leading-5 text-muted">기존 계획은 지우지 않고 가까운 빈 날짜로 옮겨 담습니다.</p>

      {schedule && schedule.conflicts.length > 0 && (
        <div className="mt-3 rounded-card border border-accent/45 bg-accent/10 p-3 text-xs leading-5 text-muted">
          <p className="font-black text-accent">기존 계획 유지</p>
          {schedule.conflicts.map((conflict) => (
            <p key={`${conflict.date}-${conflict.suggestedDate}`}>
              {dateLabel(conflict.date)} 대신 {dateLabel(conflict.suggestedDate)}에 프로그램을 배치해요.
            </p>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {Array.from({ length: 6 }, (_, weekIndex) => (
          <div
            key={weekIndex}
            data-testid="program-week"
            className="grid grid-cols-[42px_repeat(3,minmax(0,1fr))] gap-1.5"
          >
            <span className="grid place-items-center text-[11px] font-bold text-muted">{weekIndex + 1}주</span>
            {schedule?.plans.slice(weekIndex * 3, weekIndex * 3 + 3).map((plan) => (
              <div key={`${plan.week}-${plan.session}`} data-testid="program-plan-date" className="rounded-card-sm border border-line bg-surface px-1 py-2.5 text-center">
                <p className="text-[10px] font-bold text-accent">{plan.templateKey}</p>
                <p className="mt-1 text-[11px] font-bold text-text">{dateLabel(plan.date)}</p>
              </div>
            ))}
          </div>
        ))}
      </div>

      {saveError && <p role="alert" className="mt-3 text-xs font-bold text-warn">{saveError}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={confirmSchedule}
        className="mt-4 min-h-12 w-full rounded-card bg-accent text-sm font-black text-accent-ink disabled:opacity-50"
      >
        {pending ? "달력에 담는 중..." : "18회 계획을 달력에 담기"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setStep("slots")}
        className="mt-2 min-h-11 w-full text-xs font-bold text-muted"
      >
        요일과 시간 다시 정하기
      </button>
    </section>
  );
}
