"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AuthStatus } from "@/components/auth-status";
import { CrewCard } from "@/components/crew-card";
import { ActiveWorkoutCards } from "@/components/feed/active-workout-cards";
import { NotificationBell } from "@/components/notification-bell";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import { PushEnableCard } from "@/components/push-enable-card";
import { FriendBoardCard } from "@/components/home/friend-board-card";
import {
  PersonalTodayCard,
  PersonalTodayCardSkeleton,
} from "@/components/home/personal-today-card";
import { ChallengeSummaryCard } from "@/components/home/challenge-summary-card";
import { getMyProfile } from "@/lib/crew";
import { getFriendBadges } from "@/lib/friends";
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
import { resolvePersonalTodayStatus } from "@/lib/domain/home-competition";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";

const NO_ACTIVE_IDS: Set<string> = new Set();

/** 홈 전체 — 내 완료 세션을 한 번만 조회해 위젯들이 공유한다 */
export function HomeClient() {
  const { userId, loading, configured } = useAuth();
  const [completedAts, setCompletedAts] = useState<Date[] | null>(null);
  // ⚠️ 기본 숫자를 넣지 마라. `null` = "챌린지에서 아직 안 정했다"이고, 화면은
  //    그때 분모 대신 `목표 정하기 ›`를 그린다 (2026-08-08 사용자 결정 —
  //    `personal-today-card.tsx`의 `hasGoal` 갈래).
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  // 내 카드의 이름·아바타 — 이미 부르는 `getMyProfile` 응답에서 꺼낸다.
  const [myName, setMyName] = useState<{
    nickname: string;
    avatarUrl: string | null;
  } | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  /**
   * 내 배지 종류 수 (2026-08-21 사용자 지시로 내 카드에 복원).
   *
   * ⚠️ `null` = 아직 안 왔거나 실패. 카드가 `0`과 구별해 `—`를 그린다.
   *
   * ⚠️ 개수 정의를 손으로 다시 쓰지 않고 `getFriendBadges`를 그대로 쓴다 —
   * 크루 프로필 시트의 "보유 배지 N / M"과 **같은 함수**라 두 화면의 숫자가
   * 어긋날 수 없다(`lib/friends.ts` 주석).
   */
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  // 챌린지 요약의 재료. `null` = 아직 조회 전 — 빈 상태가 번쩍이지 않게 구별한다.
  const [challenges, setChallenges] = useState<MyChallenge[] | null>(null);
  // ⚠️ 챌린지 요약 **전용** 타임존이다. 홈의 다른 위젯(스트릭·주간 통계)은 여전히
  //    `DEFAULT_TIMEZONE`을 쓴다 — 홈 전체의 타임존 통일은 별도 과제다(설계 §9).
  const [timeZone, setTimeZone] = useState(DEFAULT_TIMEZONE);
  // 챌린지 카드의 진행률·종합점수. `null` = 아직 안 왔다 → 화면은 `—`를 그린다.
  const [challengeScore, setChallengeScore] = useState<MyChallengeScore | null>(
    null,
  );
  // 진행 중 세션은 진행 중 카드와 크루 목록이 같이 쓴다 — 한 번만 조회한다.
  const [activeSessions, setActiveSessions] = useState<ActiveCrewSession[]>([]);
  /**
   * 홈이 한 번 만드는 기준 시각.
   *
   * ⚠️ 위젯마다 `new Date()`를 부르면 자정 언저리에 헤더·내 카드·크루 행이 서로
   * 다른 "오늘"을 쓴다. 렌더마다 새로 만들지 않도록 `useState` 초기화로 못 박는다.
   */
  const [dateRef] = useState(() => new Date());
  /**
   * 내 성과 시트 (2026-08-21 사용자 지시 — "다른 크루와 동일한 화면으로").
   *
   * ⚠️ 홈이 소유한다. 카드 안에서 열면 카드가 조회·상태를 갖게 되는데, 그 카드는
   * "홈이 이미 부른 값만 받아 그린다"는 규약으로 만들어졌다(크루 카드도 같다).
   */
  const [selfProfileOpen, setSelfProfileOpen] = useState(false);

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
    // 성장 요약은 별도 조회 — 실패해도 홈의 다른 기능은 유지(修正14)
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
    /**
     * 배지 개수도 별도 조회다.
     *
     * ⚠️ 위 `Promise.all`에 넣지 마라. 카탈로그 + RPC로 2건이 더 들고, 이 값이
     * 없다고 홈의 나머지가 늦어질 이유가 없다 — 그동안 칸은 `—`가 지킨다.
     *
     * ⚠️ 실패해도 조용히 넘긴다. `null`로 남으면 카드가 `—`를 그린다.
     */
    (async () => {
      try {
        const counts = await getFriendBadges([userId]);
        const mine = counts.get(userId);
        if (!cancelled && mine) setBadgeCount(mine.total);
      } catch {
        /* 부가 정보 — 실패하면 카드가 `—`를 그린다 */
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
        ? workedOutToday(completedAts, dateRef, DEFAULT_TIMEZONE)
        : false,
    [completedAts, dateRef],
  );

  /**
   * 내 오늘 상태 3단계 — 크루 행과 **같은 규칙**(`resolvePersonalTodayStatus`)을 지난다.
   * 판정을 여기서 손으로 다시 쓰면 같은 사람이 내 카드와 크루 행에서 갈릴 수 있다.
   */
  const myTodayStatus = useMemo(
    () =>
      resolvePersonalTodayStatus(
        iWorkedOutToday,
        userId ? activeUserIds.has(userId) : false,
      ),
    [activeUserIds, iWorkedOutToday, userId],
  );


  /**
   * 내 시트에 넘길 이번 주 일수.
   *
   * ⚠️ `MemberProfileSheet`가 `stats`에서 **쓰는 값은 이번 주뿐**이다 — 누적 횟수·
   * 시간·거리는 시트가 `get_crew_member_profile`로 직접 받는다. 그래서 손에 없는
   * 누적 분을 `0`으로 지어내 넘기지 않는다.
   */
  const myWeekDays = useMemo(
    () =>
      completedAts
        ? weekWorkoutDays(completedAts, dateRef, DEFAULT_TIMEZONE).days.length
        : 0,
    [completedAts, dateRef],
  );

  const myStreak = useMemo(
    () =>
      completedAts
        ? currentStreak(
            workoutDayKeys(completedAts, DEFAULT_TIMEZONE),
            dayKey(dateRef, DEFAULT_TIMEZONE),
          )
        : 0,
    [completedAts, dateRef],
  );

  const openSelfProfile = useCallback(() => setSelfProfileOpen(true), []);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between pt-2 pb-1">
        {/* ⚠️ **헤더의 스트릭 한 줄이 2026-08-21에 빠졌다.** 2026-08-13에 여기 올린
            이유는 스트릭 카드(108px)를 맨 위로 올리면 `운동 시작하기`가 접힘선 밖으로
            나가서였는데, 이제 스트릭은 `나의 오늘` 카드의 `연속` 칸에 있고 그 카드가
            홈의 첫 카드다 — 같은 숫자를 두 줄 위아래로 두 번 적을 이유가 없다(설계 §5).
            되살리려거든 먼저 왜 두 곳에 있어야 하는지를 적어라. */}
        <h1 className="text-[19px] font-extrabold tracking-tight">GND</h1>
        <NotificationBell />
      </header>

      {/* ⚠️ **홈 첫 두 카드가 하나의 비교 구역이다** (2026-08-21 개편).
          설계: `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md`

          내 오늘 상태 바로 아래에 크루의 오늘이 붙어야 "나는 아직인데 크루는 했다"가
          한눈에 읽힌다. 사이에 다른 카드를 끼우지 마라 — 그 순간 비교가 스크롤 너머로
          갈라지고, 카드를 나눈 이유가 사라진다.

          ⚠️ 홈의 **유일한** 주 행동 버튼이 `PersonalTodayCard` 안에 있다. 다른 곳에
          `운동 시작하기`를 또 만들지 마라(2026-08-13에 같은 실수를 한 번 했다).

          ⚠️ 조회가 끝나기 전에는 **자리를 비우지 않는다.** 스켈레톤도 `/record`
          버튼을 그대로 갖고 있어서, 조회가 느리다는 이유로 운동을 시작할 수 없게
          되지 않는다(설계 §9). */}
      {myName && completedAts && (summary || summaryError) ? (
        <PersonalTodayCard
          profile={myName}
          summary={summary}
          completedAts={completedAts}
          weeklyGoal={weeklyGoal}
          status={myTodayStatus}
          badgeCount={badgeCount}
          onOpenProfile={openSelfProfile}
          now={dateRef}
        />
      ) : (
        <PersonalTodayCardSkeleton />
      )}

      {/* ⚠️ 완료 인원 요약은 **크루 카드가 스스로 센다** — 이미 손에 든 행에서
          `crewTodaySummary`로 세므로 홈이 그 값을 받아 둘 이유가 없다.
          2026-08-21에 잠깐 `onSummaryChange`로 홈까지 끌어올렸는데, 그 값을 쓰던
          내 카드의 비교 문구가 같은 날 중복으로 지워지면서 배선도 함께 걷어냈다. */}
      <FriendBoardCard
        activeUserIds={activeUserIds}
        iWorkedOut={iWorkedOutToday}
      />

      {/* ⚠️ 진행 중 카드가 크루 목록 **아래**다 (2026-08-13). 읽는 순서가 그대로
          이어진다 — 크루 행의 `운동 중` 알약을 보고 바로 아래에서 그 사람의
          진행 중 카드를 만난다. 세션이 없으면 아무것도 그리지 않는다. */}
      <ActiveWorkoutCards sessions={activeSessions} />

      {/* 진행 중 챌린지 요약 — **이름·기한만** 적는다. 달성률·참여율·종합점수는
          챌린지 탭에만 둔다(설계 §4.3). 진행 중인 것이 없으면 함께하기를 권한다. */}
      <ChallengeSummaryCard
        challenges={challenges}
        timeZone={timeZone}
        score={challengeScore}
      />

      {/* ⚠️ **성장·스트릭·주간 통계 카드가 2026-08-21에 여기서 사라졌다.**
          세 카드의 데이터는 전부 `나의 오늘`로 올라갔다(설계 §5) — 같은 숫자를
          첫 화면과 여기 두 번 그리면 아래 카드들이 그만큼 밀린다.

          지운 것이 아니라 옮긴 것이다. 레벨 진행·7일 점·주간 달성률의 **자세한**
          화면은 프로필 탭의 성장 허브가 계속 갖는다. 되살리기 전에 설계 §5의
          표를 읽어라 — 카드별로 유지/통합/제거가 이미 정해져 있다.

          성장 조회 실패 문구도 카드 안(레벨 자리)으로 들어갔다. */}
      <PushEnableCard />

      <CrewCard />

      <AuthStatus />

      {/* ⚠️ **크루 행이 여는 것과 같은 시트다** (2026-08-21 사용자 지시).
          `get_crew_member_profile`은 본인을 허용한다 — `p_target_id <> auth.uid()`일
          때만 크루를 따진다(`db-current-schema.sql:1255`).

          ⚠️ `viewerId`·`source`를 **넘기지 않는다.** 그 둘은 "누가 누구 프로필을
          봤나"를 남기는 계측인데, 내가 내 것을 연 것은 프로필 방문이 아니다 —
          넘기면 크루 방문 통계가 자기 조회로 부풀어 오른다. */}
      {selfProfileOpen && userId && myName && (
        <MemberProfileSheet
          userId={userId}
          nickname={myName.nickname}
          avatarUrl={myName.avatarUrl}
          streak={myStreak}
          stats={{ weekDays: myWeekDays }}
          onClose={() => setSelfProfileOpen(false)}
        />
      )}
    </div>
  );
}
