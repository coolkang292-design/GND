"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@/components/auth-provider";
import { ChallengeDetail } from "@/components/challenge/challenge-detail";
import { ChallengeManageSheet } from "@/components/challenge/challenge-manage-sheet";
import { CreateChallengeFlow } from "@/components/challenge/create-challenge-flow";
import { GoalSetupFlow } from "@/components/challenge/goal-setup-flow";
import { MyChallengeList } from "@/components/challenge/my-challenge-list";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import {
  DiscoverableChallengeList,
  useDiscoverableChallenges,
} from "@/components/feed/discoverable-challenges";
import { recordFunnelEvent } from "@/lib/analytics-events";
import {
  acceptChallengeInvite,
  approveChallengeGoals,
  cancelChallenge,
  clearPendingChallengeInvite,
  declineChallengeInvite,
  finalizeChallenge,
  getChallengeApprovals,
  getChallengeGoals,
  getChallengeParticipantProfiles,
  getMyChallenges,
  getMyGoalChallengeIds,
  getMyPreviousGoals,
  getPeriodStatsByUser,
  joinChallengeWithCode,
  leaveSetupChallenge,
  saveMyGoals,
  savePendingChallengeInvite,
  startChallenge,
  takeOnboardingNotice,
  unapproveChallengeGoals,
  type ChallengeParticipantProfile,
  type GoalDraft,
  type MyChallenge,
  type PeriodStats,
} from "@/lib/challenge";
import { errorMessage } from "@/lib/challenge-errors";
import { shareChallengeInvite, type ShareResult } from "@/lib/challenge-share";
import { getMyGroups, getMyProfile } from "@/lib/crew";
import { inviteShareMessage } from "@/lib/domain/challenge-invite";
import { formatMonthDay } from "@/lib/domain/challenge-time";
import { dayKey, resolveTimeZone } from "@/lib/domain/time";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCompletedSessions } from "@/lib/workout";
import type { Group, UserGoal } from "@/lib/types";

// 오류 문구는 여러 컴포넌트가 같이 쓰게 되어 `lib/challenge-errors.ts`로 옮겼다
// (2026-09-18). 이 이름으로 가져가던 곳(page.test)을 위해 그대로 내보낸다.
export { errorMessage };

const NO_CHALLENGE_MEMBERS: ChallengeParticipantProfile[] = [];
/** 참조 동일성 유지 — 성과 카드의 effect가 매 렌더마다 다시 돌지 않게 한다 */
const NO_COMPLETED_ATS: Date[] = [];
const NO_CHALLENGE_GOALS: UserGoal[] = [];
const NO_CHALLENGE_APPROVALS = new Set<string>();

/* ── 주소 = 화면 상태 (2026-09-18) ──────────────────────────────────────────
   `?open=<id>`가 있으면 상세, 없으면 목록이다. `?goal=1|joined`는 상세를 열면서
   목표 설정 시트를 같이 연다(`joined`는 "참여 완료!"를 붙인다).

   ⚠️ `useSearchParams`를 쓰지 않는다 — Suspense 경계를 요구해 빌드가 깨진다
      (이 저장소가 그 훅을 네 번 거부했다: feed·login·auth/callback·record-view).
      `useSyncExternalStore` + popstate + 자체 이벤트로 주소를 읽는다.
   ⚠️ 옛 화면은 `?open=`을 읽자마자 **주소에서 지웠다** — 칩으로 다른 챌린지를
      고를 수 있게 하려던 것이다. 이제는 목록이 따로 있고 뒤로가기가 목록으로
      돌아가야 하므로 **지우지 않는다.** 푸시·홈 카드·피드·온보딩이 여는 주소가
      그대로 상세의 고정 링크가 된다.
   ⚠️ 네이티브 `history.pushState`는 Next 14.1+에서 라우터와 연동된다(같은
      경로라 페이지는 다시 마운트되지 않는다). */
const URL_EVENT = "gnd:challenge-url";

function subscribeUrl(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_EVENT, onChange);
  };
}

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function goUrl(url: string, mode: "push" | "replace" = "push"): void {
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(URL_EVENT));
}

function detailUrl(id: string, goal?: "1" | "joined"): string {
  return `/challenge?open=${encodeURIComponent(id)}${goal ? `&goal=${goal}` : ""}`;
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
  /*
    챌린지 화면을 **봤다**는 기록 (배포 D). 참가는 `challenge_participants`가
    이미 정확히 알고 있어서 여기서 기록하지 않는다.
  */
  useEffect(() => {
    void recordFunnelEvent("challenge_viewed", userId);
  }, [userId]);

  const openId = useSyncExternalStore(subscribeUrl, () => readParam("open"), () => null);
  const goalParam = useSyncExternalStore(subscribeUrl, () => readParam("goal"), () => null);
  /** 목록에서 상세로 **우리가** 밀어 넣었는가 — 그렇다면 ←는 history.back()이다 */
  const pushedFromList = useRef(false);

  /**
   * 참가자 프로필 시트 (2026-08-19 사용자 요청).
   * ⚠️ **시트는 화면당 하나다.** 시상대(`ResultView`)도 이 상태를 쓴다.
   */
  const [profileTarget, setProfileTarget] = useState<{
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [challenges, setChallenges] = useState<MyChallenge[]>([]);
  const [goalChallengeIds, setGoalChallengeIds] = useState<Set<string>>(new Set());
  const [loadedMembers, setMembers] = useState<ChallengeParticipantProfile[]>([]);
  const [loadedGoals, setGoals] = useState<UserGoal[]>([]);
  const [loadedApprovals, setApprovals] = useState<Set<string>>(new Set());
  const [loadedStats, setStats] = useState<Map<string, PeriodStats> | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [completedAts, setCompletedAts] = useState<Date[]>(NO_COMPLETED_ATS);
  const [loadedPrevGoals, setPrevGoals] = useState<UserGoal[] | null>(null);
  const [loadedChallengeId, setLoadedChallengeId] = useState<string | null>(null);
  const [tab, setTab] = useState<"discover" | "mine" | null>(null);
  const [goalSheet, setGoalSheet] = useState<{ justJoined: boolean } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  /** 목록을 마지막으로 다 읽은 refreshKey — 참가 직후 새 방이 아직 목록에 없을 때
   *  "찾을 수 없어요"를 번쩍 띄우지 않으려고 둔다 */
  const [listLoadedKey, setListLoadedKey] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { items: discoverItems, setItems: setDiscoverItems } =
    useDiscoverableChallenges(refreshKey);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const openDetail = useCallback((id: string, goal?: "1" | "joined") => {
    pushedFromList.current = true;
    goUrl(detailUrl(id, goal));
  }, []);

  const backToList = useCallback(() => {
    setShare(null);
    setGoalSheet(null);
    setManageOpen(false);
    if (pushedFromList.current) {
      pushedFromList.current = false;
      window.history.back();
      return;
    }
    // 알림·홈 카드로 상세에 **바로** 들어왔다 — 뒤로가기는 앱 밖일 수 있다
    goUrl("/challenge", "replace");
  }, []);

  /**
   * 온보딩이 참가·친구 연결을 이미 끝냈을 때 남겨 둔 한 줄 (0063, 설계 §3.6).
   * `takeOnboardingNotice`가 한 번만 꺼내므로 새로고침해도 다시 뜨지 않는다.
   */
  useEffect(() => {
    const notice = takeOnboardingNotice();
    if (!notice) return;
    // ⚠️ effect 본문에서 바로 부르면 렌더가 연쇄된다(react-hooks/set-state-in-effect).
    queueMicrotask(() => showToast(notice));
  }, [showToast]);

  // 0049: 초대 링크(/challenge?join=GND-XXXXX)로 들어온 경우 먼저 참가시킨다.
  //
  // ⚠ 가드는 state가 아니라 ref다. state로 두면 개발 모드(StrictMode)에서 effect가
  //   두 번 도는 동안 첫 실행이 취소되며 가드도 주소 정리도 건너뛰고, 두 번째가
  //   같은 코드로 다시 참가를 시도해 "이미 참가한 챌린지예요"가 뜬다.
  const joinAttempted = useRef(false);
  useEffect(() => {
    if (joinAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (!code) return;
    // 0091: 링크를 준 사람. 못 믿는 값이라 서버가 "그 방의 참가자인가"를 확인한다.
    const invitedBy = params.get("by");
    joinAttempted.current = true;

    // 프로필이 없는 첫 방문자는 OnboardingGate가 곧바로 온보딩으로 보낸다.
    // 그 전에 코드를 보관해 둬야 닉네임을 정한 뒤 이어서 참가할 수 있다.
    savePendingChallengeInvite(code, invitedBy);

    (async () => {
      // 새 사용자는 아직 프로필이 없다. 여기서 먼저 참가시키면 보관 코드를 지워
      // 온보딩이 일반 화면으로 열린다 — 닉네임을 저장한 뒤 OnboardingPage가 참가시킨다.
      let profile;
      try {
        profile = await getMyProfile(userId);
      } catch {
        // 일시적인 조회 실패면 코드를 보존한다.
        return;
      }
      if (!profile) return;

      // 기존 사용자만 여기서 바로 참가한다. 주소에서 join을 먼저 지워
      // 새로고침·뒤로가기 때 같은 참가를 반복하지 않게 한다.
      window.history.replaceState(null, "", window.location.pathname);

      try {
        const r = await joinChallengeWithCode(code);
        // 참가한 방을 열고 목표 설정을 바로 띄운다 — "참여 → 주 몇 번 → 운동"
        goUrl(detailUrl(r.challengeId, "joined"), "replace");
        showToast(`${r.challengeName}에 참가했어요! 🎉`);
        clearPendingChallengeInvite();
      } catch (e) {
        showToast(errorMessage(e));
        // 이미 참가했거나 코드가 잘못됐으면 보관해 둘 이유가 없다.
        clearPendingChallengeInvite();
      } finally {
        reload();
      }
    })();
  }, [userId, showToast, reload]);

  // ── 목록 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 0044: 크론(09:00 KST)을 기다리지 않고 화면 진입 시에도 도래분을 넘긴다.
        // 멱등이라 여러 번 불려도 안전하다. 실패는 무시한다.
        try {
          const sb = getSupabaseBrowserClient();
          await Promise.all([
            sb.rpc("autostart_due_challenges"),
            sb.rpc("autofinalize_due_challenges"),
          ]);
        } catch {
          /* 전환 실패는 조용히 넘긴다 */
        }

        // 챌린지 목록은 그룹과 무관하게 가져온다(타 그룹에서 초대받은 사람 포함).
        const [groups, profile, myChallenges, sessions, goalIds] = await Promise.all([
          getMyGroups(),
          getMyProfile(userId),
          getMyChallenges(userId),
          getCompletedSessions(userId),
          // 카드의 대표 버튼(내 목표 정하기 / 시작 준비 보기)을 가른다. 실패해도
          // 목록은 연다 — 버튼이 "내 목표 정하기"로 보일 뿐이다.
          getMyGoalChallengeIds(userId).catch(() => new Set<string>()),
        ]);
        if (cancelled) return;
        setCompletedAts(sessions.map((s) => s.completedAt));
        setGroup(groups[0] ?? null);
        setTimeZone(profile?.timezone || resolveTimeZone());
        setChallenges(myChallenges);
        setGoalChallengeIds(goalIds);
        setListLoadedKey(refreshKey);
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

  const challenge = challenges.find((c) => c.id === openId) ?? null;
  // 선택 번호와 상세 정보의 주인이 다르면 화면에 그리지 않는다 — 한 프레임에도
  // 이전 챌린지 정보가 새 제목 아래 보이지 않게 하는 안전장치다.
  const detailsAreCurrent = openId !== null && loadedChallengeId === openId;
  const members = detailsAreCurrent ? loadedMembers : NO_CHALLENGE_MEMBERS;
  const goals = detailsAreCurrent ? loadedGoals : NO_CHALLENGE_GOALS;
  const approvals = detailsAreCurrent ? loadedApprovals : NO_CHALLENGE_APPROVALS;
  const stats = detailsAreCurrent ? loadedStats : null;
  const prevGoals = detailsAreCurrent ? loadedPrevGoals : null;

  // ── 상세 ── **openId에 반드시 반응해야 한다** (2026-07-31 사용자 신고:
  // "챌린지를 추가해도 기존 챌린지 멤버가 포함돼 구성된다").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ch = challenges.find((c) => c.id === openId) ?? null;
      if (!ch) {
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

      // 새 응답을 기다리거나 조회가 실패했을 때 이전 챌린지의 정보가 남지 않게 비운다.
      setMembers([]);
      setGoals([]);
      setApprovals(new Set());
      setStats(null);
      setPrevGoals(null);
      setLoadedChallengeId(null);

      try {
        // 참여자 명단은 그룹이 아니라 **이 챌린지의 참가자**다.
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

        // 지난 목표 불러오기 재료 — 그룹 기준 조회라 그룹이 있을 때만 채운다.
        if (group && ch.status === "setup") {
          const prev = await getMyPreviousGoals(userId, group.id, ch.id);
          if (cancelled) return;
          setPrevGoals(prev);
        }
      } catch {
        if (!cancelled) showToast("챌린지 정보를 불러오지 못했어요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, openId, challenges, group, timeZone, refreshKey, showToast]);

  const myGoals = useMemo(() => goals.filter((g) => g.user_id === userId), [goals, userId]);
  const todayKey = dayKey(new Date(), timeZone);

  // `?goal=` — 상세를 열면서 목표 시트를 띄운다. 참가했고, 준비 중이고, **아직
  // 목표가 없을 때만**(목표가 있는 사람에게 시트를 억지로 띄우지 않는다).
  // 한 번 쓰면 주소에서 뗀다 — 새로고침마다 다시 뜨지 않게.
  useEffect(() => {
    if (!goalParam || !openId || !detailsAreCurrent || !challenge) return;
    const eligible =
      challenge.status === "setup" &&
      challenge.myStatus === "joined" &&
      myGoals.length === 0;
    const justJoined = goalParam === "joined";
    goUrl(detailUrl(openId), "replace");
    if (!eligible) return;
    queueMicrotask(() => setGoalSheet({ justJoined }));
  }, [goalParam, openId, detailsAreCurrent, challenge, myGoals.length]);

  // ── 행동 ──────────────────────────────────────────────────────────────

  async function handleSaveGoals(v: { goals: GoalDraft[]; plannedDays: number }) {
    if (!challenge) return;
    setBusy(true);
    try {
      await saveMyGoals({
        userId,
        challengeId: challenge.id,
        // 0044: 내 그룹이 아니라 **챌린지의** 그룹이다(goals_insert_own_setup).
        groupId: challenge.group_id,
        goals: v.goals,
        plannedDays: v.plannedDays,
      });
      setGoalSheet(null);
      showToast(
        challenge.start_date > todayKey
          ? `목표를 정했어요 — ${formatMonthDay(challenge.start_date)}에 시작하면 알려드릴게요 🏁`
          : "목표를 정했어요 — 곧 시작해요 🏁",
      );
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
      showToast("참가했어요! 🎉");
      setGoalSheet({ justJoined: true });
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
      // 거절은 참가 행을 지운다 = 이 챌린지를 더 못 읽는다. 목록에서도 뺀다.
      setChallenges((list) => list.filter((c) => c.id !== challenge.id));
      showToast("초대를 거절했어요");
      backToList();
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

  async function handleApprove(currentlyApproved: boolean) {
    if (!challenge) return;
    setBusy(true);
    try {
      if (currentlyApproved) await unapproveChallengeGoals(challenge.id);
      else await approveChallengeGoals(challenge.id);
      reload();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * setup 단계에서 나가기 (0085). ⚠️ 참가 버튼만 있고 나갈 문이 없으면 안 된다 —
   * 공개 모집은 "발견 → 참여하기"라 잘못 누르는 일이 필연이다.
   * 방장은 여기 안 온다(서버 `host_cannot_leave`) — 방장에게는 ⋯의 취소가 있다.
   */
  async function handleLeave() {
    if (!challenge || busy) return;
    if (!window.confirm("이 챌린지에서 나갈까요? 세운 목표도 지워져요.")) return;
    setBusy(true);
    try {
      await leaveSetupChallenge(challenge.id);
      showToast("챌린지에서 나왔어요");
      setChallenges((list) => list.filter((c) => c.id !== challenge.id));
      backToList();
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
      setChallenges((list) => list.filter((c) => c.id !== challenge.id));
      showToast("챌린지를 취소했어요");
      backToList();
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

  async function handleShare() {
    if (!challenge) return;
    const r = await shareChallengeInvite({
      challengeId: challenge.id,
      challengeName: challenge.name,
      inviteCode: challenge.invite_code ?? null,
      userId,
    });
    setShare(r);
    if (r.url) showToast(inviteShareMessage(r.outcome));
  }

  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }

  const activeTab = tab ?? (challenges.length > 0 ? "mine" : "discover");
  const createButton = (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="h-11 rounded-card bg-accent px-5 text-[14px] font-extrabold text-accent-ink"
    >
      ＋ 챌린지 만들기
    </button>
  );

  return (
    <>
      {openId ? (
        !challenge && listLoadedKey !== refreshKey ? (
          <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>
        ) : challenge ? (
          <ChallengeDetail
            challenge={challenge}
            userId={userId}
            todayKey={todayKey}
            detailsAreCurrent={detailsAreCurrent}
            members={members}
            goals={goals}
            approvals={approvals}
            stats={stats}
            completedAts={completedAts}
            busy={busy}
            share={share}
            onBack={backToList}
            onOpenGoals={() => setGoalSheet({ justJoined: false })}
            onAcceptInvite={() => void handleAcceptInvite()}
            onDeclineInvite={() => void handleDeclineInvite()}
            onStart={() => void handleStart()}
            onApprove={(approved) => void handleApprove(approved)}
            onLeave={() => void handleLeave()}
            onFinalize={() => void handleFinalize()}
            onShare={() => void handleShare()}
            onOpenManage={() => setManageOpen(true)}
            onProfile={setProfileTarget}
            onCreate={() => setCreateOpen(true)}
            onGoalRaised={reload}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 pt-16 text-center">
            <p className="text-sm font-bold">챌린지를 찾을 수 없어요</p>
            <p className="text-xs text-muted">
              취소됐거나 참가하지 않은 챌린지예요.
            </p>
            <button
              type="button"
              onClick={backToList}
              className="h-10 rounded-card-sm border border-line bg-surface px-4 text-[13px] font-bold"
            >
              챌린지 목록으로
            </button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3 pb-10">
          <header className="flex items-center justify-between pt-2 pb-1">
            <h1 className="text-[22px] font-extrabold tracking-tight">챌린지</h1>
            {/* 만들기는 **언제나** 보인다 — 챌린지가 있든 없든 (0044 이후 개수 제한 없음) */}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-9 rounded-full bg-accent px-4 text-[13px] font-extrabold text-accent-ink"
            >
              ＋ 만들기
            </button>
          </header>

          <div
            role="tablist"
            aria-label="챌린지 보기"
            className="grid grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1"
          >
            {(
              [
                ["discover", "둘러보기"],
                ["mine", "내 챌린지"],
              ] as const
            ).map(([key, label]) => {
              const on = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(key)}
                  className={`h-10 rounded-card-sm text-[14px] font-extrabold ${
                    on ? "border border-accent bg-accent/15 text-accent" : "text-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {activeTab === "discover" ? (
            <DiscoverableChallengeList
              variant="compact"
              items={discoverItems}
              setItems={setDiscoverItems}
              onOpen={(id, joined) => {
                reload();
                openDetail(id, joined === "now" ? "joined" : undefined);
              }}
              emptyAction={createButton}
            />
          ) : challenges.length === 0 ? (
            <section className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
              <p className="text-sm font-bold">아직 참여한 챌린지가 없어요</p>
              <p className="mt-1 text-xs text-muted">
                친구와 같이 하거나, 모집 중인 챌린지에 참여해 보세요
              </p>
              <div className="mt-3 flex flex-col items-center gap-2">
                {createButton}
                <button
                  type="button"
                  onClick={() => setTab("discover")}
                  className="text-[13px] font-bold text-accent"
                >
                  모집 중인 챌린지 둘러보기 ›
                </button>
              </div>
            </section>
          ) : (
            <MyChallengeList
              challenges={challenges}
              goalChallengeIds={goalChallengeIds}
              todayKey={todayKey}
              onOpen={(id) => openDetail(id)}
              onSetGoal={(id) => openDetail(id, "1")}
            />
          )}
        </div>
      )}

      {goalSheet && challenge && (
        <GoalSetupFlow
          key={challenge.id}
          userId={userId}
          challengeName={challenge.name}
          startDate={challenge.start_date}
          endDate={challenge.end_date}
          todayKey={todayKey}
          photoRequired={challenge.photo_required}
          myGoals={myGoals}
          prevGoals={prevGoals}
          justJoined={goalSheet.justJoined}
          busy={busy}
          onSubmit={(v) => void handleSaveGoals(v)}
          onClose={() => setGoalSheet(null)}
        />
      )}

      {createOpen && (
        <CreateChallengeFlow
          userId={userId}
          todayKey={todayKey}
          onCreated={() => {
            // ⚠️ 여기서 reload()해도 초대가 닫히지 않는다 — 시작일이 최소 내일이라
            //    autostart가 이 방을 건드리지 않는다(`challengePeriodFor`).
            reload();
          }}
          onClose={(createdId) => {
            setCreateOpen(false);
            if (createdId) openDetail(createdId);
          }}
          onSetGoal={(id) => {
            setCreateOpen(false);
            openDetail(id, "1");
          }}
        />
      )}

      {manageOpen && challenge && (
        <ChallengeManageSheet
          challenge={challenge}
          busy={busy}
          onChanged={reload}
          onCancelChallenge={() => void handleCancel()}
          onClose={() => {
            setManageOpen(false);
            reload();
          }}
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
    </>
  );
}
