"use client";

import Link from "next/link";
import { useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import {
  isIntervalProgram,
  resolveIntervalProgram,
  resolveProgram,
  PROGRAM_LEVELS,
  type OfficialProgram,
  type OfficialProgramKey,
} from "@/lib/domain/official-programs";
import type {
  CreateIntervalEnrollmentInput,
  CreateProgramEnrollmentInput,
  ProgramEnrollment,
  ResolvedProgramSession,
} from "@/lib/programs";
import type { CatalogExercise } from "@/lib/types";
import type { WorkoutPlan } from "@/lib/workout-plan";
import {
  IntervalProgramDetail,
  ProgramCatalog,
  ProgramDetail,
} from "./program-catalog";
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
  /** 인터벌 등록은 회차 모양이 달라 RPC payload도 다르다 (0070) */
  onCreateInterval: (
    input: CreateIntervalEnrollmentInput,
  ) => Promise<CreateResult>;
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
  onCreateInterval,
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
      if (isIntervalProgram(selected)) {
        // 난이도는 다음 화면에서 고른다. 여기서는 **세 난이도가 모두**
        // 카탈로그로 합쳐지는지만 미리 본다 — 등록 직전에 터지지 않도록.
        for (const level of PROGRAM_LEVELS) {
          resolveIntervalProgram(selected, level, catalog);
        }
        setResolvedSessions(null);
      } else {
        setResolvedSessions(resolveProgram(selected, catalog));
      }
      setLoadError(null);
      setStep("schedule");
    } catch {
      setLoadError(
        "프로그램 운동 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  if (step === "catalog") {
    return (
      <ProgramCatalog programs={programs} onPick={pickProgram} />
    );
  }

  if (step === "done" && created) {
    return (
      <section className="mx-auto w-full max-w-2xl pt-8 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-accent/55 bg-accent/10">
          <UiIcon name="finish" size={64} />
        </div>
        <p className="mt-5 text-[11px] font-extrabold tracking-[0.08em] text-accent">등록 완료</p>
        <h1 className="mt-1 text-2xl font-black leading-8 text-text">6주 계획이 준비됐어요</h1>
        <p className="mt-2 text-sm leading-6 text-muted">이제 첫 운동만 시작하면 됩니다.</p>

        <div className="mt-6 rounded-[22px] border border-accent/45 bg-gradient-to-br from-accent/15 to-surface p-5 text-left shadow-card">
          <p className="text-xs font-extrabold text-accent">다음 운동</p>
          <p className="mt-2 text-lg font-black text-text">
            {dateLabel(created.nextPlan.date)} · {timeLabel(created.nextPlan.time)}
          </p>
          <p className="mt-1 text-sm font-bold text-muted">
            1주차 A회 · {created.nextPlan.title}
          </p>
        </div>
        <Link
          href="/record"
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-card bg-accent text-sm font-black text-accent-ink shadow-card"
        >
          달력에서 계획 확인하기
        </Link>
      </section>
    );
  }

  if (!selected) {
    return (
      <ProgramCatalog programs={programs} onPick={pickProgram} />
    );
  }

  if (step === "detail") {
    if (activeEnrollment) {
      return (
        <section>
          {isIntervalProgram(selected) ? (
            <IntervalProgramDetail
              program={selected}
              onBack={() => setStep("catalog")}
              onSchedule={() => {}}
              scheduleAvailable={false}
            />
          ) : (
            <ProgramDetail
              program={selected}
              onBack={() => setStep("catalog")}
              onSchedule={() => {}}
              scheduleAvailable={false}
            />
          )}
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
        {isIntervalProgram(selected) ? (
          <IntervalProgramDetail
            program={selected}
            onBack={() => setStep("catalog")}
            onSchedule={openSchedule}
          />
        ) : (
          <ProgramDetail
            program={selected}
            onBack={() => setStep("catalog")}
            onSchedule={openSchedule}
          />
        )}
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

  if (!isIntervalProgram(selected) && !resolvedSessions) {
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
      occupiedPlans={occupiedPlans}
      onConfirm={async (choice) => {
        /*
          회차 종목은 **여기서** 합친다.

          인터벌은 난이도가 종목을 정한다(설계 §3.3). 상세 화면에서 미리
          합쳐 두면 사용자가 다음 화면에서 난이도를 바꿔도 종목이 안 바뀐다.
        */
        const result = isIntervalProgram(selected)
          ? await onCreateInterval({
              program: selected,
              sessions: resolveIntervalProgram(
                selected,
                choice.levelAtStart,
                catalog,
              ),
              schedule: choice.schedule,
              levelAtStart: choice.levelAtStart,
              startDate: choice.startDate,
              timeZone: choice.timeZone,
              preferredSlots: choice.preferredSlots,
            })
          : await onCreate({
              program: selected,
              sessions: resolvedSessions ?? [],
              schedule: choice.schedule,
              // 근력은 선택지가 두 개뿐이다 — 화면이 moderate를 주지 않는다
              levelAtStart:
                choice.levelAtStart === "moderate"
                  ? (() => {
                      throw new Error("program_invalid_level");
                    })()
                  : choice.levelAtStart,
              startDate: choice.startDate,
              timeZone: choice.timeZone,
              preferredSlots: choice.preferredSlots,
            });
        setCreated(result);
        setStep("done");
      }}
    />
  );
}
