"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/avatar";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import {
  ChallengeSetupSheet,
  type SetupSubmit,
} from "@/components/challenge/setup-sheet";
import { ChallengeStartCard } from "@/components/challenge/start-card";
import {
  challengeInviteUrl,
  defaultChallengeName,
  defaultChallengePeriod,
  earliestStartDate,
  inviteSharePayload,
  shareOutcomeMessage,
  type ShareOutcome,
} from "@/lib/domain/challenge-invite";
import {
  gndLabel,
  goalRate,
  rankParticipants,
  scoreParticipant,
  type GoalType,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { challengeLevel, levelLabel } from "@/lib/domain/level";
// ⚠️ 이 파일에 있던 지역 함수 `periodDays`를 2026-08-13에 여기로 옮겼다. 홈
//    챌린지 요약이 같은 산수를 세 번째로 짜는 것을 막기 위해서다. 되돌리지 마라 —
//    화면마다 D-day가 하루씩 달라지는 종류의 사고다.
import {
  challengeDday,
  challengeStartHint,
  inclusiveDays,
} from "@/lib/domain/challenge-time";
import { dayKey, resolveTimeZone } from "@/lib/domain/time";
import { getMyGroups, getMyProfile } from "@/lib/crew";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_STATS,
  GOAL_TYPE_META,
  buildParticipantInput,
  acceptChallengeInvite,
  approveChallengeGoals,
  goalLabel,
  cancelChallenge,
  leaveSetupChallenge,
  createChallengeRoom,
  declineChallengeInvite,
  finalizeChallenge,
  getChallengeApprovals,
  getChallengeGoals,
  getChallengeParticipantProfiles,
  getMyChallenges,
  getMyPreviousGoals,
  getPeriodStatsByUser,
  issueChallengeInviteCode,
  joinChallengeWithCode,
  clearPendingChallengeInvite,
  savePendingChallengeInvite,
  takeOnboardingNotice,
  saveMyGoals,
  startChallenge,
  unapproveChallengeGoals,
  type ChallengeParticipantProfile,
  type GoalDraft,
  type MyChallenge,
  type PeriodStats,
} from "@/lib/challenge";
import { pickPrimaryRow } from "@/lib/domain/challenge-room";
import { ChallengePicker } from "@/components/challenge/challenge-picker";
import { InviteSheet } from "@/components/challenge/invite-sheet";
import { ParticipantPerformanceCard } from "@/components/challenge/participant-performance-card";
import { getCompletedSessions } from "@/lib/workout";
import type { Group, UserGoal } from "@/lib/types";

const NO_CHALLENGE_MEMBERS: ChallengeParticipantProfile[] = [];
/** 참조 동일성 유지 — 성과 카드의 effect가 매 렌더마다 다시 돌지 않게 한다 */
const NO_COMPLETED_ATS: Date[] = [];
const NO_CHALLENGE_GOALS: UserGoal[] = [];
const NO_CHALLENGE_APPROVALS = new Set<string>();

export function errorMessage(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" &&
          e !== null &&
          "message" in e &&
          typeof e.message === "string"
        ? e.message
        : "알 수 없는 오류";
  if (msg.includes("kpi_incomplete")) {
    return `아직 KPI 미설정 참가자가 있어요 (${msg.split(":")[1] ?? ""}) 🔒`;
  }
  if (msg.includes("consent_incomplete")) {
    return `아직 목표에 동의하지 않은 참가자가 있어요 (${msg.split(":")[1] ?? ""}) 🤝`;
  }
  if (msg.includes("not_ended_yet")) return "아직 종료일이 지나지 않았어요";
  // 0044: create_challenge_room이 challenges.group_id(not null)를 채워야 해서
  // 그룹 없는 사람은 여기서 막힌다. 0045가 그 컬럼을 지우면 풀린다.
  if (msg.includes("no_group_yet"))
    return "아직 크루가 없어요. 홈에서 크루를 만들거나 참여해 주세요";
  if (msg.includes("already_joined")) return "이미 참가한 챌린지예요";
  if (msg.includes("invalid_invite_code")) return "링크가 올바르지 않아요";
  if (msg.includes("not_host")) return "방장만 초대 링크를 만들 수 있어요";
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
  /**
   * 참가자 프로필 시트 (2026-08-19 사용자 요청 — *"프로필 클릭하면 지난 히스토리
   * 성과 확인"*).
   *
   * ⚠️ **시트는 화면당 하나다.** 참가자마다 두면 DOM이 인원 수만큼 늘어난다
   *    (피드가 같은 이유로 이렇게 한다 — `feed/page.tsx` 주석).
   * ⚠️ 시상대(`ResultView`)도 이 상태를 쓴다. 거기서 따로 띄우면 시트가 둘이 된다.
   */
  const [profileTarget, setProfileTarget] = useState<{
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [loadedMembers, setMembers] = useState<ChallengeParticipantProfile[]>(
    [],
  );
  // 0044: 챌린지가 여러 개일 수 있다. 목록 + 선택으로 두고, 아래 모든 분기
  // (setup·active·ended)는 선택된 하나(challenge)를 그대로 쓴다.
  const [challenges, setChallenges] = useState<MyChallenge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedGoals, setGoals] = useState<UserGoal[]>([]);
  const [loadedApprovals, setApprovals] = useState<Set<string>>(new Set());
  const [loadedStats, setStats] = useState<Map<string, PeriodStats> | null>(
    null,
  );
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [completedAts, setCompletedAts] = useState<Date[]>(NO_COMPLETED_ATS);
  const [loadedPrevGoals, setPrevGoals] = useState<GoalDraft[] | null>(null);
  const [loadedChallengeId, setLoadedChallengeId] = useState<string | null>(
    null,
  );
  const [sheet, setSheet] = useState<{
    mode: "create" | "goals";
    defaults: SetupSubmit;
  } | null>(null);
  /** 공정성 안내 상세 접힘 — 기본은 접힌다 (2026-08-13, CrewCard와 같은 규약) */
  const [showFairness, setShowFairness] = useState(false);
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

  /**
   * 온보딩이 참가·친구 연결을 이미 끝냈을 때 남겨 둔 한 줄 (0063, 설계 §3.6).
   *
   * ⚠️ 옛 흐름은 온보딩에서 참가시킨 뒤 **아무 말 없이** 이 화면으로 보냈다.
   * 신입은 챌린지 참가와 친구 연결이 동시에 일어나므로 둘 다 말해야 한다.
   * `takeOnboardingNotice`가 한 번만 꺼내므로 새로고침해도 다시 뜨지 않는다.
   */
  useEffect(() => {
    const notice = takeOnboardingNotice();
    if (!notice) return;
    // ⚠️ effect 본문에서 바로 부르면 렌더가 연쇄된다
    //    (eslint react-hooks/set-state-in-effect). 이 파일의 다른 effect들도
    //    같은 이유로 콜백 안에서 showToast를 부른다. 꺼내기(=소비)는 여기서
    //    동기로 끝내야 StrictMode의 두 번째 실행에서 두 번 뜨지 않는다.
    queueMicrotask(() => showToast(notice));
  }, [showToast]);

  /**
   * `?open=<id>` — 온보딩이 참가를 마치고 **그 챌린지**로 보낼 때 쓴다 (2026-08-08).
   *
   * ⚠️ `?join=`과 헷갈리지 마라. `join`은 "이 코드로 참가시켜라"이고 `open`은
   * "참가는 이미 끝났으니 이 방을 열어라"다. 온보딩이 `join`을 다시 넘기면
   * 이 화면이 참가를 한 번 더 시도해 `already_joined`가 뜬다.
   *
   * ⚠️ 챌린지를 여러 개 만들 수 있게 된 뒤로 `/challenge`만 열면 `pickPrimaryRow`가
   * 대표 챌린지를 고른다 — 초대받아 들어온 사람이 **엉뚱한 방**을 볼 수 있다.
   *
   * 주소에서 지우는 것까지가 한 벌이다. 안 지우면 뒤로가기·새로고침이 이 선택을
   * 계속 되살려 사용자가 다른 챌린지를 못 고른다.
   */
  const openApplied = useRef(false);
  useEffect(() => {
    if (openApplied.current) return;
    const open = new URLSearchParams(window.location.search).get("open");
    if (!open) return;
    openApplied.current = true;
    // ⚠️ effect 본문에서 바로 setState하면 렌더가 연쇄된다
    //    (eslint react-hooks/set-state-in-effect). 이 파일의 다른 effect들과
    //    같은 방식으로 콜백 안에서 부른다.
    queueMicrotask(() => setSelectedId(open));
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const challenge = challenges.find((c) => c.id === selectedId) ?? null;
  // 선택 번호와 상세 정보의 주인이 다르면 화면에 그리지 않는다. useEffect가 실행되기
  // 전 한 프레임에도 이전 챌린지 정보가 새 제목 아래 보이지 않게 하는 안전장치다.
  const detailsAreCurrent =
    selectedId !== null && loadedChallengeId === selectedId;
  const members = detailsAreCurrent ? loadedMembers : NO_CHALLENGE_MEMBERS;
  const goals = detailsAreCurrent ? loadedGoals : NO_CHALLENGE_GOALS;
  const approvals = detailsAreCurrent
    ? loadedApprovals
    : NO_CHALLENGE_APPROVALS;
  const stats = detailsAreCurrent ? loadedStats : null;
  const prevGoals = detailsAreCurrent ? loadedPrevGoals : null;

  // 선택을 아래 로딩 effect의 의존성에 넣으면 선택할 때마다 전체 재조회가 돌고,
  // 그 재조회가 다시 선택을 세팅해 루프가 된다. 읽기 전용 ref로만 참조한다.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // 0049: 초대 링크(/challenge?join=GND-XXXXX)로 들어온 경우 먼저 참가시킨다.
  // 아래 로딩보다 앞서야 목록에 그 챌린지가 담겨 바로 보인다.
  //
  // 처리 후 주소에서 join을 지운다 — 안 지우면 새로고침·뒤로가기마다 다시 시도해
  // already_joined 토스트가 반복된다.
  // ⚠ 가드는 state가 아니라 ref다. state로 두면 개발 모드(StrictMode)에서 effect가
  //   두 번 도는 동안 첫 실행이 취소되며 가드도 주소 정리도 건너뛰고, 두 번째가
  //   같은 코드로 다시 참가를 시도해 "이미 참가한 챌린지예요"가 뜬다.
  //   ref는 동기로 세워지므로 두 번째 실행이 바로 되돌아간다.
  const joinAttempted = useRef(false);
  useEffect(() => {
    if (joinAttempted.current) return;
    const code = new URLSearchParams(window.location.search).get("join");
    if (!code) return;
    joinAttempted.current = true;

    // 프로필이 없는 첫 방문자는 OnboardingGate가 곧바로 온보딩으로 보낸다.
    // 그 전에 코드를 보관해 둬야 닉네임을 정한 뒤 이어서 참가할 수 있다.
    // (await보다 앞이라 리다이렉트와 경쟁하지 않는다.)
    savePendingChallengeInvite(code);

    (async () => {
      // 새 사용자는 아직 프로필이 없다. 여기서 먼저 참가시키면 참가 성공 뒤
      // 보관 코드를 지워 버려 온보딩이 일반 크루 화면으로 열린다. 닉네임을
      // 저장한 뒤 OnboardingPage가 참가시킬 수 있도록 코드와 주소를 그대로 둔다.
      let profile;
      try {
        profile = await getMyProfile(userId);
      } catch {
        // 일시적인 조회 실패면 코드를 보존한다. OnboardingGate의 재시도 또는
        // 사용자의 새로고침이 다시 처리할 수 있어야 한다.
        return;
      }
      if (!profile) return;

      // 기존 사용자만 여기서 바로 참가한다. 처리 후 주소에서 join을 지워
      // 새로고침·뒤로가기 때 같은 참가를 반복하지 않게 한다.
      window.history.replaceState({}, "", window.location.pathname);

      try {
        const r = await joinChallengeWithCode(code);
        setSelectedId(r.challengeId);
        showToast(`${r.challengeName}에 참가했어요! 목표를 세워 주세요 🎯`);
        clearPendingChallengeInvite();
      } catch (e) {
        showToast(errorMessage(e));
        // 이미 참가했거나 코드가 잘못됐으면 보관해 둘 이유가 없다.
        // 남겨두면 다음 온보딩에서 같은 실패를 반복한다.
        clearPendingChallengeInvite();
      } finally {
        reload();
      }
    })();
  }, [userId, showToast, reload]);

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
      // completedAts는 참가자 성과 카드(열람권)의 판정 재료다 — 2026-08-07에
      // 홈에서 이 탭으로 옮겨 오면서 같이 필요해졌다.
      const [groups, profile, myChallenges, sessions] = await Promise.all([
        getMyGroups(),
        getMyProfile(userId),
        getMyChallenges(userId),
        getCompletedSessions(userId),
      ]);
      if (cancelled) return;
      setCompletedAts(sessions.map((s) => s.completedAt));
      const g = groups[0] ?? null;
      setGroup(g);
      const tz =
        profile?.timezone ||
        resolveTimeZone();
      setTimeZone(tz);

      setChallenges(myChallenges);
      // 처음 진입엔 대표 챌린지를 고른다. 이미 고른 것이 목록에 남아 있으면
      // 유지한다 — 목표 저장·동의 뒤 다시 불러올 때 선택이 튀면 사용자가
      // 보던 화면을 잃는다.
      const ch =
        myChallenges.find((c) => c.id === selectedIdRef.current) ??
        pickPrimaryRow(myChallenges);
      setSelectedId(ch?.id ?? null);
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

  // 선택된 챌린지의 데이터. **selectedId에 반드시 반응해야 한다** — 위 effect에
  // 같이 두면 chip으로 챌린지를 바꿔도 재조회가 안 돌아, 새 챌린지 화면에
  // 이전 챌린지의 참여자·목표·순위가 그대로 남는다(2026-07-31 사용자 신고:
  // "챌린지를 추가해도 기존 챌린지 멤버가 포함돼 구성된다").
  //
  // 두 effect가 서로를 다시 부르지 않는다: 위가 selectedId를 세우고, 아래는
  // 읽기만 한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ch = challenges.find((c) => c.id === selectedId) ?? null;
      if (!ch) {
        // 고른 챌린지가 없으면(전부 취소·거절 등) 이전 챌린지 데이터를 지운다.
        // 안 지우면 다음에 고르는 챌린지에 남의 참여자·목표가 그대로 보인다.
        if (!cancelled) {
          setMembers([]);
          setGoals([]);
          setApprovals(new Set());
          setStats(null);
          setPrevGoals(null);
          setLoadedChallengeId(null);
        }
        return;
      }

      // 제목은 선택 즉시 새 챌린지로 바뀐다. 상세 정보도 함께 비워야 새 응답을
      // 기다리거나 조회가 실패했을 때 이전 챌린지의 정보가 새 제목 아래 남지 않는다.
      setMembers([]);
      setGoals([]);
      setApprovals(new Set());
      setStats(null);
      setPrevGoals(null);
      setLoadedChallengeId(null);

      try {
        // 참여자 명단은 그룹이 아니라 **이 챌린지의 참가자**다. 그룹 기준으로
        // 두면 초대하지 않은 그룹 멤버까지 명단·시작 게이트에 끌려온다.
        // invited는 뺀다(아직 수락 전) — dropped는 결과에 남아야 하므로 넣는다.
        const [profiles, chGoals, appr] = await Promise.all([
          getChallengeParticipantProfiles(ch.id),
          getChallengeGoals(ch.id),
          getChallengeApprovals(ch.id),
        ]);
        if (cancelled) return;
        setMembers(profiles);
        setGoals(chGoals);
        setApprovals(appr);

        if (ch.status === "active" || ch.status === "ended") {
          const statsByUser = await getPeriodStatsByUser(
            ch.id,
            ch.start_date,
            ch.end_date,
            timeZone,
          );
          if (cancelled) return;
          setStats(statsByUser);
          setLoadedChallengeId(ch.id);
        } else {
          setStats(null);
          setLoadedChallengeId(ch.id);
        }

        // 직전 목표 프리필은 그룹 기준 조회라 그룹이 있을 때만 채운다.
        if (group) {
          const prev = await getMyPreviousGoals(userId, group.id, ch.id);
          if (cancelled) return;
          setPrevGoals(
            prev.map((p) => ({
              type: p.goal_type,
              target: Number(p.target_value),
              qualifier: p.qualifier,
            })),
          );
        }
      } catch {
        if (!cancelled) showToast("챌린지 정보를 불러오지 못했어요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, selectedId, challenges, group, timeZone, refreshKey, showToast]);

  const myGoals = useMemo(
    () => goals.filter((g) => g.user_id === userId),
    [goals, userId],
  );
  const goalCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goals) m.set(g.user_id, (m.get(g.user_id) ?? 0) + 1);
    return m;
  }, [goals]);
  // 참가자별 실제 목표 목록 — setup에서 누가 무슨 목표를 세팅했는지 보여준다
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
  const dday = challenge ? challengeDday(todayKey, challenge.end_date) : 0;

  // setup 구간의 안내문·버튼 라벨. 조립은 도메인에서 한다 — 이유는
  // `challengeStartHint` 주석 참조(화면은 비동기 조회 뒤라 글자를 테스트로 못 잡는다).
  const startHint = challenge
    ? challengeStartHint({
        startDateKey: challenge.start_date,
        todayKey,
        allSet,
        allApproved,
        approvedCount,
        memberCount: members.length,
      })
    : null;

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
      // 만든 챌린지를 바로 보여준다. 안 하면 목록에는 생겼는데 화면은 이전
      // 챌린지에 머물러, 방금 만든 것을 chip에서 찾아 눌러야 한다.
      setSelectedId(ch.id);
      showToast("챌린지를 만들었어요 — 참가자를 초대하고 목표를 세워 보세요 🎯");
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * **친구부터 부르기** — 방을 기본값으로 만들고 링크를 즉시 손에 쥐여 준다
   * (2026-08-17 사용자 승인).
   *
   * 옛 순서는 `폼 다 채우기 → 저장 → 그제서야 초대 영역 등장`이었다. 그래서
   * 방장이 혼자 만들고 아무도 안 오면 지우고 다시 만들기를 반복했다 —
   * 2026-07-31 하루에 7개를 만들고 전부 취소한 기록이 남아 있다.
   *
   * ⚠️ **목표를 여기서 저장하지 않는다.** `handleCreate`는 `saveMyGoals`를 같이
   *    부르지만 이 경로는 일부러 안 부른다. 목표가 없으면 아래 setup 화면이
   *    `내 KPI를 설정해야 시작돼요`를 띄우는데, 그게 이 개편이 원하는 순서다 —
   *    규칙은 필요해지는 순간에 나온다. 여기서 기본 목표를 심으면 사용자가
   *    **자기가 안 정한 목표**로 시작하게 된다.
   *
   * ⚠️⚠️ **`reload()`를 링크보다 먼저 부르지 마라.** 2026-08-17 브라우저 실측에서
   *    이 순서 때문에 초대가 그 자리에서 닫혔다 — `reload()`가 시작시키는 조회
   *    묶음에 `autostart_due_challenges`가 들어 있고, 그게 방금 만든 `setup` 방을
   *    `active`로 올려 버린다. 그다음 코드 발급이 `invalid_status:active`로 400.
   *    링크를 손에 쥔 **뒤에** 화면을 새로 고친다.
   *
   * ⚠️ **코드를 다시 발급하지 마라.** `create_challenge_room`이 0064부터
   *    `invite_code`를 **같은 트랜잭션에서 넣어 돌려준다.** 한 번 더 부르면
   *    왕복이 늘고, 위의 경합에 스스로를 노출시킨다. 없을 때만(코드 충돌 10회
   *    폴백 경로) 발급을 시도한다.
   *
   * ⚠️ **링크가 실패해도 방을 되돌리지 마라.** 방은 이미 만들어졌고 아래
   *    `InviteSheet`가 같은 코드를 다시 낸다. 여기서 롤백하면 사용자는 빈 화면으로
   *    돌아가 방금 누른 게 무슨 뜻이었는지 알 수 없게 된다.
   */
  async function handleInviteFirst() {
    if (busy) return;
    setBusy(true);
    try {
      const { startDate, endDate } = defaultChallengePeriod(todayKey);
      const name = defaultChallengeName();
      const ch = await createChallengeRoom({ name, startDate, endDate });

      // ⚠️ 이 블록이 끝나기 전에는 `reload()`를 부르지 않는다(위 주석).
      let outcome: ShareOutcome = "manual";
      try {
        const code = ch.invite_code ?? (await issueChallengeInviteCode(ch.id));
        const url = challengeInviteUrl(window.location.origin, code);
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share(inviteSharePayload(name, url));
          outcome = "shared";
        } else {
          await navigator.clipboard.writeText(url);
          outcome = "copied";
        }
      } catch {
        // 공유 시트를 사용자가 **닫은 것**도 여기로 온다(AbortError). 그때도
        // 링크는 살아 있으니 클립보드에 담아 두면 다시 보낼 수 있다.
        try {
          const code = ch.invite_code ?? (await issueChallengeInviteCode(ch.id));
          await navigator.clipboard.writeText(
            challengeInviteUrl(window.location.origin, code),
          );
          outcome = "copied";
        } catch {
          outcome = "manual";
        }
      }

      setSelectedId(ch.id);
      reload();
      showToast(shareOutcomeMessage(outcome));
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

  /** 초대 수락 — 챌린지 참가 상태만 joined로 바꾸며 크루 관계는 만들지 않는다. */
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

  /**
   * setup 단계에서 나가기 (0085).
   *
   * ⚠️⚠️ **참가 버튼만 있고 나갈 문이 없으면 안 된다.** 초대 링크는 누가 일부러
   *    보내 준 것이라 오조작이 드물었지만, 피드 공개 모집은 "발견 → 참여하기"라
   *    잘못 누르는 일이 필연이다.
   *
   * 방장은 여기 안 온다 — 서버가 `host_cannot_leave`로 막고, 방장에게는 대신
   * `챌린지 취소`가 있다.
   */
  async function handleLeave() {
    if (!challenge || busy) return;
    if (!window.confirm("이 챌린지에서 나갈까요? 세운 목표도 지워져요.")) return;
    setBusy(true);
    try {
      await leaveSetupChallenge(challenge.id);
      showToast("챌린지에서 나왔어요");
      reload();
    } catch {
      showToast("나가지 못했어요");
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

  /**
   * ⚠️⚠️ **생성 시트의 기본 기간은 `defaultChallengePeriod`에서 온다** (2026-08-17).
   *
   * 옛 기본값은 `시작일 = 오늘`이었다. 그러면 만들자마자 초대 창이 닫힌다 —
   * `autostart_due_challenges`가 `start_date <= 오늘`인 `setup` 방을 전부
   * `active`로 올리고, 그 RPC는 **이 탭이 열릴 때마다** 돈다. 시작한 뒤에는
   * 초대 RPC가 전부 `invalid_status`라 아무도 못 들어온다.
   *
   * 운영 실측이 그 모양이었다 — 참가자 1명짜리 챌린지 14개,
   * 2026-07-31 하루에 7번의 생성·취소, 초대 링크로 들어온 신규 가입자 0명.
   *
   * ⚠️ 여기서 `dayKey(now, ...)`로 되돌리지 마라. 그게 그 버그다.
   */
  function openSheet(mode: "create" | "goals") {
    const period = defaultChallengePeriod(todayKey);
    setSheet({
      mode,
      defaults: {
        name: mode === "create" ? "" : challenge?.name ?? "",
        startDate: period.startDate,
        endDate: period.endDate,
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
    ? inclusiveDays(challenge.start_date, challenge.end_date)
    : 0;

  // 순위·진행률 계산 재료 (§7) — 목표 있는 참여자만
  // ⚠️ 조립은 `buildParticipantInput` 한 곳에서 한다 (2026-08-13). 여기서 손으로
  //    짜면 `planned_days ?? 5` 같은 기본값이 화면마다 갈린다.
  const participantInputs: ParticipantInput[] = members
    .filter((m) => (goalCountByUser.get(m.id) ?? 0) > 0)
    .map((m) =>
      buildParticipantInput({
        userId: m.id,
        goals: goals.filter((g) => g.user_id === m.id),
        stats: stats?.get(m.id) ?? EMPTY_STATS,
        periodDays: days,
      }),
    );

  const me = participantInputs.find((p) => p.userId === userId) ?? null;
  // ⚠️ 점수 조립도 한 곳에서 한다 — 옛 코드는 완료 목표 보너스를 여기서 손으로
  //    더하면서 "순위 계산과 동일하게"라고 주석으로 스스로를 경고하고 있었다.
  //    홈 챌린지 카드도 같은 `scoreParticipant`를 지난다(설계 §4.3).
  const myScore = me
    ? scoreParticipant(me)
    : { achievement: 0, participation: 0, overall: 0, completedGoalCount: 0 };
  const myAchievement = myScore.achievement;
  const myParticipation = myScore.participation;
  const myOverall = myScore.overall;

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
                <UiIcon name="camera" /> 사진 인증 필수 · 사진 없는 운동은 집계되지 않아요
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
      {/* ⚠️ **`group` 조건을 다시 붙이지 마라** (2026-08-08). 0062부터
          `create_challenge_room`이 그룹 없는 사람에게 개인 그룹을 스스로 만들어
          준다 — 서버는 이미 되는데 화면만 막고 있었다. 그래서 크루 없이 들어온
          사람에게 챌린지 탭이 `크루에 참여하면 챌린지를 만들 수 있어요`라는
          **막다른 길**이었다(옛 문구는 지웠다). 0061 이후 홈에는 크루를 만드는
          자리도 없으므로 그 안내는 갈 곳 없는 말이기도 했다.
          `handleCreate`는 `group`을 안 쓴다 — RPC가 준 `ch.group_id`를 쓴다. */}
      {challenges.length > 0 && (
        /* ⚠️ **회색 외곽선이 아니다** (2026-08-13 사용자 지시 "이 버튼도 좀 잘 보이게").
           옛 스타일은 `border-line bg-surface text-muted`라, 어두운 배경에서 흐린
           회색 글자가 되어 **비활성 버튼처럼** 보였다. 챌린지를 하나라도 가진
           사람에게 새 챌린지를 만드는 **유일한 입구**이므로 눌리는 것으로 읽혀야 한다.
           강조색을 쓰되 채우지는 않는다 — 금색으로 채우면 위 진행 카드의
           `오늘 운동하기`와 주·부가 겨룬다. */
        <button
          onClick={() => openSheet("create")}
          className="h-11 rounded-card border border-accent/40 bg-accent-weak text-[13px] font-extrabold text-accent"
        >
          ＋ 챌린지 추가하기
        </button>
      )}

      {/* ── 챌린지 없음 ─────────────────────────────── */}
      {/* ⚠️ 옛 블록(트로피 40px + `아직 진행 중인 챌린지가 없어요` +
          `＋ 새 챌린지 만들기 (기간·목표 설정)`)을 되살리지 마라. 2026-08-17에
          사용자 승인으로 교체했다 — 바꾼 이유와 실측치는 `start-card.tsx` 주석에
          있고, `start-card.test.tsx`가 옛 문구의 **부재**를 단언한다. */}
      {!challenge && (
        <ChallengeStartCard
          busy={busy}
          onInviteFirst={() => void handleInviteFirst()}
          onCreateAlone={() => openSheet("create")}
        />
      )}

      {/* ── setup: 전원 KPI 게이트 (§6) ─────────────── */}
      {/* 0044: 초대받았지만 아직 수락 안 함 — 수락 전에는 목표를 못 세운다 */}
      {challenge && challenge.myStatus === "invited" && (
        <section className="rounded-card border border-accent/40 bg-accent/10 p-4 shadow-card">
          <p className="text-sm font-extrabold">
              <UiIcon name="trophy" /> 챌린지에 초대받았어요
            </p>
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

      {/*
        초대 영역은 챌린지 상태와 무관하게 **같은 자리**에 둔다. setup 분기 안에만
        두면 시작된 챌린지에서 통째로 사라져 "왜 초대가 없지?"가 된다.
        시작 후에는 컴포넌트가 자리를 지키면서 닫힌 이유를 설명한다.
        (수락 전 초대장 상태에서는 위의 수락·거절 카드가 먼저다.)
      */}
      {challenge && challenge.myStatus !== "invited" && (
        <InviteSheet
          challengeId={challenge.id}
          myRole={challenge.myRole}
          status={challenge.status}
          discoverable={challenge.discoverable}
          onInvited={reload}
        />
      )}

      {challenge?.status === "setup" && challenge.myStatus !== "invited" && (
        <>
          {myGoals.length === 0 ? (
            <button
              onClick={() => openSheet("goals")}
              className="rounded-card border border-warn/40 bg-surface p-3.5 text-left text-[13px] font-bold text-warn shadow-card"
            >
              <UiIcon name="goal" /> 새 챌린지에 초대됐어요! <b>내 KPI를 설정</b>해야 시작돼요 ·
              설정하기 →
            </button>
          ) : (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold">
                  <UiIcon name="goal" /> 내 목표 {myGoals.length}개
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
                    {/* ⚠️ 아바타와 닉네임이 **한 버튼**이다. 아바타만 누르게 하면
                        8px짜리 과녁이 된다 — 피드·홈 친구목록도 같은 폭이다. */}
                    <button
                      type="button"
                      onClick={() => setProfileTarget(m)}
                      aria-label={`${m.nickname} 프로필 보기`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Avatar
                        src={m.avatar_url}
                        className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-base"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                        {m.nickname}
                        {m.id === userId && (
                          <span className="ml-1 text-faint">(나)</span>
                        )}
                      </span>
                    </button>
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
                          동의 <UiIcon name="thumbsup" size={14} />
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
            {/* ⚠️⚠️ **옛 문구는 자물쇠 + `전원 KPI 설정 + 전원 동의 시 챌린지가
                시작돼요`였고, 그건 사실이 아니었다.** `autostart_due_challenges()`가
                시작일에 동의 없이 챌린지를 연다(`docs/db-current-schema.sql:415` —
                목표가 없는 참가자만 `dropped`로 빼고 나머지는 그대로 시작한다).
                화면만 옛말을 해서 사용자는 안 막힌 문 앞에서 남을 기다렸다.

                ⚠️ 자물쇠를 떼면서 **다른 아이콘으로 바꾸지 않았다.**
                `public/ui-icons/`에 달력 그림이 없다 — 없는 이름을 주면 `UiIcon`이
                `/ui-icons/<name>.webp`를 그대로 요청해서 **깨진 이미지가 조용히
                뜬다.** 글자만으로 충분하다. */}
            <p className="mt-2 text-[11px] text-muted">{startHint?.notice}</p>
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
              {iApproved ? (
                "✓ 동의함 (누르면 철회)"
              ) : (
                <>
                  참가자 전원의 목표에 동의하기 <UiIcon name="thumbsup" />
                </>
              )}
            </button>
          )}

          {/* ⚠️ **금색 채움에서 테두리형으로 내렸다** (2026-08-14). 이 버튼은
              시작하는 **유일한 문이 아니라 지름길**이다 — 시작일이 오면
              autostart가 알아서 연다. 금색으로 채워 두면 "이걸 눌러야만
              시작된다"로 읽히고, 그게 이번에 고친 오해의 절반이었다.
              색 조합은 위 `＋ 챌린지 추가하기`와 같다 — 같은 무게의 보조 행동이다.
              라벨 조립은 `challengeStartHint`가 한다. */}
          <button
            onClick={handleStart}
            disabled={busy || !startHint?.canStartNow}
            className="h-12 rounded-card border border-accent/40 bg-accent-weak text-sm font-extrabold text-accent disabled:opacity-50"
          >
            {startHint?.buttonLabel}
          </button>
          {challenge.created_by === userId && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-50"
            >
              <UiIcon name="trash" /> 챌린지 취소하고 새로 만들기
            </button>
          )}

          {/*
            나가기 (0085) — 방장이 **아닌** 참가자에게만.

            ⚠️⚠️ 피드 공개 모집을 열면서 같이 넣는다. "발견 → 참여하기"는 잘못
               누르기 쉬운데, 여기까지 `challenge_participants`에는 SELECT 정책만
               있어서 **사용자가 스스로 나갈 방법이 아예 없었다.**

            방장에게는 안 보인다 — 방장이 사라지면 방을 시작할 사람이 없다.
            대신 위의 `챌린지 취소`가 있고, 서버도 `host_cannot_leave`로 막는다.
          */}
          {challenge.created_by !== userId && (
            <button
              onClick={handleLeave}
              disabled={busy}
              className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-50"
            >
              이 챌린지에서 나가기
            </button>
          )}
        </>
      )}

      {/* ── active: 내 진행률만 공개 (§6 비공개) ─────── */}
      {challenge?.status === "active" && detailsAreCurrent && (
        <>
          {/* ⚠️ **높이를 다시 늘리지 마라** (2026-08-13 사용자 지시 — 홈 카드에 이어
              이 카드도 "높이가 너무 높다"). 옛 구성은 `p-5` + 6줄이었다. 줄인 방법은
              홈 챌린지 카드와 같다 — 숫자 라벨을 값 **왼쪽**에 붙여 2단 스택을 한 줄로
              접고, `내 목표 N개`·`참여율`·`결과 발표`를 **한 줄로 합쳤다.**
              여기는 챌린지 탭의 대표 카드라 숫자만 홈(19px)보다 크게 둔다. */}
          <section className="rounded-card bg-gradient-to-br from-accent to-[#0B6E66] px-3.5 py-3 text-accent-ink shadow-card">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13.5px] font-extrabold">
                {challenge.name}
              </p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold">
                {levelLabel(levelOf(userId))}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] opacity-90">
                평균 달성{" "}
                <b className="font-mono text-[22px] font-extrabold">
                  {Math.round(myAchievement)}%
                </b>
              </p>
              <p className="flex-none text-[11px] opacity-90">
                종합점수{" "}
                <b className="font-mono text-[22px] font-extrabold">
                  {myOverall.toFixed(1)}
                </b>
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: `${Math.min(100, Math.round(myAchievement))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] opacity-95">
              목표 {me?.goals.length ?? 0}개 · 참여율{" "}
              {Math.round(myParticipation)}% · 결과 발표{" "}
              <b className="font-mono">
                {endedByDate ? "종료!" : `D-${Math.max(0, dday)}`}
              </b>
            </p>

            {/* ⚠️ 2026-08-13 추가. 이 탭에는 **"그래서 오늘 뭘 하면 되나"의 답이
                없었다** — 달성률만 보여 주고 운동으로 가는 문이 없어서, 기록하려면
                탭을 나갔다 다시 들어와야 했다.
                ⚠️ 목업에 있던 `상세 보기` 버튼은 넣지 않는다. 이 버튼 바로 아래가
                이미 상세(내 목표 진행률·참가자 성과·참여자 명단)라 자기 자신을
                가리키는 버튼이 된다.
                ⚠️ 종료일이 지난 뒤에는 할 일이 운동이 아니라 결과 발표다. */}
            {!endedByDate && (
              <Link
                href="/record"
                className="mt-2.5 flex h-10 items-center justify-center rounded-card-sm bg-white/20 text-[13px] font-extrabold text-accent-ink"
              >
                오늘 운동하기 ›
              </Link>
            )}
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

          {/* ⚠️ **한 줄은 접지 않는다** (2026-08-13). 이 배너는 "왜 남의 점수가
              안 보이나"의 답이라, 통째로 접으면 그 질문이 다시 생긴다. `CrewCard`가
              쓰는 접힘 규약과 같다 — 한 줄은 남기고 상세만 펼친다.
              ⚠️ 상세의 5일·2시간은 `viewing-pass.ts`의 `CHALLENGE_PASS_HOURS`와
              열람권 규칙에서 온 실제 값이다. 규칙이 바뀌면 이 문구도 같이 고쳐라. */}
          <div className="rounded-card border border-line bg-surface-2 p-3 text-[12px] font-bold text-muted">
            <div className="flex items-center justify-between gap-2">
              <span>
                <UiIcon name="lock" /> 공정성을 위해{" "}
                <b>기간 중에는 내 진행률만</b> 볼 수 있어요
              </span>
              <button
                type="button"
                onClick={() => setShowFairness((v) => !v)}
                aria-expanded={showFairness}
                className="flex-none text-[11px] font-bold text-accent"
              >
                자세히
              </button>
            </div>
            {showFairness && (
              <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-left text-[11.5px] leading-relaxed font-normal">
                <p>
                  다른 참가자의 점수와 순위는 <b>종료일에 한꺼번에</b> 공개돼요.
                  중간 순위를 보면 앞선 사람은 느슨해지고 뒤처진 사람은 포기하기
                  쉬워서예요.
                </p>
                <p>
                  <b>5일 연속</b> 운동하면 아래 참가자 성과가{" "}
                  <b>2시간 동안</b> 열려요.
                </p>
              </div>
            )}
          </div>

          {/* 자물쇠를 푸는 장치는 자물쇠 옆에 둔다 — 2026-08-07에 홈에서 옮겨 왔다.
              보고 있는 챌린지(selectedId)를 그대로 넘긴다: 카드가 스스로 대표를
              고르면 탭과 카드가 서로 다른 챌린지를 보여준다(설계 §6.7). */}
          {/* key: 챌린지를 바꾸면 리마운트시켜 이전 챌린지의 순위·열람 대상이
              남지 않게 한다. 카드 내부에서 비우려면 effect 본문 setState가 되어
              렌더가 연쇄된다(react-hooks/set-state-in-effect). */}
          <ParticipantPerformanceCard
            key={challenge.id}
            challengeId={challenge.id}
            endDate={challenge.end_date}
            completedAts={completedAts}
          />

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">
                참여자 ({members.length}명)
              </h3>
              <span className="text-xs text-muted"><UiIcon name="lock" size={13} /> 종료일 공개</span>
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => setProfileTarget(m)}
                  aria-label={`${m.nickname} 프로필 보기`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Avatar
                    src={m.avatar_url}
                    className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-base"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {m.nickname}
                    {m.id === userId && (
                      <span className="ml-1 text-faint">(나)</span>
                    )}
                  </span>
                </button>
                <span className="font-mono text-sm font-extrabold text-faint">
                  {m.id === userId ? (
                        `${Math.round(myAchievement)}%`
                      ) : (
                        <UiIcon name="lock" size={15} alt="비공개" />
                      )}
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
              <UiIcon name="trophy" /> 결과 발표하기
            </button>
          )}
          {challenge.created_by === userId && !endedByDate && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-50"
            >
              <UiIcon name="trash" /> 챌린지 취소
            </button>
          )}
        </>
      )}

      {/* ── ended: 시상대 + 상세 순위 (§6) ───────────── */}
      {challenge?.status === "ended" && detailsAreCurrent && (
        <>
          <ResultView
            participants={participantInputs}
            goals={goals}
            profileOf={profileOf}
            myUserId={userId}
            levelOf={levelOf}
            onProfileClick={setProfileTarget}
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

      {/* ⚠️ 여기에도 `group`을 붙이지 마라 — 붙이면 위에서 버튼만 보이고
          눌러도 시트가 안 열린다(같은 0062 이유). */}
      {sheet && (
        <ChallengeSetupSheet
          mode={sheet.mode}
          defaults={sheet.defaults}
          periodDaysFixed={sheet.mode === "goals" && challenge ? days : undefined}
          minStartDate={
            // ⚠️ 생성일 때만 건다. 목표 수정 시트는 날짜 칸이 아예 없어서,
            //    거기까지 걸면 막을 것도 없이 규칙만 늘어난다.
            sheet.mode === "create" ? earliestStartDate(todayKey) : undefined
          }
          prevGoals={prevGoals}
          busy={busy}
          onSubmit={sheet.mode === "create" ? handleCreate : handleSaveGoals}
          onClose={() => setSheet(null)}
        />
      )}

      {profileTarget && (
        <MemberProfileSheet
          userId={profileTarget.id}
          nickname={profileTarget.nickname}
          avatarUrl={profileTarget.avatar_url}
          viewerId={userId}
          source="challenge"
          onClose={() => setProfileTarget(null)}
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
  onProfileClick,
}: {
  participants: ParticipantInput[];
  goals: UserGoal[];
  profileOf: (id: string) => ChallengeParticipantProfile | undefined;
  myUserId: string;
  levelOf: (id: string) => number;
  /** ⚠️ 시트를 여기서 띄우지 않는다 — 화면에 시트가 둘이 된다 */
  onProfileClick: (p: ChallengeParticipantProfile) => void;
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
          <UiIcon name="trophy" /> 최종 순위 발표
        </h3>
        <div className="mt-4 flex items-end justify-center gap-2">
          {podiumOrder.map((r) => {
            const p = profileOf(r.userId);
            const h = heights[Math.min(r.rank, 3)];
            return (
              <div key={r.userId} className="flex w-20 flex-col items-center">
                {r.rank === 1 && <UiIcon name="crown" size={20} />}
                {/* ⚠️ 프로필을 못 찾으면(`p` 없음) 누를 수 없다 — 누구인지 모르는
                    대상의 시트를 열면 조회가 `not_crew`로 떨어진다. */}
                <button
                  type="button"
                  disabled={!p}
                  onClick={() => p && onProfileClick(p)}
                  aria-label={p ? `${p.nickname} 프로필 보기` : undefined}
                  className="flex w-full flex-col items-center disabled:cursor-default"
                >
                  <Avatar
                    src={p?.avatar_url}
                    className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-surface-2 text-xl"
                  />
                  <span className="mt-1 w-full truncate text-center text-xs font-extrabold">
                    {p?.nickname ?? "?"}
                  </span>
                </button>
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
