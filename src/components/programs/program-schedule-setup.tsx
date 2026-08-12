"use client";

import { useMemo, useState } from "react";
import type { OfficialProgram } from "@/lib/domain/official-programs";
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
  program: OfficialProgram;
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

function hasRecoveryGap(days: readonly number[]): boolean {
  if (days.length !== 3 || new Set(days).size !== 3) return false;
  const ordered = [...days].sort((a, b) => a - b);
  return ordered.every((day, index) => {
    const next = ordered[(index + 1) % ordered.length];
    return (next - day + 7) % 7 >= 2;
  });
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
    if (!hasRecoveryGap(selectedDays)) return null;
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
    if (!hasRecoveryGap(selectedDays)) {
      setValidation("운동일 사이에는 하루 이상 쉬어야 회복할 수 있어요.");
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
    } catch {
      setSaveError("저장하지 못했어요. 일정은 그대로 두었어요.");
    } finally {
      setPending(false);
    }
  }

  if (step === "start") {
    return (
      <section>
        <p className="text-xs font-extrabold text-accent">1/3 · 시작일</p>
        <h1 className="mt-2 text-xl font-black text-text">언제 시작할까요?</h1>
        <p className="mt-1 text-xs leading-5 text-muted">첫 주부터 주 3회가 순서대로 배치됩니다.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setStartDate(today);
              setStep("slots");
            }}
            className="min-h-12 rounded-card border border-line bg-surface text-sm font-bold text-text"
          >
            이번 주 시작
          </button>
          <button
            type="button"
            onClick={() => {
              setStartDate(nextMonday);
              setStep("slots");
            }}
            className="min-h-12 rounded-card border border-accent bg-accent/10 text-sm font-black text-accent"
          >
            다음 주 시작
          </button>
        </div>
        <label className="mt-4 block text-xs font-bold text-muted" htmlFor="program-start-date">
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
      <section>
        <p className="text-xs font-extrabold text-accent">2/3 · 요일과 시간</p>
        <h1 className="mt-2 text-xl font-black text-text">주 3회 시간을 정하세요</h1>
        <p className="mt-1 text-xs leading-5 text-muted">회복을 위해 운동일 사이에 하루 이상 쉽니다.</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {Object.entries(PRESETS).map(([label, days]) => (
            <button
              type="button"
              key={label}
              onClick={() => choosePreset(days)}
              className="min-h-11 rounded-card-sm border border-line bg-surface text-xs font-bold text-text"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomMode(true);
              setSelectedDays([]);
              setValidation(null);
            }}
            className="min-h-11 rounded-card-sm border border-line bg-surface text-xs font-bold text-text"
          >
            직접 선택
          </button>
        </div>

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

        <div className="mt-4 flex gap-1 rounded-card-sm border border-line bg-surface p-1">
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

        <fieldset className="mt-4">
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
    <section>
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

      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }, (_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-[42px_repeat(3,minmax(0,1fr))] gap-1">
            <span className="grid place-items-center text-[11px] font-bold text-muted">{weekIndex + 1}주</span>
            {schedule?.plans.slice(weekIndex * 3, weekIndex * 3 + 3).map((plan) => (
              <div key={`${plan.week}-${plan.session}`} data-testid="program-plan-date" className="rounded-card-sm border border-line bg-surface p-2 text-center">
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
