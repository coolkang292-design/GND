"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  intervalExerciseName,
  programLevelOptions,
  type IntervalProgram,
  type OfficialProgram,
  type OfficialProgramKey,
  type ProgramLevel,
  type StrengthProgram,
} from "@/lib/domain/official-programs";
import { EXERCISE_PREVIEW_NOTES } from "./exercise-preview-notes";

type ProgramCatalogProps = {
  programs: readonly OfficialProgram[];
  onPick: (key: OfficialProgramKey) => void;
};

type ProgramDetailProps = {
  /**
   * 근력 전용이다 — 반복·휴식 표가 근력 처방을 전제한다.
   * 인터벌 상세는 2단계에서 따로 만든다 (설계 §6).
   */
  program: StrengthProgram;
  onBack: () => void;
  onSchedule: () => void;
  scheduleAvailable?: boolean;
};

const AUDIENCE: Record<OfficialProgramKey, readonly [string, string, string]> = {
  "shoulder-frame-6w": [
    "어깨와 등을 균형 있게 키우고 싶은 사람",
    "상체 운동을 주 3회 규칙적으로 이어가고 싶은 사람",
    "매번 무게와 휴식 시간을 고민하고 싶지 않은 사람",
  ],
  "chest-frame-6w": [
    "가슴과 밀기 동작의 기초를 단단히 만들고 싶은 사람",
    "상체 앞면과 등 운동을 함께 구성하고 싶은 사람",
    "반복 가능한 주 3회 계획이 필요한 사람",
  ],
  "arm-outline-6w": [
    "팔의 두께와 윤곽에 집중하고 싶은 사람",
    "팔만이 아니라 전신 기본 운동도 놓치고 싶지 않은 사람",
    "최근 기록에 맞춘 무게 안내가 필요한 사람",
  ],
  "lower-balance-6w": [
    "하체 근력과 좌우 균형을 함께 다지고 싶은 사람",
    "스쿼트와 힌지 동작을 체계적으로 반복하고 싶은 사람",
    "주 3회를 꾸준히 지킬 수 있는 사람",
  ],
  "lean-body-6w": [
    "근육을 지키며 체지방 관리 습관을 만들고 싶은 사람",
    "근력 운동과 전신 활동을 함께 이어가고 싶은 사람",
    "짧은 성과보다 반복 가능한 6주 계획이 필요한 사람",
  ],
  "interval-burn-6w": [
    "시간이 없어 짧게 끝내고 싶은 사람",
    "기구 없이 집에서 전신을 쓰고 싶은 사람",
    "숨이 차는 강도를 단계적으로 올리고 싶은 사람",
  ],
};

const COVER_POSITION: Record<OfficialProgramKey, string> = {
  "shoulder-frame-6w": "object-[center_38%]",
  "chest-frame-6w": "object-[center_42%]",
  "arm-outline-6w": "object-[center_40%]",
  "lower-balance-6w": "object-[center_44%]",
  "lean-body-6w": "object-[center_42%]",
  "interval-burn-6w": "object-[center_35%]",
};

function ProgramStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-testid="program-stat"
      className="rounded-card-sm border border-line/80 bg-surface-2 px-2.5 py-2.5 text-center"
    >
      <p className="text-[10px] font-bold text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-black text-text">{value}</p>
    </div>
  );
}

function ProgramCover({
  program,
  featured,
}: {
  program: OfficialProgram;
  featured?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      data-testid={featured ? "program-cover-featured" : "program-cover-compact"}
      className={`relative overflow-hidden bg-bg ${
        featured ? "aspect-[16/9]" : "aspect-[4/3]"
      }`}
      aria-hidden="true"
    >
      <Image
        src={program.coverImage}
        alt=""
        fill
        priority={featured}
        sizes={featured ? "(max-width: 480px) 100vw, 430px" : "(max-width: 480px) 50vw, 210px"}
        onError={() => setFailed(true)}
        className={`object-cover transition-opacity ${COVER_POSITION[program.key]} ${failed ? "opacity-0" : "opacity-100"}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/75 via-transparent to-transparent" />
    </div>
  );
}

function ProgramCard({
  program,
  featured = false,
  onPick,
}: {
  program: OfficialProgram;
  featured?: boolean;
  onPick: (key: OfficialProgramKey) => void;
}) {
  return (
    <button
      type="button"
      data-featured={featured ? "true" : undefined}
      data-card-size={featured ? "featured" : "compact"}
      onClick={() => onPick(program.key)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-line bg-surface text-left shadow-card transition-colors hover:border-accent/55 motion-reduce:transition-none"
    >
      <ProgramCover program={program} featured={featured} />
      <span
        className={`flex flex-1 flex-col ${
          featured ? "p-4 sm:p-5" : "min-h-[8.5rem] p-3 sm:min-h-[8rem]"
        }`}
      >
        <span className="block text-sm font-black leading-5 text-text">
          {program.eyebrow}
        </span>
        <span className="mt-1 block text-[11px] leading-[1.125rem] text-muted sm:text-xs">
          {program.title}
        </span>
        <span className="mt-auto block pt-3 text-[10px] font-extrabold leading-4 text-accent sm:text-[11px]">
          주 {program.sessionsPerWeek}회 · {program.weeks}주 · 회당 {program.durationMinutes[0]}–{program.durationMinutes[1]}분
        </span>
      </span>
    </button>
  );
}

export function ProgramCatalog({ programs, onPick }: ProgramCatalogProps) {
  const [featured, ...rest] = programs;

  if (!featured) return null;

  return (
    <section
      aria-labelledby="program-catalog-title"
      className="mx-auto w-full max-w-3xl pb-4"
    >
      {/*
        나갈 길 (사용자 지적 2026-08-12). 상세 화면에는 `← 프로그램 목록으로`가
        있는데 **목록에는 없었다** — 여기까지 들어오면 탭바로만 빠져나갈 수 있었다.
        상세의 뒤로 가기와 같은 모양으로 둔다.
      */}
      <Link
        href="/record"
        className="mb-3 inline-flex min-h-11 items-center rounded-full pr-3 text-sm font-bold text-muted"
      >
        ← 운동 추가로
      </Link>

      <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">
        GND 공식 프로그램
      </p>
      <h1 id="program-catalog-title" className="mt-1 text-2xl font-black leading-8 text-text">
        목표를 고르면 6주 계획이 완성돼요
      </h1>
      <p className="mt-1 text-xs leading-5 text-muted">
        모든 프로그램은 주 3회, 총 18회로 구성됩니다.
      </p>

      <div className="mt-5">
        <ProgramCard program={featured} featured onPick={onPick} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {rest.map((program) => (
          <ProgramCard key={program.key} program={program} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

/**
 * 인터벌 상세 — 근력 상세와 **다른 화면**이다.
 *
 * 근력은 종목마다 반복·휴식이 다르지만 인터벌은 전부 20초/10초로 같다. 대신
 * 근력에 없는 두 가지를 보여 줘야 한다 — **난이도가 종목을 바꾸고**(§3.3),
 * **주차가 길이를 올린다**(§3.4). 같은 표에 우겨넣으면 둘 다 안 보인다.
 */
export function IntervalProgramDetail({
  program,
  onBack,
  onSchedule,
  scheduleAvailable = true,
}: {
  program: IntervalProgram;
  onBack: () => void;
  onSchedule: () => void;
  scheduleAvailable?: boolean;
}) {
  const [level, setLevel] = useState<ProgramLevel>("beginner");
  const options = programLevelOptions(program);

  return (
    <article className="mx-auto w-full max-w-3xl pb-28">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex min-h-11 items-center rounded-full pr-3 text-sm font-bold text-muted"
      >
        ← 프로그램 목록으로
      </button>

      <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-card">
        <ProgramCover program={program} featured />
        <div className="p-5">
          <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">
            GND 공식 프로그램
          </p>
          <h1 className="mt-1.5 text-2xl font-black leading-8 text-text">
            {program.eyebrow}
          </h1>
          <p className="mt-1 text-sm font-bold text-muted">{program.title}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="프로그램 핵심 수치">
        <ProgramStat label="빈도" value={`주 ${program.sessionsPerWeek}회`} />
        <ProgramStat label="기간" value={`${program.weeks}주`} />
        <ProgramStat label="전체" value="18회" />
        <ProgramStat
          label="회당"
          value={`${program.durationMinutes[0]}–${program.durationMinutes[1]}분`}
        />
      </div>

      <section
        data-testid="program-audience"
        data-tone="highlight"
        className="mt-6 rounded-r-card border-l-2 border-accent bg-accent/8 px-4 py-4"
      >
        <h2 className="text-sm font-black text-text">이런 사람에게 맞아요</h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-5 text-muted">
          {AUDIENCE[program.key].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-accent">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 px-1">
        <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">
          PROGRAM FOCUS
        </p>
        <h2 className="mt-1 text-lg font-black leading-6 text-text">
          20초 운동 · 10초 휴식을 반복해요
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted">{program.description}</p>
      </section>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line px-4 py-4">
          <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">
            난이도별 구성
          </p>
          <h2 className="mt-1 text-base font-black text-text">
            난이도가 종목을 정해요
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            등록할 때 고른 난이도로 6주 내내 진행합니다.
          </p>
          <div
            role="tablist"
            aria-label="인터벌 난이도"
            className="mt-4 grid grid-cols-3 gap-2"
          >
            {options.map((option) => {
              const selected = option.value === level;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="interval-level-panel"
                  onClick={() => setLevel(option.value)}
                  className={`min-h-11 rounded-card-sm border px-2 py-2 text-center text-sm font-black transition-colors motion-reduce:transition-none ${
                    selected
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface-2 text-muted"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div id="interval-level-panel" role="tabpanel">
          <div className="divide-y divide-line/70 px-4">
            {program.sessions.map((session) => (
              <div key={session.key} data-testid="interval-session" className="py-3">
                <p className="text-[11px] font-extrabold text-accent">
                  {session.key}회차
                </p>
                <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {session.exercises.map((exercise) => (
                    <li
                      key={exercise.slot}
                      data-testid="interval-exercise"
                      className="rounded-card-sm bg-surface-2 px-2.5 py-2 text-[11.5px] font-bold leading-4 text-text"
                    >
                      {intervalExerciseName(exercise, level)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-4 py-4">
            <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">
              주차별 길이
            </p>
            <h3 className="mt-1 text-sm font-black text-text">
              주차가 지나며 양이 자라요
            </h3>
            <ol
              className="mt-3 grid grid-cols-6 gap-1.5"
              aria-label="주차별 회차 길이"
            >
              {program.minutesByWeek[level].map((minutes, index) => (
                <li
                  key={index}
                  data-testid="interval-week-minutes"
                  className="rounded-card-sm border border-line/80 bg-surface-2 px-1 py-2 text-center"
                >
                  <span className="block text-[10px] font-bold text-muted">
                    {index + 1}주
                  </span>
                  <span className="mt-0.5 block text-xs font-black text-text">
                    {minutes}분
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <aside
        role="note"
        className="mt-4 rounded-card-sm border border-line/70 px-3 py-3 text-xs leading-5 text-muted"
      >
        <span className="font-bold text-text">안전 안내 · </span>
        숨이 심하게 차거나 통증이 느껴지면 멈추고 쉬세요. 관절에 부담이 되면 점프
        없는 난이도로 다시 등록할 수 있어요.
      </aside>

      {scheduleAvailable && (
        <div
          className="pointer-events-none fixed inset-x-0 z-30 px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        >
          <button
            type="button"
            onClick={onSchedule}
            className="pointer-events-auto mx-auto block min-h-12 w-full max-w-3xl rounded-card bg-accent px-4 text-sm font-black text-accent-ink shadow-card"
          >
            요일과 시간 정하기
          </button>
        </div>
      )}
    </article>
  );
}

export function ProgramDetail({
  program,
  onBack,
  onSchedule,
  scheduleAvailable = true,
}: ProgramDetailProps) {
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<"A" | "B" | "C">("A");
  const selectedSession =
    program.sessions.find((session) => session.key === selectedSessionKey) ??
    program.sessions[0];

  return (
    <article className="mx-auto w-full max-w-3xl pb-28">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex min-h-11 items-center rounded-full pr-3 text-sm font-bold text-muted"
      >
        ← 프로그램 목록으로
      </button>

      <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-card">
        <ProgramCover program={program} featured />
        <div className="p-5">
          <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">GND 공식 프로그램</p>
          <h1 className="mt-1.5 text-2xl font-black leading-8 text-text">{program.eyebrow}</h1>
          <p className="mt-1 text-sm font-bold text-muted">{program.title}</p>
        </div>
      </div>

      <p className="sr-only">
        주 {program.sessionsPerWeek}회 · {program.weeks}주 · 18회 · 회당 {program.durationMinutes[0]}–{program.durationMinutes[1]}분
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="프로그램 핵심 수치">
        <ProgramStat label="빈도" value={`주 ${program.sessionsPerWeek}회`} />
        <ProgramStat label="기간" value={`${program.weeks}주`} />
        <ProgramStat label="전체" value="18회" />
        <ProgramStat label="회당" value={`${program.durationMinutes[0]}–${program.durationMinutes[1]}분`} />
      </div>

      <section
        data-testid="program-audience"
        data-tone="highlight"
        className="mt-6 rounded-r-card border-l-2 border-accent bg-accent/8 px-4 py-4"
      >
        <h2 className="text-sm font-black text-text">이런 사람에게 맞아요</h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-5 text-muted">
          {AUDIENCE[program.key].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-accent">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 px-1">
        <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">PROGRAM FOCUS</p>
        <h2 className="mt-1 text-lg font-black leading-6 text-text">전신은 지키고, 목표 부위는 더 집중해요</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{program.description}</p>
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-4">
        <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">6주 전체 구성</p>
        <h2 className="mt-1 text-base font-black leading-6 text-text">
          A·B·C 세 회차를 6주 동안 반복해요
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          매주 세 회차를 한 번씩 진행해 총 18회를 완성합니다.
        </p>
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="6주 운동 회차 로드맵">
          {Array.from({ length: program.weeks }, (_, index) => (
            <li
              key={index}
              data-testid="program-roadmap-week"
              className="rounded-card-sm border border-line/80 bg-surface-2 px-2 py-2.5 text-center"
            >
              <span className="block text-[10px] font-bold text-muted">{index + 1}주</span>
              <span className="mt-0.5 block text-xs font-black tracking-wide text-text">
                A · B · C
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line px-4 py-4">
          <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">회차별 운동표</p>
          <h2 className="mt-1 text-base font-black text-text">회차별 상세</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            회차를 누르면 운동·세트·반복·휴식을 모두 확인할 수 있어요.
          </p>
          <div
            role="tablist"
            aria-label="프로그램 회차"
            className="mt-4 grid grid-cols-3 gap-2"
          >
            {program.sessions.map((session) => {
              const selected = session.key === selectedSession.key;

              return (
                <button
                  key={session.key}
                  type="button"
                  role="tab"
                  id={`program-session-tab-${program.key}-${session.key}`}
                  aria-controls={`program-session-panel-${program.key}`}
                  aria-label={`${session.key}회 · ${session.title}`}
                  aria-selected={selected}
                  onClick={() => {
                    setSelectedSessionKey(session.key);
                    setOpenExercise(null);
                  }}
                  className={`min-h-14 rounded-card-sm border px-2 py-2 text-center transition-colors motion-reduce:transition-none ${
                    selected
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface-2 text-muted"
                  }`}
                >
                  <span className="block text-sm font-black">{session.key}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold">
                    {session.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          id={`program-session-panel-${program.key}`}
          role="tabpanel"
          aria-labelledby={`program-session-tab-${program.key}-${selectedSession.key}`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_52px_76px] gap-2 border-b border-line/70 bg-surface-2 px-4 py-2 text-[10px] font-bold text-muted">
            <span>운동 · 세트</span>
            <span className="text-center">반복</span>
            <span className="text-right">세트 사이 휴식</span>
          </div>
          <ol className="divide-y divide-line/70 px-4 text-xs">
          {selectedSession.exercises.map((exercise, index) => {
            const description = EXERCISE_PREVIEW_NOTES[exercise.exerciseName];
            const open = openExercise === exercise.exerciseName;
            const descriptionId = `exercise-description-${program.key}-${selectedSession.key}-${index}`;
            const setLabel =
              exercise.beginnerSets === exercise.experiencedSets
                ? `초보·경험 ${exercise.beginnerSets}세트`
                : `초보 ${exercise.beginnerSets}세트 · 경험 ${exercise.experiencedSets}세트`;

            return (
            <li
              key={exercise.exerciseName}
              data-testid="exercise-preview-row"
              className="py-2.5"
            >
              <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_52px_76px] items-center gap-2">
                <button
                  type="button"
                  aria-label={`${exercise.exerciseName} 설명 보기`}
                  aria-expanded={open}
                  aria-controls={descriptionId}
                  onClick={() =>
                    setOpenExercise((current) =>
                      current === exercise.exerciseName
                        ? null
                        : exercise.exerciseName,
                    )
                  }
                  className="flex min-h-11 min-w-0 items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-bold leading-5 text-text">
                      {exercise.exerciseName}
                    </span>
                    <span className="block text-[10px] font-bold leading-4 text-muted">
                      {setLabel}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="flex-none text-[10px] font-extrabold text-accent"
                  >
                    설명 {open ? "−" : "＋"}
                  </span>
                </button>
                <span className="text-center text-muted">
                  {exercise.repsMin}–{exercise.repsMax}회
                </span>
                <span className="text-right text-muted">
                  {exercise.restSeconds}초
                </span>
              </div>
              {open && (
                <p
                  id={descriptionId}
                  data-testid="exercise-preview-description"
                  className="mt-1 rounded-card-sm bg-surface-2 px-3 py-2.5 text-[11.5px] leading-5 text-muted"
                >
                  {description}
                </p>
              )}
            </li>
            );
          })}
          </ol>
        </div>
      </section>

      <section
        data-testid="program-automation"
        data-tone="accent"
        className="mt-5 rounded-card border border-accent/45 bg-gradient-to-br from-accent/15 to-surface p-4"
      >
        <p className="text-[10px] font-extrabold tracking-[0.08em] text-accent">자동 설정</p>
        <h2 className="text-sm font-black text-text">무게와 휴식도 미리 맞춰드려요</h2>
        <p className="mt-2 text-xs leading-5 text-muted">
          최근 기록을 바탕으로 8–10회 수행할 수 있는 무게를 먼저 제안하고, 종목별 휴식 시간을 자동으로 설정합니다. 운동 중에는 언제든 직접 바꿀 수 있어요.
        </p>
      </section>

      {program.key === "lean-body-6w" && (
        <p className="mt-3 rounded-card border border-line bg-surface p-4 text-xs leading-5 text-muted">
          운동만으로 감량을 보장하지 않으며 식사와 일상 활동량을 함께 관리할 때 체지방 관리에 도움이 됩니다.
        </p>
      )}

      <aside role="note" className="mt-4 rounded-card-sm border border-line/70 px-3 py-3 text-xs leading-5 text-muted">
        <span className="font-bold text-text">안전 안내 · </span>
        통증이 느껴지면 운동을 중단하고, 기존 질환이나 부상이 있다면 전문가의 안내를 먼저 받으세요.
      </aside>

      {scheduleAvailable && (
        <div
          className="pointer-events-none fixed inset-x-0 z-30 px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        >
          <button
            type="button"
            onClick={onSchedule}
            className="pointer-events-auto mx-auto block min-h-12 w-full max-w-3xl rounded-card bg-accent px-4 text-sm font-black text-accent-ink shadow-card"
          >
            요일과 시간 정하기
          </button>
        </div>
      )}
    </article>
  );
}
