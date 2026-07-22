"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { NotificationBell } from "@/components/notification-bell";
import { PushEnableCard } from "@/components/push-enable-card";
import { CrewLatestWorkout } from "@/components/crew-latest-workout";
import { StreakCard } from "@/components/home/streak-card";
import { WeeklyStats } from "@/components/home/weekly-stats";
import { KingCard } from "@/components/home/king-card";
import { CharacterCard } from "@/components/home/character-card";
import { getMyProfile } from "@/lib/crew";
import { getMyRecordViewAts } from "@/lib/social";
import { getCompletedSessions } from "@/lib/workout";
import { getProgressSummary, type ProgressSummary } from "@/lib/progression";

/** 홈 전체 — 내 완료 세션을 한 번만 조회해 위젯들이 공유한다 */
export function HomeClient() {
  const { userId, loading, configured } = useAuth();
  const [completedAts, setCompletedAts] = useState<Date[] | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [viewAts, setViewAts] = useState<Date[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [sessions, profile, views] = await Promise.all([
          getCompletedSessions(userId),
          getMyProfile(userId),
          getMyRecordViewAts(userId),
        ]);
        if (cancelled) return;
        setCompletedAts(sessions.map((s) => s.completedAt));
        if (profile) setWeeklyGoal(profile.weekly_goal);
        setViewAts(views);
      } catch {
        if (!cancelled) setCompletedAts([]);
      }
    })();
    // 성장 카드는 별도 조회 — 실패해도 홈의 다른 기능은 유지(修正14)
    (async () => {
      try {
        const s = await getProgressSummary();
        if (!cancelled) {
          setSummary(s);
          setSummaryError(false);
        }
      } catch {
        if (!cancelled) setSummaryError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId, refreshKey]);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">GND</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            오늘도 GND 탈출하자 🔥
          </p>
        </div>
        <NotificationBell />
      </header>

      <Link
        href="/record"
        className="block rounded-[22px] bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card"
      >
        <p className="text-xs font-bold opacity-80">오늘의 운동</p>
        <h2 className="mt-1 text-xl font-extrabold">운동 시작하기</h2>
        <p className="mt-1 text-sm opacity-90">
          30초면 기록할 수 있어요. 친구들이 기다리고 있어요.
        </p>
      </Link>

      <PushEnableCard />

      {completedAts && (
        <>
          <StreakCard completedAts={completedAts} />
          <WeeklyStats completedAts={completedAts} weeklyGoal={weeklyGoal} />
        </>
      )}

      <ActiveWorkoutCards />

      <CrewCard />

      {completedAts && (
        <KingCard
          completedAts={completedAts}
          viewAts={viewAts}
          onViewed={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {summary && <CharacterCard summary={summary} />}
      {summaryError && (
        <p className="rounded-card-sm border border-line bg-surface px-3 py-2.5 text-xs text-muted">
          성장 정보를 불러오지 못했어요.
        </p>
      )}

      <div className="mt-1 flex items-center justify-between px-0.5">
        <h3 className="text-sm font-extrabold">최근 친구 활동</h3>
        <Link href="/feed" className="text-xs font-bold text-accent">
          피드 전체
        </Link>
      </div>
      <CrewLatestWorkout />

      <AuthStatus />
    </div>
  );
}
