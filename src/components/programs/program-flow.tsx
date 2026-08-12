"use client";

import Link from "next/link";
import { useState } from "react";
import {
  resolveProgram,
  type OfficialProgram,
  type OfficialProgramKey,
} from "@/lib/domain/official-programs";
import type {
  CreateProgramEnrollmentInput,
  ProgramEnrollment,
  ResolvedProgramSession,
} from "@/lib/programs";
import type { CatalogExercise } from "@/lib/types";
import type { WorkoutPlan } from "@/lib/workout-plan";
import { ProgramCatalog, ProgramDetail } from "./program-catalog";
import { ProgramScheduleSetup } from "./program-schedule-setup";

type ProgramFlowStep = "catalog" | "detail" | "schedule" | "done";

type CreateResult = {
  enrollmentId: string;
  nextPlan: { date: string; time: string; title: string };
};

type ProgramFlowProps = {
  today: string;
  timeZone: string;
  programs: readonly OfficialProgram[];
  catalog: readonly CatalogExercise[];
  occupiedPlans: readonly WorkoutPlan[];
  activeEnrollments?: readonly ProgramEnrollment[];
  onCreate: (input: CreateProgramEnrollmentInput) => Promise<CreateResult>;
};

function dateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function timeLabel(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, "0")}`;
}

export function ProgramFlow({
  today,
  timeZone,
  programs,
  catalog,
  occupiedPlans,
  activeEnrollments = [],
  onCreate,
}: ProgramFlowProps) {
  const [step, setStep] = useState<ProgramFlowStep>("catalog");
  const [selectedKey, setSelectedKey] = useState<OfficialProgramKey | null>(null);
  const [resolvedSessions, setResolvedSessions] = useState<
    readonly ResolvedProgramSession[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const selected = programs.find((program) => program.key === selectedKey) ?? null;
  const activeEnrollment = selected
    ? activeEnrollments.find(
        (enrollment) =>
          enrollment.programKey === selected.key &&
          enrollment.programVersion === selected.version &&
          enrollment.status === "active",
      )
    : null;

  function pickProgram(key: OfficialProgramKey) {
    setSelectedKey(key);
    setResolvedSessions(null);
    setLoadError(null);
    setStep("detail");
  }

  function openSchedule() {
    if (!selected) return;
    try {
      setResolvedSessions(resolveProgram(selected, catalog));
      setLoadError(null);
      setStep("schedule");
    } catch {
      setLoadError(
        "프로그램 운동 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  if (step === "catalog") {
    return <ProgramCatalog programs={programs} onPick={pickProgram} />;
  }

  if (step === "done" && created) {
    return (
      <section className="pt-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-accent bg-accent/10 text-2xl text-accent">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-black text-text">6주 계획이 준비됐어요</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          첫 운동은 {dateLabel(created.nextPlan.date)} {timeLabel(created.nextPlan.time)}
          <br />
          {created.nextPlan.title}부터 시작합니다.
        </p>
        <Link
          href="/record"
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-card bg-accent text-sm font-black text-accent-ink"
        >
          달력에서 계획 보기
        </Link>
      </section>
    );
  }

  if (!selected) {
    return <ProgramCatalog programs={programs} onPick={pickProgram} />;
  }

  if (step === "detail") {
    if (activeEnrollment) {
      return (
        <section>
          <ProgramDetail
            program={selected}
            onBack={() => setStep("catalog")}
            onSchedule={() => {}}
            scheduleAvailable={false}
          />
          <div
            className="fixed inset-x-0 z-40 px-4"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
          >
            <Link
              href="/record"
              className="mx-auto flex min-h-12 w-full max-w-md items-center justify-center rounded-card bg-accent text-sm font-black text-accent-ink shadow-card"
            >
              진행 중인 프로그램 보기
            </Link>
          </div>
        </section>
      );
    }

    return (
      <>
        <ProgramDetail
          program={selected}
          onBack={() => setStep("catalog")}
          onSchedule={openSchedule}
        />
        {loadError && (
          <p
            role="alert"
            className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-card border border-line bg-surface p-3 text-xs font-bold text-warn shadow-card"
          >
            {loadError}
          </p>
        )}
      </>
    );
  }

  if (!resolvedSessions) {
    return (
      <p role="alert" className="rounded-card border border-line bg-surface p-4 text-sm text-warn">
        프로그램 운동 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <ProgramScheduleSetup
      today={today}
      timeZone={timeZone}
      program={selected}
      resolvedSessions={resolvedSessions}
      occupiedPlans={occupiedPlans}
      onConfirm={async (input) => {
        const result = await onCreate(input);
        setCreated(result);
        setStep("done");
      }}
    />
  );
}
