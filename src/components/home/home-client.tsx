"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { NotificationBell } from "@/components/notification-bell";
import { PushEnableCard } from "@/components/push-enable-card";
import { StreakCard } from "@/components/home/streak-card";
import { WeeklyStats } from "@/components/home/weekly-stats";
import { FriendBoardCard } from "@/components/home/friend-board-card";
import { CharacterCard } from "@/components/home/character-card";
import { getMyProfile } from "@/lib/crew";
import { getMyWeeklyGoalDays } from "@/lib/challenge";
import { getCompletedSessions } from "@/lib/workout";
import { getActiveCrewSessions, type ActiveCrewSession } from "@/lib/social";
import { getProgressSummary, type ProgressSummary } from "@/lib/progression";
import { workedOutToday } from "@/lib/domain/friend-board";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";

const NO_ACTIVE_IDS: Set<string> = new Set();

/** 홈 전체 — 내 완료 세션을 한 번만 조회해 위젯들이 공유한다 */
export function HomeClient() {
  const { userId, loading, configured } = useAuth();
  const [completedAts, setCompletedAts] = useState<Date[] | null>(null);
  // ⚠️ 기본 숫자를 넣지 마라. `null` = "챌린지에서 아직 안 정했다"이고, 화면은
  //    그때 분모를 안 그린다 (2026-08-08 사용자 결정 — weekly-stats.tsx 주석).
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  // 친구 목록의 내 행에 쓴다 — 이미 부르는 `getMyProfile` 응답에서 꺼낸다.
  const [myName, setMyName] = useState<{
    nickname: string;
    avatarUrl: string | null;
  } | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  // 진행 중 세션은 진행 중 카드와 친구 목록이 같이 쓴다 — 한 번만 조회한다.
  const [activeSessions, setActiveSessions] = useState<ActiveCrewSession[]>([]);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [sessions, profile, goalDays] = await Promise.all([
          getCompletedSessions(userId),
          getMyProfile(userId),
          // ⚠️ `profile.weekly_goal`이 아니다. 그 값은 아무도 못 바꾼다 —
          //    주간 기준은 진행 중 챌린지에서 온다(설계: 2026-08-08 결정).
          getMyWeeklyGoalDays(userId).catch(() => null),
        ]);
        if (cancelled) return;
        setCompletedAts(sessions.map((s) => s.completedAt));
        setWeeklyGoal(goalDays);
        if (profile) {
          setMyName({
            nickname: profile.nickname,
            avatarUrl: profile.avatar_url,
          });
        }
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
  }, [configured, loading, userId]);

  // 진행 중 세션 — 60초 폴링은 여기 한 곳에만 둔다(옛날엔 진행 중 카드가 했다).
  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    async function load() {
      try {
        const active = await getActiveCrewSessions(userId!);
        if (!cancelled) setActiveSessions(active);
      } catch {
        /* 부가 정보 — 실패해도 화면을 막지 않는다 */
      }
    }
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [configured, loading, userId]);

  const activeUserIds = useMemo(
    () =>
      activeSessions.length === 0
        ? NO_ACTIVE_IDS
        : new Set(activeSessions.map((s) => s.userId)),
    [activeSessions],
  );

  // 콕 활성 조건. `completedAts`는 필터가 없는 내 전체 기록이라 서버 규칙과 같다
  // — 판정 이유는 `workedOutToday` 주석 참조.
  const iWorkedOutToday = useMemo(
    () =>
      completedAts
        ? workedOutToday(completedAts, new Date(), DEFAULT_TIMEZONE)
        : false,
    [completedAts],
  );

  /**
   * 친구 목록 맨 위에 그릴 내 행의 재료 (2026-08-07 사용자 지시).
   *
   * ⚠️ **홈이 이미 부른 두 조회에서 꺼낸다** — 닉네임·아바타는 `getMyProfile`,
   * `totalXp`는 성장 카드가 쓰는 `getProgressSummary`. 친구 목록 카드 안에서 다시
   * 부르면 홈에서 같은 질의가 두 번 나간다.
   *
   * ⚠️ `totalXp`를 넘기는 것이지 레벨을 넘기는 게 아니다. 레벨은 받는 쪽이
   * `getLevelProgress`로 다시 계산한다 — 친구와 **같은 함수**를 지나야 같은 사람이
   * 화면마다 다른 레벨로 보이지 않는다(인수인계서 §5.4).
   */
  const me = useMemo(
    () =>
      userId && myName && summary
        ? {
            id: userId,
            nickname: myName.nickname,
            avatarUrl: myName.avatarUrl,
            totalXp: summary.totalXp,
          }
        : null,
    [userId, myName, summary],
  );

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

      {/* 성장 카드는 "운동 시작하기" 바로 아래로 — 레벨을 눈에 먼저 띄운다 */}
      {summary && <CharacterCard summary={summary} />}
      {summaryError && (
        <p className="rounded-card-sm border border-line bg-surface px-3 py-2.5 text-xs text-muted">
          성장 정보를 불러오지 못했어요.
        </p>
      )}

      <PushEnableCard />

      {completedAts && (
        <>
          <StreakCard completedAts={completedAts} />
          <WeeklyStats completedAts={completedAts} weeklyGoal={weeklyGoal} />
        </>
      )}

      <ActiveWorkoutCards sessions={activeSessions} />

      {/* 친구 목록은 진행 중 카드 바로 아래 — "운동 중"이 위에서 아래로 이어 읽힌다.
          챌린지 성과 카드는 2026-08-07에 챌린지 탭으로 옮겼다(설계 §6.7). */}
      <FriendBoardCard
        activeUserIds={activeUserIds}
        iWorkedOut={iWorkedOutToday}
        me={me}
      />

      <CrewCard />

      <AuthStatus />
    </div>
  );
}
