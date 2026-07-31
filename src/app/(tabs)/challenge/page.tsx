"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ChallengeSetupSheet,
  type SetupSubmit,
} from "@/components/challenge/setup-sheet";
import {
  achievementScore,
  completedGoalBonus,
  completedGoalCountOf,
  gndLabel,
  goalRate,
  overallScore,
  participationScore,
  plannedDaysForPeriod,
  rankParticipants,
  type GoalType,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { challengeLevel, levelLabel } from "@/lib/domain/level";
import { dayKey } from "@/lib/domain/time";
import { getMyGroups, getMyProfile, profilesByIds } from "@/lib/crew";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_STATS,
  GOAL_TYPE_META,
  actualForGoal,
  acceptChallengeInvite,
  approveChallengeGoals,
  goalLabel,
  cancelChallenge,
  createChallengeRoom,
  declineChallengeInvite,
  finalizeChallenge,
  getChallengeApprovals,
  getChallengeGoals,
  getChallengeParticipants,
  getMyChallenges,
  getMyPreviousGoals,
  getPeriodStatsByUser,
  saveMyGoals,
  startChallenge,
  unapproveChallengeGoals,
  type GoalDraft,
  type MyChallenge,
  type PeriodStats,
} from "@/lib/challenge";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";
import { ChallengePicker } from "@/components/challenge/challenge-picker";
import { InviteSheet } from "@/components/challenge/invite-sheet";
import type { Group, Profile, UserGoal } from "@/lib/types";

function periodDays(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("kpi_incomplete")) {
    return `아직 KPI 미설정 크루원이 있어요 (${msg.split(":")[1] ?? ""}) 🔒`;
  }
  if (msg.includes("consent_incomplete")) {
    return `아직 목표에 동의하지 않은 크루원이 있어요 (${msg.split(":")[1] ?? ""}) 🤝`;
  }
  if (msg.includes("not_ended_yet")) return "아직 종료일이 지나지 않았어요";
  // 0044: create_challenge_room이 challenges.group_id(not null)를 채워야 해서
  // 그룹 없는 사람은 여기서 막힌다. 0045가 그 컬럼을 지우면 풀린다.
  if (msg.includes("no_group_yet"))
    return "아직 크루가 없어요. 홈에서 크루를 만들거나 참여해 주세요";
  if (msg.includes("already_joined")) return "이미 참가한 챌린지예요";
  if (msg.includes("not_invited")) return "초대받지 않은 챌린지예요";
  if (msg.includes("invalid_status"))
    return "챌린지 상태가 맞지 않아요. 새로고침해 주세요";
  // 0044가 challenges_one_live 인덱스를 지웠으므로 그 오류는 더 이상 안 나온다.
  // 분기를 남겨두면 다음 사람이 개수 제한이 아직 있다고 오해한다.
  return `오류: ${msg}`;
}

export default function ChallengePage() {
  const { userId, loading, configured, error } = useAuth();

  if (!configured) {
    return (
      <p className="pt-10 text-center text-sm text-muted">
        Supabase 설정(.env.local)이 필요해요.
      </p>
    );
  }
  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (!userId) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        익명 인증에 실패했어요{error ? ` — ${error}` : ""}. 홈 탭에서 상태를
        확인해 주세요.
      </p>
    );
  }
  return <ChallengeScreen userId={userId} />;
}

function ChallengeScreen({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  // 0044: 챌린지가 여러 개일 수 있다. 목록 + 선택으로 두고, 아래 모든 분기
  // (setup·active·ended)는 선택된 하나(challenge)를 그대로 쓴다.
  const [challenges, setChallenges] = useState<MyChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [approvals, setApprovals] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Map<string, PeriodStats> | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [prevGoals, setPrevGoals] = useState<GoalDraft[] | null>(null);
  const [sheet, setSheet] = useState<{
    mode: "create" | "goals";
    defaults: SetupSubmit;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const challenge = challenges.find((c) => c.id === selectedId) ?? null;

  // 선택을 아래 로딩 effect의 의존성에 넣으면 선택할 때마다 전체 재조회가 돌고,
  // 그 재조회가 다시 선택을 세팅해 루프가 된다. 읽기 전용 ref로만 참조한다.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
      // 0044: 크론(09:00 KST)을 기다리지 않고 화면 진입 시에도 도래분을 넘긴다.
      // 시작일 당일 09시 전에 앱을 열면 아직 setup으로 보이기 때문이다.
      // 멱등이라 여러 번 불려도 안전하다. 실패는 무시한다 — 전환이 안 됐다고
      // 챌린지 화면을 못 열게 하면 안 된다. 다음 진입이나 크론이 처리한다.
      try {
        const sb = getSupabaseBrowserClient();
        await Promise.all([
          sb.rpc("autostart_due_challenges"),
          sb.rpc("autofinalize_due_challenges"),
        ]);
      } catch {
        /* 전환 실패는 조용히 넘긴다 */
      }

      // 챌린지 목록은 그룹과 무관하게 가져온다. 타 그룹에서 초대받은 사람
      // (혼자모드 포함)은 그룹이 없을 수 있는데, 예전처럼 그룹이 없다고 여기서
      // 멈추면 그 사람은 자기 챌린지를 영영 못 본다.
      const [groups, profile, myChallenges] = await Promise.all([
        getMyGroups(),
        getMyProfile(userId),
        getMyChallenges(userId),
      ]);
      if (cancelled) return;
      const g = groups[0] ?? null;
      setGroup(g);
      const tz =
        profile?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Asia/Seoul";
      setTimeZone(tz);

      setChallenges(myChallenges);
      // 처음 진입엔 대표 챌린지를 고른다. 이미 고른 것이 목록에 남아 있으면
      // 유지한다 — 목표 저장·동의 뒤 다시 불러올 때 선택이 튀면 사용자가
      // 보던 화면을 잃는다.
      const ch =
        myChallenges.find((c) => c.id === selectedIdRef.current) ??
        pickPrimaryRow(myChallenges);
      setSelectedId(ch?.id ?? null);

      // 0044: 참여자 명단은 그룹이 아니라 **이 챌린지의 참가자**다.
      // 그룹 기준으로 두면 초대하지 않은 크루원까지 명단·시작 게이트에 끌려와,
      // 그 사람이 목표를 세워야 시작되는 상태가 된다. 실제로 그렇게 배포됐다.
      // invited는 뺀다(아직 수락 전) — dropped는 결과 화면에 남아야 하므로 넣는다.
      if (ch) {
        const parts = await getChallengeParticipants(ch.id);
        if (cancelled) return;
        setMembers(
          await profilesByIds(
            parts.filter((p) => p.status !== "invited").map((p) => p.user_id),
          ),
        );
      } else {
        setMembers([]);
      }

      // 직전 목표 프리필은 그룹 기준 조회라 그룹이 있을 때만 채운다.
      // 없으면 프리필이 비는 것뿐이고 목표 설정 자체는 된다.
      if (g) {
        const prev = await getMyPreviousGoals(userId, g.id, ch?.id ?? null);
        if (cancelled) return;
        setPrevGoals(
          prev.map((p) => ({
            type: p.goal_type,
            target: Number(p.target_value),
            qualifier: p.qualifier,
          })),
        );
      }

      if (ch) {
        const [chGoals, appr] = await Promise.all([
          getChallengeGoals(ch.id),
          getChallengeApprovals(ch.id),
        ]);
        if (cancelled) return;
        setGoals(chGoals);
        setApprovals(appr);
        if (ch.status === "active" || ch.status === "ended") {
          // 0044: 집계 대상이 그룹이 아니라 챌린지 참가자다.
          // invited는 뺀다 — 아직 수락하지 않았으니 참가자가 아니다.
          // dropped는 남긴다 — 목표 0개로 명단에서 빠졌어도 이미 한 운동은
          // 결과 화면에 보여야 한다.
          const parts = await getChallengeParticipants(ch.id);
          setStats(
            await getPeriodStatsByUser(
              parts.filter((p) => p.status !== "invited").map((p) => p.user_id),
              ch.start_date,
              ch.end_date,
              tz,
              ch.photo_required,
            ),
          );
        }
      }
      } catch {
        if (!cancelled) showToast("데이터를 불러오지 못했어요");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey, showToast]);

  const myGoals = useMemo(
    () => goals.filter((g) => g.user_id === userId),
    [goals, userId],
  );
  const goalCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goals) m.set(g.user_id, (m.get(g.user_id) ?? 0) + 1);
    return m;
  }, [goals]);
  // 크루원별 실제 목표 목록 — setup에서 누가 무슨 목표를 세팅했는지 보여준다
  const goalsByUser = useMemo(() => {
    const m = new Map<string, UserGoal[]>();
    for (const g of goals) {
      const list = m.get(g.user_id) ?? [];
      list.push(g);
      m.set(g.user_id, list);
    }
    return m;
  }, [goals]);

  const allSet =
    members.length > 0 &&
    members.every((m) => (goalCountByUser.get(m.id) ?? 0) > 0);
  const allApproved =
    members.length > 0 && members.every((m) => approvals.has(m.id));
  const iApproved = approvals.has(userId);
  const approvedCount = members.filter((m) => approvals.has(m.id)).length;

  const todayKey = dayKey(new Date(), timeZone);
  const endedByDate = challenge ? challenge.end_date < todayKey : false;
  const dday = challenge ? periodDays(todayKey, challenge.end_date) - 1 : 0;

  async function handleCreate(v: SetupSubmit) {
    setBusy(true);
    try {
      // 0044: 직접 insert가 아니라 RPC로 만든다. 그래야 challenge_participants에
      // host 행이 생긴다 — 없으면 본인이 만든 챌린지가 getMyChallenges()에 안 나온다.
      const ch = await createChallengeRoom({
        name: v.name,
        startDate: v.startDate,
        endDate: v.endDate,
      });
      await saveMyGoals({
        userId,
        challengeId: ch.id,
        // 0044: 내 그룹이 아니라 **챌린지의** 그룹이다. 여기서는 방금 만든
        // 챌린지라 값이 같지만, 아래 handleSaveGoals와 규칙을 맞춰 둔다.
        groupId: ch.group_id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
      setSheet(null);
      showToast("챌린지를 만들었어요 — 크루원들이 KPI를 설정하면 시작! 🎯");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGoals(v: SetupSubmit) {
    // 0044: 내 그룹 유무는 상관없다. 타 그룹에서 초대받아 참가한 사람도
    // 목표를 세울 수 있어야 한다.
    if (!challenge) return;
    setBusy(true);
    try {
      await saveMyGoals({
        userId,
        challengeId: challenge.id,
        // 0044: 내 그룹이 아니라 **챌린지의** 그룹이다.
        // goals_insert_own_setup이 challenges.group_id = user_goals.group_id를
        // 요구하므로(0006:85), 타 그룹 참가자가 자기 그룹 id를 넣으면 정책에
        // 막혀 목표를 못 세운다. 이 컬럼은 0045에서 드롭한다.
        groupId: challenge.group_id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
      setSheet(null);
      showToast("내 KPI를 저장했어요 ✓");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** 0044: 초대 수락 — 서버가 기존 참가자 전원과 crew_links를 맺어 준다(D5) */
  async function handleAcceptInvite() {
    if (!challenge) return;
    setBusy(true);
    try {
      await acceptChallengeInvite(challenge.id);
      showToast("참가했어요! 목표를 세워 주세요 🎯");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineInvite() {
    if (!challenge) return;
    setBusy(true);
    try {
      await declineChallengeInvite(challenge.id);
      // 거절은 참가 행을 지운다 = 이 챌린지를 더 못 읽는다. 목록에서도 빼고
      // 선택을 비워 다음 로딩이 대표 챌린지를 다시 잡게 한다.
      setChallenges((list) => list.filter((c) => c.id !== challenge.id));
      setSelectedId(null);
      showToast("초대를 거절했어요");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (!challenge) return;
    setBusy(true);
    try {
      await startChallenge(challenge.id);
      showToast("🏁 챌린지 시작! 오늘부터 기록이 반영돼요");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!challenge) return;
    setBusy(true);
    try {
      if (iApproved) await unapproveChallengeGoals(challenge.id);
      else await approveChallengeGoals(challenge.id);
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!challenge) return;
    if (!window.confirm("챌린지를 취소할까요? 되돌릴 수 없어요.")) return;
    setBusy(true);
    try {
      await cancelChallenge(challenge.id);
      // 0044: 취소한 것만 목록에서 뺀다. 선택은 아래 reload()가 대표 챌린지로
      // 다시 잡아 준다 — 남은 챌린지가 있으면 그쪽으로 넘어간다.
      setChallenges((list) => list.filter((c) => c.id !== challenge.id));
      setSelectedId(null);
      setGoals([]);
      showToast("챌린지를 취소했어요");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!challenge) return;
    setBusy(true);
    try {
      await finalizeChallenge(challenge.id);
      showToast("🏆 결과가 발표됐어요!");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openSheet(mode: "create" | "goals") {
    const now = new Date();
    setSheet({
      mode,
      defaults: {
        name: `${now.getMonth() + 1}월 GND 챌린지`,
        startDate: dayKey(now, timeZone),
        endDate: dayKey(new Date(now.getTime() + 27 * 86_400_000), timeZone),
        goals:
          mode === "goals" && myGoals.length > 0
            ? myGoals.map((g) => ({
                type: g.goal_type,
                target: Number(g.target_value),
                qualifier: g.qualifier,
              }))
            : [{ type: "weight_days", target: 12, qualifier: 3 }],
        plannedDays: myGoals[0]?.planned_days ?? 5,
      },
    });
  }

  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }

  const days = challenge
    ? periodDays(challenge.start_date, challenge.end_date)
    : 0;

  // 순위·진행률 계산 재료 (§7) — 목표 있는 참여자만
  const participantInputs: ParticipantInput[] = members
    .filter((m) => (goalCountByUser.get(m.id) ?? 0) > 0)
    .map((m) => {
      const userGoals = goals.filter((g) => g.user_id === m.id);
      const s = stats?.get(m.id) ?? EMPTY_STATS;
      return {
        userId: m.id,
        goals: userGoals.map((g) => ({
          type: g.goal_type,
          target: Number(g.target_value),
          actual: actualForGoal(s, g.goal_type, g.qualifier),
        })),
        workoutDays: s.workoutDays,
        plannedDays: plannedDaysForPeriod(userGoals[0]?.planned_days ?? 5, days),
        allGoalsCompletedAtMs: null,
      };
    });

  const me = participantInputs.find((p) => p.userId === userId) ?? null;
  const myAchievement = me ? achievementScore(me.goals) : 0;
  const myParticipation = me
    ? participationScore(me.workoutDays, me.plannedDays)
    : 0;
  // 순위 계산(rankParticipants)과 동일하게 완료 목표 보너스를 포함한다.
  const myOverall =
    overallScore(myAchievement, myParticipation) +
    (me ? completedGoalBonus(completedGoalCountOf(me.goals)) : 0);

  const myQualifier = (type: GoalType) =>
    myGoals.find((x) => x.goal_type === type)?.qualifier;

  const profileOf = (id: string) => members.find((m) => m.id === id);

  const levelOf = (id: string): number =>
    challenge
      ? challengeLevel(
          stats?.get(id)?.workoutDayKeys ?? [],
          challenge.start_date,
          challenge.end_date,
          todayKey,
        )
      : 1;

  return (
    <div className="flex flex-col gap-3 pb-10">
      <header className="pt-2 pb-1">
        <h1 className="text-[19px] font-extrabold tracking-tight">
          GND 챌린지
        </h1>
        {challenge && (
          <>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {challenge.name} · {challenge.start_date} ~ {challenge.end_date}
            </p>
            {challenge.photo_required && (
              <span className="mt-1.5 inline-block rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">
                📷 사진 인증 필수 · 사진 없는 운동은 집계되지 않아요
              </span>
            )}
          </>
        )}
      </header>

      {/* 0044: 챌린지가 2개 이상일 때만 뜬다. 1개면 렌더되지 않는다. */}
      <ChallengePicker
        challenges={challenges}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/*
        0044: 개수 제한이 풀렸으므로 이미 챌린지가 있어도 새로 만들 수 있어야 한다.
        아래 "챌린지 없음" 자리의 생성 버튼은 !challenge일 때만 뜨는데, 그러면
        하나라도 있는 순간 만들 길이 사라진다 — 이번 개편의 본체가 바로 그
        제한을 푸는 것이라 여기 상시 진입점을 둔다. 개수 상한은 없다.
      */}
      {group && challenges.length > 0 && (
        <button
          onClick={() => openSheet("create")}
          className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
        >
          ＋ 챌린지 하나 더 만들기
        </button>
      )}

      {!group && challenges.length === 0 && (
        <p className="pt-8 text-center text-sm text-muted">
          크루에 참여하면 챌린지를 만들 수 있어요.
        </p>
      )}

      {/* ── 챌린지 없음 ─────────────────────────────── */}
      {group && !challenge && (
        <>
          <section className="rounded-card border border-line bg-surface p-5 text-center shadow-card">
            <div className="text-3xl">🏆</div>
            <h2 className="mt-1 text-base font-extrabold">
              아직 진행 중인 챌린지가 없어요
            </h2>
            <p className="mt-1 text-xs text-muted">
              기간을 정하면 크루원 각자 자기 목표(KPI)를 세우고, 전원 설정 완료
              시 시작돼요.
            </p>
          </section>
          <button
            onClick={() => openSheet("create")}
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink"
          >
            ＋ 새 챌린지 만들기 (기간·목표 설정)
          </button>
        </>
      )}

      {/* ── setup: 전원 KPI 게이트 (§6) ─────────────── */}
      {/* 0044: 초대받았지만 아직 수락 안 함 — 수락 전에는 목표를 못 세운다 */}
      {challenge && challenge.myStatus === "invited" && (
        <section className="rounded-card border border-accent/40 bg-accent/10 p-4 shadow-card">
          <p className="text-sm font-extrabold">🏆 챌린지에 초대받았어요</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {challenge.name} · {challenge.start_date} ~ {challenge.end_date}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void handleAcceptInvite()}
              disabled={busy}
              className="flex-1 rounded-card-sm bg-accent py-2.5 text-sm font-extrabold text-accent-ink disabled:opacity-40"
            >
              참가하기
            </button>
            <button
              onClick={() => void handleDeclineInvite()}
              disabled={busy}
              className="flex-1 rounded-card-sm border border-line py-2.5 text-sm font-bold disabled:opacity-40"
            >
              거절
            </button>
          </div>
        </section>
      )}

      {challenge?.status === "setup" && challenge.myStatus !== "invited" && (
        <>
          <InviteSheet
            challengeId={challenge.id}
            myRole={challenge.myRole}
            status={challenge.status}
            onInvited={reload}
          />
          {myGoals.length === 0 ? (
            <button
              onClick={() => openSheet("goals")}
              className="rounded-card border border-warn/40 bg-surface p-3.5 text-left text-[13px] font-bold text-warn shadow-card"
            >
              🎯 새 챌린지에 초대됐어요! <b>내 KPI를 설정</b>해야 시작돼요 ·
              설정하기 →
            </button>
          ) : (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold">
                  🎯 내 목표 {myGoals.length}개
                </p>
                <button
                  onClick={() => openSheet("goals")}
                  className="text-xs font-bold text-accent"
                >
                  수정
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {myGoals.map((g) => (
                  <div
                    key={g.id}
                    className="flex justify-between rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px]"
                  >
                    <span>{goalLabel(g.goal_type, g.qualifier)}</span>
                    <span className="font-mono font-bold">
                      {Number(g.target_value).toLocaleString()}
                      {g.unit}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">참여자 KPI 설정 현황</h3>
              <span className="text-xs text-muted">
                {
                  members.filter((m) => (goalCountByUser.get(m.id) ?? 0) > 0)
                    .length
                }{" "}
                / {members.length} 완료
              </span>
            </div>
            {members.map((m) => {
              const count = goalCountByUser.get(m.id) ?? 0;
              const theirGoals = goalsByUser.get(m.id) ?? [];
              return (
                <div key={m.id} className="border-t border-line py-2 first:border-t-0 first:pt-1">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">
                      {m.avatar_url ?? "👤"}
                    </span>
                    <span className="flex-1 text-[13.5px] font-bold">
                      {m.nickname}
                      {m.id === userId && (
                        <span className="ml-1 text-faint">(나)</span>
                      )}
                    </span>
                    <span className="flex flex-none items-center gap-1.5">
                      {count > 0 ? (
                        <span className="rounded-full bg-good-weak px-2.5 py-1 text-[11px] font-bold text-good">
                          목표 {count}개 ✓
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted">
                          설정 대기
                        </span>
                      )}
                      {approvals.has(m.id) ? (
                        <span className="rounded-full bg-accent-weak px-2.5 py-1 text-[11px] font-bold text-accent">
                          동의 👍
                        </span>
                      ) : count > 0 ? (
                        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted">
                          동의 대기
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {theirGoals.length > 0 && (
                    <div className="mt-1.5 ml-[42px] flex flex-col gap-1">
                      {theirGoals.map((g) => (
                        <div
                          key={g.id}
                          className="flex justify-between gap-2 rounded-card-sm bg-surface-2 px-2.5 py-1.5 text-[11.5px]"
                        >
                          <span className="min-w-0 truncate text-muted">
                            {goalLabel(g.goal_type, g.qualifier)}
                          </span>
                          <span className="flex-none font-mono font-bold">
                            {Number(g.target_value).toLocaleString()}
                            {g.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="mt-2 text-[11px] text-muted">
              🔒 <b>전원 KPI 설정 + 전원 동의</b> 시 챌린지가 시작돼요.
            </p>
          </section>

          {/* 내 동의 버튼 — 전원 목표 세팅 후에만 의미 있음 */}
          {allSet && (
            <button
              onClick={handleApprove}
              disabled={busy}
              className={`h-11 rounded-card border text-[13px] font-extrabold disabled:opacity-50 ${
                iApproved
                  ? "border-line bg-surface text-muted"
                  : "border-accent bg-accent-weak text-accent"
              }`}
            >
              {iApproved
                ? "✓ 동의함 (누르면 철회)"
                : "크루 전원의 목표에 동의하기 👍"}
            </button>
          )}

          <button
            onClick={handleStart}
            disabled={busy || !allSet || !allApproved}
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
          >
            {!allSet
              ? "전원 목표 세팅 대기 중…"
              : !allApproved
                ? `전원 동의 대기 중… (${approvedCount}/${members.length})`
                : "챌린지 시작 🏁"}
          </button>
          {challenge.created_by === userId && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-50"
            >
              🗑 챌린지 취소하고 새로 만들기
            </button>
          )}
        </>
      )}

      {/* ── active: 내 진행률만 공개 (§6 비공개) ─────── */}
      {challenge?.status === "active" && (
        <>
          <section className="rounded-card bg-gradient-to-br from-accent to-[#0B6E66] p-5 text-accent-ink shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-all text-xs font-bold opacity-80">
                {challenge.name}
              </p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold">
                {levelLabel(levelOf(userId))}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-[13px] opacity-90">
                  내 목표 {me?.goals.length ?? 0}개 · 평균 달성
                </p>
                <p className="font-mono text-[26px] leading-tight font-extrabold">
                  {Math.round(myAchievement)}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[32px] leading-none font-extrabold">
                  {myOverall.toFixed(1)}
                </p>
                <p className="text-[11px] opacity-90">내 종합점수</p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: `${Math.min(100, Math.round(myAchievement))}%`,
                }}
              />
            </div>
            <p className="mt-2.5 text-xs opacity-95">
              결과 발표까지{" "}
              <b className="font-mono">
                {endedByDate ? "종료!" : `D-${Math.max(0, dday)}`}
              </b>{" "}
              · 참여율 {Math.round(myParticipation)}%
            </p>
          </section>

          {me && me.goals.length > 0 && (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h3 className="text-sm font-extrabold">내 목표 진행률</h3>
              <div className="mt-2 flex flex-col gap-2">
                {me.goals.map((g, i) => {
                  const rate = goalRate(g.target, g.actual);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="font-bold">
                          {goalLabel(g.type, myQualifier(g.type))}{" "}
                          {g.target.toLocaleString()}
                          {GOAL_TYPE_META[g.type].unit}
                        </span>
                        <span className="font-mono font-bold">
                          {Math.round(g.actual * 10) / 10} ·{" "}
                          {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${
                            rate >= 1 ? "bg-good" : "bg-accent"
                          }`}
                          style={{ width: `${Math.min(100, rate * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                초과 달성은 표시만 — 점수는 목표당 100%까지 반영돼요.
              </p>
            </section>
          )}

          <div className="rounded-card border border-line bg-surface-2 p-3 text-center text-[12px] font-bold text-muted">
            🔒 공정성을 위해 <b>기간 중에는 내 진행률만</b> 볼 수 있어요
          </div>

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">
                참여자 ({members.length}명)
              </h3>
              <span className="text-xs text-muted">🔒 종료일 공개</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">
                  {m.avatar_url ?? "👤"}
                </span>
                <span className="flex-1 text-[13.5px] font-bold">
                  {m.nickname}
                  {m.id === userId && (
                    <span className="ml-1 text-faint">(나)</span>
                  )}
                </span>
                <span className="font-mono text-sm font-extrabold text-faint">
                  {m.id === userId ? `${Math.round(myAchievement)}%` : "🔒"}
                </span>
              </div>
            ))}
          </section>

          {endedByDate && (
            <button
              onClick={handleFinalize}
              disabled={busy}
              className="h-12 rounded-card bg-good text-sm font-extrabold text-white disabled:opacity-60"
            >
              🏆 결과 발표하기
            </button>
          )}
          {challenge.created_by === userId && !endedByDate && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-50"
            >
              🗑 챌린지 취소
            </button>
          )}
        </>
      )}

      {/* ── ended: 시상대 + 상세 순위 (§6) ───────────── */}
      {challenge?.status === "ended" && (
        <>
          <ResultView
            participants={participantInputs}
            goals={goals}
            profileOf={profileOf}
            myUserId={userId}
            levelOf={levelOf}
          />
          {/* 챌린지가 끝났으면 새 챌린지를 시작할 수 있게 (추가 생성) */}
          <button
            onClick={() => openSheet("create")}
            className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink"
          >
            ＋ 새 챌린지 만들기
          </button>
        </>
      )}

      {sheet && group && (
        <ChallengeSetupSheet
          mode={sheet.mode}
          defaults={sheet.defaults}
          periodDaysFixed={sheet.mode === "goals" && challenge ? days : undefined}
          prevGoals={prevGoals}
          busy={busy}
          onSubmit={sheet.mode === "create" ? handleCreate : handleSaveGoals}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && (
        <div
          className="fixed inset-x-8 z-[60] rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 90px)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** 시상대 + 상세 순위 (§6 결과 발표) */
function ResultView({
  participants,
  goals,
  profileOf,
  myUserId,
  levelOf,
}: {
  participants: ParticipantInput[];
  goals: UserGoal[];
  profileOf: (id: string) => Profile | undefined;
  myUserId: string;
  levelOf: (id: string) => number;
}) {
  const ranked = rankParticipants(participants);
  const total = ranked.length;
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(
    (r): r is (typeof ranked)[number] => Boolean(r),
  );
  const heights: Record<number, string> = { 1: "h-20", 2: "h-14", 3: "h-10" };

  return (
    <>
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h3 className="text-center text-base font-extrabold">
          🏆 최종 순위 발표
        </h3>
        <div className="mt-4 flex items-end justify-center gap-2">
          {podiumOrder.map((r) => {
            const p = profileOf(r.userId);
            const h = heights[Math.min(r.rank, 3)];
            return (
              <div key={r.userId} className="flex w-20 flex-col items-center">
                {r.rank === 1 && <span className="text-lg">👑</span>}
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-xl">
                  {p?.avatar_url ?? "👤"}
                </span>
                <span className="mt-1 text-xs font-extrabold">
                  {p?.nickname ?? "?"}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {r.overall.toFixed(1)}점
                </span>
                <span
                  className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold ${
                    r.rank === 1
                      ? "bg-good-weak text-good"
                      : r.rank === total
                        ? "bg-surface-2 text-warn"
                        : "bg-surface-2 text-muted"
                  }`}
                >
                  {gndLabel(r.rank, total)}
                </span>
                <div
                  className={`mt-1.5 w-full rounded-t-lg bg-accent-weak text-center font-mono text-sm font-extrabold text-accent ${h}`}
                >
                  {r.rank}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {ranked.map((r) => {
        const p = profileOf(r.userId);
        const userGoals = goals.filter((g) => g.user_id === r.userId);
        const input = participants.find((x) => x.userId === r.userId);
        return (
          <article
            key={r.userId}
            className={`rounded-card border bg-surface p-4 shadow-card ${
              r.userId === myUserId ? "border-accent/50" : "border-line"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full font-mono text-sm font-extrabold ${
                  r.rank === 1
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {r.rank}
              </span>
              <div className="flex-1">
                <p className="text-sm font-extrabold">
                  {p?.nickname ?? "?"}
                  {r.userId === myUserId && (
                    <span className="ml-1 rounded-full bg-accent-weak px-1.5 text-[10px] text-accent">
                      나
                    </span>
                  )}{" "}
                  <span className="text-[11px] font-bold text-muted">
                    {gndLabel(r.rank, total)}
                  </span>
                  <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                    {levelLabel(levelOf(r.userId))}
                  </span>
                </p>
                <p className="text-[11px] text-muted">
                  목표 {userGoals.length}개 · 평균 달성{" "}
                  {Math.round(r.achievement)}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-extrabold">
                  {r.overall.toFixed(1)}
                </p>
                <p className="text-[10px] text-muted">종합점수</p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-1">
              {userGoals.map((g) => {
                const actual =
                  input?.goals.find((x) => x.type === g.goal_type)?.actual ?? 0;
                const rate = goalRate(Number(g.target_value), actual);
                return (
                  <div
                    key={g.id}
                    className="flex justify-between rounded-card-sm bg-surface-2 px-3 py-1.5 text-[12px]"
                  >
                    <span>
                      {goalLabel(g.goal_type, g.qualifier)}{" "}
                      {Number(g.target_value).toLocaleString()}
                      {g.unit}
                    </span>
                    <span className="font-mono font-bold">
                      {Math.round(actual * 10) / 10} · {Math.round(rate * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {Math.round(r.achievement)}%
                </p>
                <p className="text-[10px] text-muted">평균 달성률</p>
              </div>
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {Math.round(r.participation)}%
                </p>
                <p className="text-[10px] text-muted">참여율</p>
              </div>
              <div className="rounded-card-sm bg-surface-2 py-1.5">
                <p className="font-mono text-sm font-extrabold">
                  {r.completedGoalCount}개
                </p>
                <p className="text-[10px] text-muted">완료 목표</p>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
