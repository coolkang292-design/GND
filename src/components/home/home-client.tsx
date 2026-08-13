"use client";

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
import { StartWorkoutCta } from "@/components/home/start-workout-cta";
import { CharacterCard } from "@/components/home/character-card";
import { ChallengeSummaryCard } from "@/components/home/challenge-summary-card";
import { getMyProfile } from "@/lib/crew";
import {
  getMyChallenges,
  getMyChallengeScore,
  getMyWeeklyGoalDays,
  type MyChallenge,
  type MyChallengeScore,
} from "@/lib/challenge";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";
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
  // 챌린지 요약의 재료. `null` = 아직 조회 전 — 빈 상태가 번쩍이지 않게 구별한다.
  const [challenges, setChallenges] = useState<MyChallenge[] | null>(null);
  // ⚠️ 챌린지 요약 **전용** 타임존이다. 홈의 다른 위젯(스트릭·주간 통계)은 여전히
  //    `DEFAULT_TIMEZONE`을 쓴다 — 홈 전체의 타임존 통일은 별도 과제다(설계 §9).
  const [timeZone, setTimeZone] = useState(DEFAULT_TIMEZONE);
  // 챌린지 카드의 진행률·종합점수. `null` = 아직 안 왔다 → 화면은 `—`를 그린다.
  const [challengeScore, setChallengeScore] = useState<MyChallengeScore | null>(
    null,
  );
  // 진행 중 세션은 진행 중 카드와 친구 목록이 같이 쓴다 — 한 번만 조회한다.
  const [activeSessions, setActiveSessions] = useState<ActiveCrewSession[]>([]);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [sessions, profile, goalDays, myChallenges] = await Promise.all([
          getCompletedSessions(userId),
          getMyProfile(userId),
          // ⚠️ `profile.weekly_goal`이 아니다. 그 값은 아무도 못 바꾼다 —
          //    주간 기준은 진행 중 챌린지에서 온다(설계: 2026-08-08 결정).
          getMyWeeklyGoalDays(userId).catch(() => null),
          // ⚠️⚠️ **`.catch`를 떼지 마라.** `Promise.all`은 하나가 던지면 전부
          //    실패해서 아래 `catch`가 `completedAts`를 `[]`로 떨어뜨린다 —
          //    챌린지 조회 실패 하나로 **스트릭·주간 통계·친구 목록의 내 행이
          //    통째로 사라진다.** 바로 위 `getMyWeeklyGoalDays`가 같은 이유로
          //    달고 있다. 챌린지 요약은 부가 정보라 없으면 카드만 안 그리면 된다.
          getMyChallenges(userId).catch(() => []),
        ]);
        if (cancelled) return;
        setCompletedAts(sessions.map((s) => s.completedAt));
        setWeeklyGoal(goalDays);
        setChallenges(myChallenges);
        if (profile) {
          setMyName({
            nickname: profile.nickname,
            avatarUrl: profile.avatar_url,
          });
          // ⚠️ 챌린지 요약의 D-day는 **챌린지 탭과 같은 타임존**으로 재야 한다.
          //    탭은 `profile.timezone`을 쓰는데 홈이 `DEFAULT_TIMEZONE`으로 재면
          //    해외 사용자에게 같은 챌린지가 D-15와 D-14로 갈린다(설계 §4.4).
          //    이미 부른 응답에서 꺼내므로 조회는 늘지 않는다.
          if (profile.timezone) setTimeZone(profile.timezone);
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

  /**
   * 홈 챌린지 카드의 점수 (2026-08-13 사용자 지시 — 목업대로 진행률·종합점수 표시).
   *
   * ⚠️ **위 `Promise.all`에 넣지 않았다.** 조회가 2건 더 들고, 대표 챌린지를 안 뒤에야
   * 부를 수 있어서 넣으면 홈 전체가 그만큼 늦게 그려진다. 카드는 이름·D-day를 먼저
   * 그리고 숫자만 나중에 채운다 — 그동안 `—`가 자리를 지킨다.
   *
   * ⚠️ 실패해도 조용히 넘긴다. 점수를 못 받은 것이 챌린지 카드를 통째로 없앨 이유는
   * 아니다(이름·기한은 이미 손에 있다).
   */
  const primaryActive = useMemo(
    () =>
      challenges
        ? pickPrimaryRow(
            challenges.filter(
              (c) => c.status === "active" && c.myStatus === "joined",
            ),
          )
        : null,
    [challenges],
  );

  useEffect(() => {
    if (!userId || !primaryActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getMyChallengeScore({
          userId,
          challengeId: primaryActive.id,
          startDate: primaryActive.start_date,
          endDate: primaryActive.end_date,
          timeZone,
        });
        if (!cancelled) setChallengeScore(s);
      } catch {
        /* 점수는 부가 정보다 — 실패해도 카드는 이름·기한으로 남는다 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, primaryActive, timeZone]);

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

      {/* ⚠️ **홈의 첫 카드가 친구 목록 + 운동 시작하기다** (2026-08-13 개편).
          설계: `docs/superpowers/specs/2026-08-13-home-today-card-and-challenge-cta-design.md`

          옛 배치는 최상단에 `운동 시작하기` 단독 블록을 두고 친구 목록을 8번째에
          뒀다. **운동할 이유(친구가 오늘 했는가)와 운동하는 수단 사이에 카드가
          5개** 끼어 있었다 — 이유를 본 순간 누를 것이 없었다.

          ⚠️ 옛 단독 CTA 블록을 되살리지 마라. 홈에 `운동 시작하기`가 둘이 된다.
          CTA는 이제 카드 **안**에서 조회 상태와 무관하게 그려진다(설계 §4.1). */}
      <FriendBoardCard
        activeUserIds={activeUserIds}
        iWorkedOut={iWorkedOutToday}
        me={me}
        cta={<StartWorkoutCta />}
      />

      {/* ⚠️ 진행 중 카드가 친구 목록 **아래**로 내려왔다 (2026-08-13). 옛 주석은
          "친구 목록은 진행 중 카드 바로 아래"였는데 위아래가 뒤집혔다. 읽는 순서는
          그대로 이어진다 — 친구 행의 `운동 중` 알약을 보고 바로 아래에서 그 사람의
          진행 중 카드를 만난다. 세션이 없으면 아무것도 그리지 않는다. */}
      <ActiveWorkoutCards sessions={activeSessions} />

      {/* 진행 중 챌린지 요약 — **이름·기한만** 적는다. 달성률·참여율·종합점수는
          챌린지 탭에만 둔다(설계 §4.3). 진행 중인 것이 없으면 함께하기를 권한다. */}
      <ChallengeSummaryCard
        challenges={challenges}
        timeZone={timeZone}
        score={challengeScore}
      />

      {/* 성장 카드 — 레벨을 눈에 띄게 두되, 행동(위)보다는 뒤다.
          챌린지 성과 카드는 2026-08-07에 챌린지 탭으로 옮겼다(설계 §6.7). */}
      {summary && <CharacterCard summary={summary} />}
      {summaryError && (
        <p className="rounded-card-sm border border-line bg-surface px-3 py-2.5 text-xs text-muted">
          성장 정보를 불러오지 못했어요.
        </p>
      )}

      {completedAts && (
        <>
          <StreakCard completedAts={completedAts} />
          <WeeklyStats completedAts={completedAts} weeklyGoal={weeklyGoal} />
        </>
      )}

      <PushEnableCard />

      <CrewCard />

      <AuthStatus />
    </div>
  );
}
