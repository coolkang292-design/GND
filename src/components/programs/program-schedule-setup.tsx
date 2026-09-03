"use client";

import { useMemo, useState } from "react";
import {
  isLadderProgram,
  ladderLevelForMaxReps,
  programLevelLegend,
  programLevelOptions,
  type OfficialProgram,
  type ProgramLevel,
} from "@/lib/domain/official-programs";
import {
  LADDER_MAX_REPS_MAX,
  LADDER_MAX_REPS_MIN,
  isLadderMaxReps,
  ladderLabel,
  ladderRepsForDay,
} from "@/lib/domain/pullup-ladder";
import { programSaveErrorText } from "@/lib/domain/program-error-text";
import {
  buildProgramSchedule,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  type PreferredSlot,
  type ProgramScheduleItem,
} from "@/lib/domain/program-schedule";
import { buildLadderSchedule, ladderCalendarRows } from "@/lib/domain/ladder-schedule";
import { addDaysToDateKey } from "@/lib/domain/workout-plan";

type ScheduleStep = "start" | "slots" | "preview";
type TimeMode = "same" | "per-day";

/**
 * 이 화면이 정하는 것 — **날짜·요일·시간·난이도**뿐이다.
 *
 * 회차 종목을 합쳐 payload를 만드는 일은 `ProgramFlow`가 한다. 근력과 인터벌은
 * 회차 모양이 달라서(종목 4개·처방 없음·`tabata_minutes`) 여기서 나누면 이
 * 화면이 두 벌이 된다.
 */
export type ProgramScheduleChoice = {
  schedule: readonly ProgramScheduleItem[];
  levelAtStart: ProgramLevel;
  startDate: string;
  timeZone: string;
  preferredSlots: readonly PreferredSlot[];
  /**
   * 사다리 전용 — 사용자가 입력한 지금 최대 개수 (2026-09-04).
   *
   * 사다리는 난이도를 묻지 않는다. `levelAtStart`에는 이 숫자를 세 칸으로
   * 접은 값이 들어가고(`ladderLevelForMaxReps`), 회차별 세트를 만드는 데
   * 실제로 쓰이는 것은 **이 값**이다.
   */
  maxReps?: number;
};

type ProgramScheduleSetupProps = {
  today: string;
  timeZone: string;
  program: OfficialProgram;
  onConfirm: (choice: ProgramScheduleChoice) => Promise<void>;
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
 * 고른 요일로 일정을 짤 수 있는가.
 *
 * 요일 사이 간격 제한은 없앴다 (사용자 확정 2026-08-12) — 금·토·일처럼 몰아서
 * 하는 사람을 막고 있었다.
 *
 * 주당 횟수도 **사용자가 정한다** — 2~5일 (2026-08-12). 총 18회는 그대로이고
 * 기간이 늘거나 준다. 남은 조건은 **서로 다른 요일**뿐이다.
 */
function hasEnoughDistinctDays(days: readonly number[]): boolean {
  return (
    days.length >= MIN_SESSIONS_PER_WEEK &&
    days.length <= MAX_SESSIONS_PER_WEEK &&
    new Set(days).size === days.length
  );
}

export function ProgramScheduleSetup({
  today,
  timeZone,
  program,
  onConfirm,
}: ProgramScheduleSetupProps) {
  const levelOptions = programLevelOptions(program);
  /*
    사다리는 난이도 대신 **숫자 한 칸**을 받는다 (2026-09-04). 화면 흐름
    (시작일 → 요일·시간 → 미리보기)은 셋이 똑같아서, 갈라지는 곳은
    난이도 자리 하나뿐이다 — 화면을 두 벌로 만들지 않는다.
  */
  const ladder = isLadderProgram(program) ? program : null;
  const nextMonday = addDaysToDateKey(startOfWeek(today), 7);
  const [step, setStep] = useState<ScheduleStep>("start");
  const [startDate, setStartDate] = useState(nextMonday);
  // 사다리는 원문의 "5일 훈련 1일 휴식"에 가장 가까운 월~금으로 시작한다
  const [selectedDays, setSelectedDays] = useState<number[]>(
    ladder ? [1, 2, 3, 4, 5] : [1, 3, 5],
  );
  /*
    사다리는 **직접 선택 화면으로 연다** (2026-09-04).

    기본값 월~금은 프리셋 두 개(월·수·금 / 화·목·토) 중 어느 것도 아니다.
    접힌 채로 두면 화면에는 아무것도 안 골라진 것처럼 보이고, 「직접 선택」을
    누르는 순간 고른 요일이 **비워진다** — 기본값이 있으나 마나가 된다.
  */
  const [customMode, setCustomMode] = useState(Boolean(ladder));
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
  const [levelAtStart, setLevelAtStart] = useState<ProgramLevel>("beginner");
  const [maxReps, setMaxReps] = useState(LADDER_MAX_REPS_MIN);
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * 사다리 일정 — 요일이 아니라 **주기**로 잡는다 (2026-09-04).
   *
   * 요일 목록은 7일마다 반복해서 "5일 훈련 1일 휴식"(6일 주기)을 표현할 수
   * 없다. 그래서 사다리는 아래 요일 UI를 아예 쓰지 않고, 시작일과 시각만으로
   * 24회차를 만든다. 슬롯도 그 함수가 만들어 준다 — RPC가 요구해서 채울 뿐
   * 날짜를 정하지는 않는다.
   */
  const ladderBuild = useMemo(() => {
    if (!ladder) return null;
    try {
      return buildLadderSchedule({ startDate, time: sameTime, timeZone });
    } catch {
      return null;
    }
  }, [ladder, startDate, sameTime, timeZone]);

  const weekdaySlots = useMemo<PreferredSlot[]>(
    () =>
      [...selectedDays]
        .sort((a, b) => a - b)
        .map((weekday) => ({
          weekday: weekday as PreferredSlot["weekday"],
          time: timeMode === "same" ? sameTime : times[weekday],
        })),
    [sameTime, selectedDays, timeMode, times],
  );
  const preferredSlots = ladderBuild?.preferredSlots ?? weekdaySlots;
  /**
   * 프로그램은 이제 **기존 계획을 피해 다니지 않는다** (0101).
   *
   * 예전에는 그날 계획이 있으면 프로그램 회차를 가까운 빈 날로 밀었다. 하루에
   * 계획을 하나만 담을 수 있었으니 그럴 수밖에 없었다. 이제는 나란히 선다 —
   * 오전 풀업 회차와 오후 가슴 루틴이 같은 날에 있는 것이 바로 이 기능의
   * 목적이라, 피해 다니면 고른 요일이 지켜지지 않는다.
   *
   * ⚠️ 빈 집합이라고 `buildProgramSchedule`의 인자를 지우지는 않았다. 같은
   *    프로그램의 두 회차가 같은 날 겹치는 것은 여전히 막아야 하고
   *    (`fixedProgramDates`), 그 규칙은 이 인자와 별개다.
   *
   * ⚠️ **0101을 Run하기 전에는** 겹치는 날짜가 있으면 RPC가
   *    `program_plan_date_taken`으로 등록을 거절한다. 배포와 Run 사이의 짧은
   *    동안만이고, `programSaveErrorText`가 그대로 사람 말로 알린다.
   */
  const occupiedDates = useMemo(() => new Set<string>(), []);
  const schedule = useMemo(() => {
    if (ladder) {
      return ladderBuild ? { plans: ladderBuild.plans, conflicts: [] } : null;
    }
    if (!hasEnoughDistinctDays(selectedDays)) return null;
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
  }, [
    ladder,
    ladderBuild,
    occupiedDates,
    preferredSlots,
    selectedDays,
    startDate,
    timeZone,
  ]);

  function choosePreset(days: readonly number[]) {
    setCustomMode(false);
    setSelectedDays([...days]);
    setValidation(null);
  }

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : current.length < MAX_SESSIONS_PER_WEEK
          ? [...current, day]
          : current,
    );
    setValidation(null);
  }

  function showPreview() {
    if (ladder && !isLadderMaxReps(maxReps)) {
      setValidation(
        `지금 최대 개수를 ${LADDER_MAX_REPS_MIN}~${LADDER_MAX_REPS_MAX} 사이로 넣어 주세요.`,
      );
      return;
    }
    // 사다리는 요일을 고르지 않는다 — 날짜는 주기가 정한다
    if (!ladder && !hasEnoughDistinctDays(selectedDays)) {
      setValidation(
        `서로 다른 요일을 ${MIN_SESSIONS_PER_WEEK}~${MAX_SESSIONS_PER_WEEK}개 골라 주세요.`,
      );
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
        schedule: schedule.plans,
        // 사다리는 라디오를 안 그린다 — 숫자에서 난이도를 만든다
        levelAtStart: ladder ? ladderLevelForMaxReps(maxReps) : levelAtStart,
        startDate,
        timeZone,
        preferredSlots,
        maxReps: ladder ? maxReps : undefined,
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
        <p className="text-xs font-extrabold text-accent">
          2/3 · {ladder ? "시간" : "요일과 시간"}
        </p>
        <h1 className="mt-2 text-xl font-black text-text">
          {ladder ? "몇 시에 할까요?" : "주 3회 시간을 정하세요"}
        </h1>
        <p className="mt-1 text-xs leading-5 text-muted">
          {ladder
            ? "요일은 고르지 않아요. 5일 하고 하루 쉬는 주기라서 날짜가 매주 밀려요."
            : "원하는 요일 3개를 고르세요. 연속으로 몰아서 해도 됩니다."}
        </p>

        {/*
          요일 고르기는 사다리에 **없다** (2026-09-04). 요일은 7일마다 돌아와서
          6일 주기를 못 담는다 — 여기서 요일을 고르게 두면 사용자가 고른 것과
          실제 배치가 갈라진다.
        */}
        {!ladder && (
        <div>
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
            {/* 사다리는 이 블록 자체가 안 그려진다 — 요일을 안 고른다 */}
            <legend className="text-xs font-bold text-muted">
              운동할 요일 {MIN_SESSIONS_PER_WEEK}~{MAX_SESSIONS_PER_WEEK}개
            </legend>
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

        </div>
        )}

        <p className="mt-5 text-xs font-black text-text">운동 시간</p>
        {!ladder && (
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
        )}

        {ladder || timeMode === "same" ? (
          <label className="mt-3 block text-xs font-bold text-muted">
            {ladder ? "매 회차 같은 시간" : "세 요일 모두 같은 시간"}
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

        {/*
          사다리는 여기서 **등록에 실제로 쓰이는 숫자**를 받는다. 상세 화면의
          같은 입력은 미리보기였다 — 그 화면을 건너뛰고 올 수도 있고, 일정을
          정하는 동안 마음이 바뀔 수도 있어서 정하는 자리는 여기 하나다.
        */}
        {ladder && (
          <fieldset className="mt-5">
            <legend className="text-xs font-bold text-muted">
              {programLevelLegend(program)}
            </legend>
            <label
              className="mt-2 flex items-center gap-3"
              htmlFor="ladder-max-reps"
            >
              <input
                id="ladder-max-reps"
                type="number"
                inputMode="numeric"
                min={LADDER_MAX_REPS_MIN}
                max={LADDER_MAX_REPS_MAX}
                value={maxReps}
                onChange={(event) => {
                  setMaxReps(Number(event.target.value));
                  setValidation(null);
                }}
                className="h-12 w-24 rounded-card-sm border border-line bg-surface px-3 text-center text-lg font-black text-text"
              />
              <span className="text-sm font-bold text-muted">
                개까지 할 수 있어요
              </span>
            </label>
            {isLadderMaxReps(maxReps) && (
              <p className="mt-2 text-xs leading-5 text-muted">
                1일차는{" "}
                <span className="font-black text-text">
                  {ladderLabel([...ladderRepsForDay(maxReps, 1)])}
                </span>
                로 시작해서 회차마다 한 회씩 올라가요.
              </p>
            )}
          </fieldset>
        )}

        {!ladder && (
        <fieldset className="mt-5">
          <legend className="text-xs font-bold text-muted">
            {programLevelLegend(program)}
          </legend>
          <div
            className={`mt-2 grid gap-2 ${levelOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {levelOptions.map((option) => (
              <label
                key={option.value}
                className={`min-h-11 rounded-card-sm border px-3 py-3 text-center text-xs font-bold ${levelAtStart === option.value ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-text"}`}
              >
                <input
                  type="radio"
                  name="program-level"
                  value={option.value}
                  checked={levelAtStart === option.value}
                  onChange={() => setLevelAtStart(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        )}

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
      {/*
        ⚠️ "18회"·"6주"를 박아 두지 마라 (2026-09-04에 실제로 거짓말이 됐다).
           사다리는 24회 · 4주이고, 근력·인터벌은 18회에 기간이 주당 횟수에
           따라 4~9주로 달라진다. 회차 수는 **만들어진 일정에서 세고**, 기간은
           프로그램이 정한 것을 말한다.
      */}
      <p className="text-xs font-extrabold text-accent">
        3/3 · {schedule?.plans.length ?? 0}회 미리보기
      </p>
      <h1 className="mt-2 text-xl font-black text-text">
        {ladder ? "4주 일정을 확인하세요" : "6주 계획을 확인하세요"}
      </h1>
      <p className="mt-1 text-xs leading-5 text-muted">
        {ladder
          ? "5일 하고 하루 쉬어요. 쉬는 날은 달력에 아무것도 안 담겨요."
          : "그날 이미 계획이 있어도 지우지 않고 나란히 담아요."}
      </p>

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

      {/*
        사다리는 **쉬는 날을 같이 보여 준다** (사장님 지시 2026-09-04).
        훈련일만 나열하면 "왜 하루가 비지?"를 화면이 설명하지 못한다.
      */}
      {ladder && schedule ? (
        <ol className="mt-5 space-y-1" aria-label="회차와 휴식일">
          {ladderCalendarRows(schedule.plans).map((row) =>
            row.kind === "session" ? (
              <li
                key={`s${row.session}`}
                data-testid="ladder-row-session"
                className="flex items-center justify-between rounded-card-sm border border-line bg-surface px-3 py-2"
              >
                <span className="text-[11px] font-bold text-accent">
                  {row.session}일차
                </span>
                <span className="text-xs font-bold text-text">
                  {dateLabel(row.date)}
                </span>
              </li>
            ) : (
              <li
                key={`r${row.date}`}
                data-testid="ladder-row-rest"
                className="flex items-center justify-between rounded-card-sm border border-dashed border-line px-3 py-2"
              >
                <span className="text-[11px] font-bold text-muted">휴식</span>
                <span className="text-xs font-bold text-muted">
                  {dateLabel(row.date)}
                </span>
              </li>
            ),
          )}
        </ol>
      ) : (
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
      )}

      {saveError && <p role="alert" className="mt-3 text-xs font-bold text-warn">{saveError}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={confirmSchedule}
        className="mt-4 min-h-12 w-full rounded-card bg-accent text-sm font-black text-accent-ink disabled:opacity-50"
      >
        {pending
          ? "달력에 담는 중..."
          : `${schedule?.plans.length ?? 0}회 계획을 달력에 담기`}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setStep("slots")}
        className="mt-2 min-h-11 w-full text-xs font-bold text-muted"
      >
        {ladder ? "시간 다시 정하기" : "요일과 시간 다시 정하기"}
      </button>
    </section>
  );
}
