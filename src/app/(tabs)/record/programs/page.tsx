"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ProgramFlow } from "@/components/programs/program-flow";
import { OFFICIAL_PROGRAMS } from "@/lib/domain/official-programs";
import { resolveTimeZone } from "@/lib/domain/time";
import {
  cancelProgramEnrollment,
  createIntervalProgramEnrollment,
  createLadderProgramEnrollment,
  createProgramEnrollment,
  getActiveProgramEnrollments,
  type CreateIntervalEnrollmentInput,
  type CreateProgramEnrollmentInput,
  type ProgramEnrollment,
} from "@/lib/programs";
import { ladderLabel, ladderRepsForDay } from "@/lib/domain/pullup-ladder";
import type { CatalogExercise } from "@/lib/types";
import { getExerciseCatalog } from "@/lib/workout";

type PageReference = {
  today: string;
  timeZone: string;
};

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

function firstPlanSummary(
  input: CreateProgramEnrollmentInput | CreateIntervalEnrollmentInput,
) {
  const first = input.schedule[0];
  const session = input.sessions.find((item) => item.key === first.templateKey);
  return {
    date: first.date,
    time: localTime(first.scheduledAt, input.timeZone),
    title: session?.title ?? input.program.title,
  };
}

export default function ProgramsPage() {
  const { userId, loading, configured, error } = useAuth();
  const [pageRef] = useState<PageReference>(() => {
    const timeZone =
      resolveTimeZone();
    return { today: localDateKey(new Date(), timeZone), timeZone };
  });
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    /*
      계획 전량 조회를 뺐다 (0101). 일정을 짤 때 기존 계획을 **피해 다니던**
      것이 없어져서, 이 화면이 계획 목록으로 하는 일이 하나도 남지 않았다.
      들고만 있는 상태는 다음 사람에게 "무언가에 쓰이겠지"라고 거짓말을 한다.
    */
    Promise.all([getExerciseCatalog(), getActiveProgramEnrollments(userId)])
      .then(([nextCatalog, nextEnrollments]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setEnrollments(nextEnrollments);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("프로그램 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  if (!configured) {
    return <p className="pt-10 text-center text-sm text-muted">Supabase 설정(.env.local)이 필요해요.</p>;
  }
  if (loading || !ready) {
    return <p className="pt-10 text-center text-sm text-muted">프로그램을 불러오는 중…</p>;
  }
  if (!userId) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        익명 인증에 실패했어요{error ? ` — ${error}` : ""}.
      </p>
    );
  }
  if (loadError) {
    return <p role="alert" className="rounded-card border border-line bg-surface p-4 text-sm text-warn">{loadError}</p>;
  }

  return (
    <ProgramFlow
      today={pageRef.today}
      timeZone={pageRef.timeZone}
      programs={OFFICIAL_PROGRAMS}
      catalog={catalog}
      activeEnrollments={enrollments}
      onCreate={async (input) => ({
        enrollmentId: await createProgramEnrollment(input),
        nextPlan: firstPlanSummary(input),
      })}
      onCancel={async (enrollmentId) => {
        const removed = await cancelProgramEnrollment(enrollmentId);
        // 목록에서도 빼야 카탈로그가 다시 등록을 받는다
        setEnrollments((current) =>
          current.filter((item) => item.id !== enrollmentId),
        );
        return removed;
      }}
      onCreateInterval={async (input) => ({
        enrollmentId: await createIntervalProgramEnrollment(input),
        nextPlan: firstPlanSummary(input),
      })}
      onCreateLadder={async (input) => ({
        enrollmentId: await createLadderProgramEnrollment(input),
        // 사다리는 회차 템플릿이 없다 — 첫 회차 제목은 1일차 사다리 그 자체다
        nextPlan: {
          date: input.schedule[0].date,
          time: localTime(input.schedule[0].scheduledAt, input.timeZone),
          title: `1일차 · ${ladderLabel([...ladderRepsForDay(input.maxReps, 1)])}`,
        },
      })}
    />
  );
}
