"use client";

import Image from "next/image";
import { useState } from "react";
import type {
  OfficialProgram,
  OfficialProgramKey,
} from "@/lib/domain/official-programs";

type ProgramCatalogProps = {
  programs: readonly OfficialProgram[];
  onPick: (key: OfficialProgramKey) => void;
};

type ProgramDetailProps = {
  program: OfficialProgram;
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
    "회복일이 포함된 일정이 필요한 사람",
  ],
  "lean-body-6w": [
    "근육을 지키며 체지방 관리 습관을 만들고 싶은 사람",
    "근력 운동과 전신 활동을 함께 이어가고 싶은 사람",
    "짧은 성과보다 반복 가능한 6주 계획이 필요한 사람",
  ],
};

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
      className={`relative overflow-hidden bg-bg ${
        featured ? "h-40" : "h-28"
      }`}
      aria-hidden="true"
    >
      <Image
        src={program.coverImage}
        alt=""
        fill
        sizes={featured ? "(max-width: 480px) 100vw, 430px" : "(max-width: 480px) 50vw, 210px"}
        onError={() => setFailed(true)}
        className={`object-cover transition-opacity ${failed ? "opacity-0" : "opacity-100"}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
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
      onClick={() => onPick(program.key)}
      className="w-full overflow-hidden rounded-card border border-line bg-surface text-left shadow-card"
    >
      <ProgramCover program={program} featured={featured} />
      <span className={`block ${featured ? "p-4" : "p-3"}`}>
        <span className="block text-sm font-black leading-5 text-text">
          {program.eyebrow}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {program.title}
        </span>
        <span className="mt-2 block text-[11px] font-bold text-accent">
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
    <section aria-labelledby="program-catalog-title">
      <h1 id="program-catalog-title" className="text-xl font-black text-text">
        목표를 고르면 6주 계획이 완성돼요
      </h1>
      <p className="mt-1 text-xs leading-5 text-muted">
        모든 프로그램은 주 3회, 총 18회로 구성됩니다.
      </p>

      <div className="mt-4">
        <ProgramCard program={featured} featured onPick={onPick} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {rest.map((program) => (
          <ProgramCard key={program.key} program={program} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export function ProgramDetail({
  program,
  onBack,
  onSchedule,
  scheduleAvailable = true,
}: ProgramDetailProps) {
  const firstSession = program.sessions[0];

  return (
    <article className="pb-28">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 min-h-11 text-sm font-bold text-muted"
      >
        ← 프로그램 목록으로
      </button>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <ProgramCover program={program} featured />
        <div className="p-4">
          <p className="text-xs font-extrabold text-accent">GND 공식 프로그램</p>
          <h1 className="mt-1 text-xl font-black text-text">{program.eyebrow}</h1>
          <p className="mt-1 text-sm font-bold text-text">{program.title}</p>
          <p className="mt-2 text-xs text-muted">
            주 {program.sessionsPerWeek}회 · {program.weeks}주 · 18회 · 회당 {program.durationMinutes[0]}–{program.durationMinutes[1]}분
          </p>
        </div>
      </div>

      <section className="mt-4 rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-black text-text">이런 사람에게 맞아요</h2>
        <ul className="mt-2 space-y-2 text-xs leading-5 text-muted">
          {AUDIENCE[program.key].map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-3 rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-black text-text">전신은 지키고, 목표 부위는 더 집중해요</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{program.description}</p>
      </section>

      <section className="mt-3 rounded-card border border-line bg-surface p-4">
        <h2 className="text-sm font-black text-text">A회차 미리보기</h2>
        <p className="mt-1 text-xs font-bold text-accent">{firstSession.title}</p>
        <ol className="mt-2 space-y-2 text-xs leading-5 text-muted">
          {firstSession.exercises.map((exercise) => (
            <li key={exercise.exerciseName}>
              {exercise.exerciseName} · {exercise.repsMin}–{exercise.repsMax}회 · 휴식 {exercise.restSeconds}초
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-3 rounded-card border border-accent/45 bg-accent/10 p-4">
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

      <p className="mt-3 text-xs leading-5 text-muted">
        통증이 느껴지면 운동을 중단하고, 기존 질환이나 부상이 있다면 전문가의 안내를 먼저 받으세요.
      </p>

      {scheduleAvailable && (
        <div
          className="fixed inset-x-0 z-30 px-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
        >
          <button
            type="button"
            onClick={onSchedule}
            className="mx-auto block min-h-12 w-full max-w-md rounded-card bg-accent px-4 text-sm font-black text-accent-ink shadow-card"
          >
            요일과 시간 정하기
          </button>
        </div>
      )}
    </article>
  );
}
