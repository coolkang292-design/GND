"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ChallengeActivity } from "@/components/challenge/challenge-activity";
import { ResultView } from "@/components/challenge/challenge-result";
import { CompetitionTab } from "@/components/challenge/competition/competition-tab";
import { RankingScreen } from "@/components/challenge/competition/ranking-screen";
import type { RankingKey } from "@/components/challenge/competition/metric-selector";
import { ChallengeHero } from "@/components/challenge/detail/challenge-hero";
import { DetailTabs } from "@/components/challenge/detail/detail-tabs";
import { RaiseGoalSheet } from "@/components/challenge/raise-goal-sheet";
import { Chip } from "@/components/ui/chip";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  EMPTY_STATS,
  GOAL_TYPE_META,
  buildParticipantInput,
  goalLabel,
  type ChallengeParticipantProfile,
  type MyChallenge,
  type PeriodSessionRow,
  type PeriodStats,
} from "@/lib/challenge";
import type { PlanInput } from "@/lib/domain/challenge-report";
import { detailArtFor } from "@/lib/domain/challenge-art";
import { isLocalOnlyUrl, type ShareResult } from "@/lib/challenge-share";
import { inviteShareMessage } from "@/lib/domain/challenge-invite";
import {
  challengeDday,
  challengeStartHint,
  formatMonthDay,
  inclusiveDays,
} from "@/lib/domain/challenge-time";
import {
  goalRate,
  rankParticipants,
  scoreParticipant,
  type GoalType,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { challengeLevel, levelLabel } from "@/lib/domain/level";
import { challengeDayProgress, primaryActionOf } from "@/lib/domain/my-challenges";
import { challengeMilestones, type ChallengeMilestone } from "@/lib/domain/challenge-milestones";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import type { UserGoal } from "@/lib/types";

type Profile = ChallengeParticipantProfile;

/** 마일스톤 한 칸 — 육각 프레임(패키지 `decorations/*`) 위에 숫자는 글자로 겹친다 */
type ActiveTab = "overview" | "ranking" | "feed" | "mission";
const ACTIVE_TABS: readonly { key: ActiveTab; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "ranking", label: "랭킹" },
  { key: "feed", label: "피드" },
  { key: "mission", label: "미션" },
];

function MilestoneCard({ m }: { m: ChallengeMilestone }) {
  const done = m.state === "done";
  return (
    <div
      className={`flex min-w-0 flex-col items-center rounded-card-sm border px-1.5 py-2.5 text-center ${
        done ? "border-gold/60 bg-gold-weak/40" : "border-line bg-surface-2/60"
      }`}
    >
      <span className="relative grid h-11 w-11 place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/gnd/decorations/${done ? "gold" : "graphite"}-64.webp`}
          alt=""
          width={44}
          height={44}
          className={`absolute inset-0 h-full w-full ${m.state === "locked" ? "opacity-50" : ""}`}
        />
        <span className={`relative text-[14px] font-black ${done ? "text-gold" : "text-text"}`}>
          {m.badge}
        </span>
      </span>
      <span className="mt-1.5 w-full truncate text-[12px] font-extrabold">{m.title}</span>
      {m.state === "done" && <span className="text-[11px] font-bold text-gold">달성 완료</span>}
      {m.state === "progress" && (
        <span className="mt-1 block h-1 w-[80%] overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(m.ratio * 100)}%` }} />
        </span>
      )}
      {m.state === "progress" && <span className="mt-0.5 text-[10.5px] text-muted">진행 중</span>}
      {m.state === "locked" && (
        <span className="flex items-center gap-0.5 text-[10.5px] text-muted">
          <Icon name="lock" size={11} /> 잠금 중
        </span>
      )}
    </div>
  );
}

/** 4칸 정보줄 한 칸 — 아이콘 · 값 · 라벨 (시안 `12일 / 남은 기간`) */
function InfoCell({
  icon,
  value,
  label,
  accent = false,
}: {
  icon: IconName;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
      <Icon name={icon} size={20} className="text-accent" />
      <strong className={`truncate text-[14px] font-black ${accent ? "text-accent" : ""}`}>{value}</strong>
      <span className="truncate text-[10.5px] text-muted">{label}</span>
    </div>
  );
}

/**
 * 챌린지 상세 (2026-09-18 챌린지 탭 개편 — 옛 `challenge/page.tsx` 본문을 옮겼다).
 *
 * 한 화면에 **대표 버튼 하나**다(`primaryActionOf(…, "detail")`):
 *   초대받음 → 참여하기 · 목표 없음 → 내 목표 정하기 · 준비 완료 → 친구 초대하기 ·
 *   진행 중 → 오늘 운동하기 · 종료일 지남 → 결과 발표하기 · 종료 → (결과가 곧 내용)
 * 나머지(일찍 시작하기·나가기)는 보조 행동으로 내렸고, 방장 관리 기능은 ⋯로 옮겼다.
 *
 * ⚠️ 진행 중·종료 블록의 계산과 문구는 **옮기기만 했다.** 점수는 `scoreParticipant`,
 *    조립은 `buildParticipantInput` 한 곳 — 홈 카드와 같은 숫자여야 한다.
 */
export function ChallengeDetail({
  challenge,
  userId,
  todayKey,
  detailsAreCurrent,
  members,
  goals,
  approvals,
  stats,
  sessionRows,
  plans,
  timeZone,
  completedAts,
  busy,
  share,
  onBack,
  onOpenGoals,
  onAcceptInvite,
  onDeclineInvite,
  onStart,
  onApprove,
  onLeave,
  onCancelChallenge,
  onFinalize,
  onShare,
  onOpenManage,
  onProfile,
  onDiscover,
  onGoalRaised,
}: {
  challenge: MyChallenge;
  userId: string;
  todayKey: string;
  /** 참가자·목표·실적이 **이 챌린지의 것**으로 다 도착했는가 */
  detailsAreCurrent: boolean;
  members: readonly Profile[];
  goals: readonly UserGoal[];
  approvals: ReadonlySet<string>;
  stats: Map<string, PeriodStats> | null;
  /** 점수와 같은 RPC 행 — 결과 화면(종료)·경쟁 현황(진행 중) 재료 (2026-10-07) */
  sessionRows: readonly PeriodSessionRow[] | null;
  /** 내 계획 — 결과 화면 일별 활동의 회색 막대 */
  plans: readonly PlanInput[];
  timeZone: string;
  completedAts: Date[];
  busy: boolean;
  /** 마지막 공유 결과 — 직접 복사해야 하면 링크를 보여준다 */
  share: ShareResult | null;
  onBack: () => void;
  onOpenGoals: () => void;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  onStart: () => void;
  onApprove: (approved: boolean) => void;
  onLeave: () => void;
  /** 방장 — 준비 중 화면에 바로 보이는 취소 (2026-10-07). 확인창·RPC는 부르는 쪽 */
  onCancelChallenge: () => void;
  onFinalize: () => void;
  onShare: () => void;
  onOpenManage: () => void;
  onProfile: (p: Profile) => void;
  /** 종료 화면 `다음 챌린지 참여하기` → 둘러보기 (2026-10-07 결정) */
  onDiscover: () => void;
  onGoalRaised: () => void;
}) {
  /** 공정성 안내 상세 접힘 — 기본은 접힌다 (2026-08-13, CrewCard와 같은 규약) */
  const [showFairness, setShowFairness] = useState(false);
  /** 목표 올리기 시트 (0090) */
  const [raisingGoals, setRaisingGoals] = useState(false);
  /** 진행 중 상세 탭 — 최종 시안(2026-10-07)은 `랭킹`이 첫 화면이다 */
  const [activeTab, setActiveTab] = useState<ActiveTab>("ranking");
  /** 진행 중 `챌린지 랭킹` 하위 화면 — 열려 있으면 처음 고를 지표 */
  const [rankingView, setRankingView] = useState<RankingKey | null>(null);

  const isHost = challenge.created_by === userId;
  const invited = challenge.myStatus === "invited";

  const myGoals = useMemo(() => goals.filter((g) => g.user_id === userId), [goals, userId]);
  const goalsByUser = useMemo(() => {
    const m = new Map<string, UserGoal[]>();
    for (const g of goals) {
      const list = m.get(g.user_id) ?? [];
      list.push(g);
      m.set(g.user_id, list);
    }
    return m;
  }, [goals]);
  const hasGoals = (id: string) => (goalsByUser.get(id)?.length ?? 0) > 0;

  const allSet = members.length > 0 && members.every((m) => hasGoals(m.id));
  const allApproved = members.length > 0 && members.every((m) => approvals.has(m.id));
  const iApproved = approvals.has(userId);
  const approvedCount = members.filter((m) => approvals.has(m.id)).length;
  const readyCount = members.filter((m) => hasGoals(m.id)).length;

  const endedByDate = challenge.end_date < todayKey;
  const dday = challengeDday(todayKey, challenge.end_date);
  const days = inclusiveDays(challenge.start_date, challenge.end_date);

  // setup 구간의 안내문·버튼 라벨. 조립은 도메인에서 한다(`challengeStartHint` 주석).
  const startHint = challengeStartHint({
    startDateKey: challenge.start_date,
    todayKey,
    allSet,
    allApproved,
    approvedCount,
    memberCount: members.length,
  });

  const action = primaryActionOf(
    { ...challenge, hasMyGoals: myGoals.length > 0, endedByDate },
    "detail",
  );

  // 순위·진행률 계산 재료 (§7) — 목표 있는 참여자만.
  // ⚠️ 조립은 `buildParticipantInput` 한 곳에서 한다 (2026-08-13).
  const participantInputs: ParticipantInput[] = members
    .filter((m) => hasGoals(m.id))
    .map((m) =>
      buildParticipantInput({
        userId: m.id,
        goals: goals.filter((g) => g.user_id === m.id),
        stats: stats?.get(m.id) ?? EMPTY_STATS,
        periodDays: days,
      }),
    );
  const me = participantInputs.find((p) => p.userId === userId) ?? null;
  const myScore = me
    ? scoreParticipant(me)
    : { achievement: 0, participation: 0, overall: 0, completedGoalCount: 0 };
  const myQualifier = (type: GoalType) =>
    myGoals.find((x) => x.goal_type === type)?.qualifier;
  const profileOf = (id: string) => members.find((m) => m.id === id);
  const levelOf = (id: string): number =>
    challengeLevel(
      stats?.get(id)?.workoutDayKeys ?? [],
      challenge.start_date,
      challenge.end_date,
      todayKey,
    );

  const canShare = challenge.status === "setup" && challenge.myStatus === "joined";
  /** 히어로 DAY 막대 — 목록 카드와 같은 날짜 진행 */
  const dayProgress = challengeDayProgress(todayKey, challenge.start_date, challenge.end_date);
  /** 히어로의 `N DAY STREAK` — 홈과 같은 원천(내 전체 완료 기록, `currentStreak`) */
  const myStreak = useMemo(() => {
    const keys = workoutDayKeys(completedAts, DEFAULT_TIMEZONE);
    return currentStreak(keys, todayKey);
  }, [completedAts, todayKey]);
  /**
   * 실시간 랭킹 (0115) — 방장이 만들 때 켠 방만. 종료 시상대와 **같은 자**
   * (`rankParticipants` = 종합점수, 동점 같은 등수)로 잰다.
   */
  const liveRanked =
    challenge.status === "active" && challenge.live_ranking
      ? rankParticipants(participantInputs)
      : null;
  const myRank = liveRanked?.find((r) => r.userId === userId)?.rank ?? null;
  /** 오늘 이 챌린지 기간 운동일에 들어갔는가 — 서버 집계(`stats`)와 같은 원천 */
  const todayDone = stats?.get(userId)?.workoutDayKeys.includes(todayKey) ?? false;

  const primaryButton =
    action.kind === "none" ? null : action.kind === "goto_record" ? null : (
      <button
        type="button"
        onClick={
          action.kind === "open_goal_setup"
            ? onOpenGoals
            : action.kind === "accept_invite"
              ? onAcceptInvite
              : action.kind === "share_invite"
                ? onShare
                : action.kind === "finalize"
                  ? onFinalize
                  : undefined
        }
        disabled={busy}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-extrabold text-accent-ink active:bg-accent-press disabled:opacity-60"
      >
        {action.kind === "finalize" && <Icon name="trophy" size={18} />}
        {action.label}
      </button>
    );

  // 종료 — 시안(2026-10-07)의 결과 화면이 상세 전체다(머리·히어로 포함).
  // ⚠️ 이 위에 훅을 모두 둔다. 이 아래로 훅을 옮기면 상태에 따라 훅 수가 달라진다.
  if (challenge.status === "ended" && detailsAreCurrent) {
    return (
      <ResultView
        challenge={challenge}
        members={members}
        participants={participantInputs}
        goals={[...goals]}
        sessionRows={sessionRows ?? []}
        plans={plans}
        timeZone={timeZone}
        profileOf={profileOf}
        myUserId={userId}
        onBack={onBack}
        onProfileClick={onProfile}
        onDiscover={onDiscover}
      />
    );
  }

  // 진행 중 집계 끝 = 오늘(종료일을 넘지 않게). 종목별 랭킹·내 진행 현황이 같은 끝을 쓴다
  const competitionEndKey = todayKey < challenge.end_date ? todayKey : challenge.end_date;

  // 진행 중 `챌린지 랭킹` 하위 화면 — 상세 전체를 대신한다(뒤로 = 상세)
  if (challenge.status === "active" && detailsAreCurrent && rankingView) {
    return (
      <RankingScreen
        rows={sessionRows ?? []}
        members={members}
        myUserId={userId}
        startDate={challenge.start_date}
        endDate={challenge.end_date}
        endKey={competitionEndKey}
        todayKey={todayKey}
        timeZone={timeZone}
        myGoals={myGoals}
        initial={rankingView}
        overallRanked={liveRanked}
        onBack={() => setRankingView(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-10">
      {challenge.status === "active" ? (
        <>
          {/* ── 진행 중 머리·히어로·탭 (최종 시안 2026-10-07) ─────────── */}
          <header className="flex h-11 items-center gap-1">
            <button
              type="button"
              onClick={onBack}
              aria-label="챌린지 목록으로"
              className="tap-44 grid h-10 w-10 flex-none place-items-center rounded-full text-text"
            >
              <Icon name="back" size={22} />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-[15px] font-extrabold">챌린지 상세</p>
            {isHost ? (
              <button
                type="button"
                onClick={onOpenManage}
                aria-label="챌린지 관리"
                className="tap-44 grid h-10 w-10 flex-none place-items-center rounded-full text-text"
              >
                <Icon name="settings" size={21} />
              </button>
            ) : (
              <span className="h-10 w-10 flex-none" />
            )}
          </header>
          <ChallengeHero
            name={challenge.name}
            startDate={challenge.start_date}
            endDate={challenge.end_date}
            recruitImageUrl={challenge.recruit_image_url}
            status="active"
            dday={Math.max(0, dday)}
            members={members}
          />
          <DetailTabs tabs={ACTIVE_TABS} value={activeTab} onChange={setActiveTab} />
        </>
      ) : (
        <>
      {/* ── 머리 ─────────────────────────────────────────── */}
      <header className="flex h-11 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="챌린지 목록으로"
          className="tap-44 grid h-10 w-10 flex-none place-items-center rounded-full text-text"
        >
          <Icon name="back" size={22} />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold">챌린지</p>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            aria-label="초대 링크 공유"
            className="tap-44 grid h-10 w-10 flex-none place-items-center rounded-full text-text"
          >
            <Icon name="users" size={21} />
          </button>
        )}
        {isHost && (
          <button
            type="button"
            onClick={onOpenManage}
            aria-label="챌린지 관리"
            className="tap-44 grid h-10 w-10 flex-none place-items-center rounded-full text-text"
          >
            <Icon name="settings" size={21} />
          </button>
        )}
      </header>

      {/* ── 히어로 (2026-10-05 Performance Social 챌린지 시안) ─────────
          사진 위에 연속일 · 이름 · 기간, 진행 중이면 DAY 진행 막대 · 참여 인원 · 남은 날 ·
          `오늘 운동하기`까지 한 장에 담는다.
          ⚠️ 사용자 사진이 언제나 이긴다(`detailArtFor`).
          ⚠️ DAY 막대는 **날짜** 진행이다(목록 카드와 같은 `challengeDayProgress`) — 운동
             실적이 아니다. 실적은 아래 `내 진행`이 말한다. */}
      <section className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
        <div className="relative h-[190px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detailArtFor(challenge.recruit_image_url)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-surface/5" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between p-4">
            <div className="flex flex-wrap gap-1.5">
              {challenge.status === "setup" && <Chip dot="warn">준비 중</Chip>}
              {challenge.status === "ended" && <Chip dot="muted">종료</Chip>}
            </div>
            <div>
              <h1 className="line-clamp-2 max-w-[86%] text-[28px] leading-[1.1] font-black italic tracking-tight">
                {challenge.name}
              </h1>
              <p className="mt-1 text-[12.5px] text-muted">
                {formatMonthDay(challenge.start_date)} ~ {formatMonthDay(challenge.end_date)} ·{" "}
                {days}일간
              </p>
            </div>
          </div>
        </div>

      </section>
        </>
      )}

      {(challenge.recruit_note && challenge.status === "setup") || challenge.photo_required ? (
        <div>
          {challenge.recruit_note && challenge.status === "setup" && (
            <p className="text-[13px] leading-relaxed break-words whitespace-pre-line text-muted">
              {challenge.recruit_note}
            </p>
          )}
          {challenge.photo_required && (
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-card-sm border border-line bg-surface-2/60 px-3 py-2 text-[12px] font-bold">
              <Icon name="camera" size={15} className="text-accent" />
              사진 인증 필수 · 사진 없는 운동은 집계되지 않아요
            </span>
          )}
        </div>
      ) : null}

      {/* ── 초대받음 ─────────────────────────────────────── */}
      {invited && (
        <section className="rounded-card border border-accent/50 bg-surface p-4 shadow-card">
          <p className="flex items-center gap-1.5 text-sm font-extrabold">
            <Icon name="trophy" size={17} className="text-accent" /> 챌린지에 초대받았어요
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {formatMonthDay(challenge.start_date)}에 시작해요 · 참여하면 주 몇 번 운동할지만
            정하면 돼요
          </p>
        </section>
      )}

      {/* ── 준비 중 ──────────────────────────────────────── */}
      {challenge.status === "setup" && !invited && (
        <section className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold">시작 준비</h2>
            <span className="text-xs text-muted">
              {readyCount} / {members.length} 준비 완료
            </span>
          </div>
          {/* ⚠️⚠️ 옛 문구 `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`는 사실이
              아니었다. `autostart_due_challenges()`는 시작일에 **동의 없이** 연다
              (목표가 없는 사람만 dropped). 문구는 `challengeStartHint`가 만든다. */}
          <p className="mt-1 text-[12px] text-muted">{startHint.notice}</p>

          {myGoals.length > 0 && (
            <div className="mt-3 rounded-card-sm bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
                  <Icon name="target" size={15} className="text-accent" /> 내 목표
                </p>
                <button
                  type="button"
                  onClick={onOpenGoals}
                  className="text-xs font-bold text-accent"
                >
                  수정
                </button>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {myGoals.map((g) => (
                  <li key={g.id} className="flex justify-between text-[12.5px]">
                    <span>{goalLabel(g.goal_type, g.qualifier)}</span>
                    <span className="font-mono font-bold">
                      {Number(g.target_value).toLocaleString()}
                      {g.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-3 flex flex-col">
            {members.map((m) => {
              const ready = hasGoals(m.id);
              const theirs = goalsByUser.get(m.id) ?? [];
              return (
                <li key={m.id} className="border-t border-line py-2 first:border-t-0">
                  <div className="flex items-center gap-2.5">
                    {/* ⚠️ 아바타와 닉네임이 **한 버튼**이다 — 8px짜리 과녁을 만들지 않는다 */}
                    <button
                      type="button"
                      onClick={() => onProfile(m)}
                      aria-label={`${m.nickname} 프로필 보기`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Avatar
                        src={m.avatar_url}
                        className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-base"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                        {m.nickname}
                        {m.id === userId && <span className="ml-1 text-faint">(나)</span>}
                      </span>
                    </button>
                    <Chip dot={ready ? "good" : "muted"}>
                      {ready ? "준비 완료" : "목표 정하는 중"}
                    </Chip>
                  </div>
                  {theirs.length > 0 && (
                    <p className="mt-1 ml-[42px] truncate text-[11px] text-muted">
                      {theirs
                        .map(
                          (g) =>
                            `${goalLabel(g.goal_type, g.qualifier)} ${Number(g.target_value).toLocaleString()}${g.unit ?? ""}`,
                        )
                        .join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── 대표 버튼 (진행 중은 아래 카드 안의 `오늘 운동하기`가 그 자리다) ── */}
      {primaryButton}
      {invited && (
        <button
          type="button"
          onClick={onDeclineInvite}
          disabled={busy}
          className="h-10 text-[13px] font-bold text-muted disabled:opacity-40"
        >
          거절하기
        </button>
      )}

      {share && canShare && (
        <div className="rounded-card-sm bg-surface-2 px-3 py-2">
          <p className="text-[12px] font-bold text-accent">
            {share.url ? inviteShareMessage(share.outcome) : "링크를 만들지 못했어요 — 잠시 뒤 다시 눌러 주세요"}
          </p>
          {share.url && share.outcome === "manual" && (
            <p className="mt-1 break-all text-[11px] text-muted">{share.url}</p>
          )}
          {share.url && isLocalOnlyUrl(share.url) && (
            <p className="mt-1 text-[11px] font-bold text-warn">
              ⚠️ 개발 서버 주소예요. 다른 기기(폰)에서는 안 열려요.
            </p>
          )}
        </div>
      )}

      {/* ── 준비 중: 보조 행동 ─────────────────────────────
          ⚠️ **일찍 시작은 지름길이다** (2026-08-14). 시작일이 오면 autostart가 연다.
          수동 시작은 목표 확인(`challenge_goal_approvals`, 0025 상호 동의)이 전원
          모여야 통과한다 — 이 동의는 **남의 목표에 하는 것**이라 목표 저장으로
          자동 처리하지 않는다(2026-09-18 결정 D3). 그래서 기본 흐름에서는 숨기고
          일찍 시작하고 싶을 때만 여기서 쓴다. */}
      {challenge.status === "setup" && !invited && (
        <details className="rounded-card border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-bold text-muted">
            시작일 전에 일찍 시작하기
          </summary>
          <p className="mt-2 text-[11.5px] text-muted">
            모두 목표를 정하고 서로의 목표를 확인하면 날짜 전에 시작할 수 있어요.
          </p>
          {allSet && (
            <button
              type="button"
              onClick={() => onApprove(iApproved)}
              disabled={busy}
              className={`mt-2 h-10 w-full rounded-card-sm border text-[13px] font-bold disabled:opacity-50 ${
                iApproved
                  ? "border-line bg-surface-2 text-muted"
                  : "border-accent/50 bg-accent/10 text-accent"
              }`}
            >
              {iApproved
                ? `✓ 목표 확인함 (${approvedCount}/${members.length}) · 누르면 취소`
                : `모두의 목표를 확인했어요 (${approvedCount}/${members.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={onStart}
            disabled={busy || !startHint.canStartNow}
            className="mt-2 h-10 w-full rounded-card-sm border border-accent/40 bg-accent-weak text-[13px] font-extrabold text-accent disabled:opacity-50"
          >
            {startHint.buttonLabel}
          </button>
        </details>
      )}

      {/* 취소 (사용자 지시 2026-10-07, 버그 신고 5da574d7) — 방장은 ⚙ 관리 시트 맨
          아래에서만 취소할 수 있어서 찾지 못했다. 참가자의 `나가기`와 같은 자리에 둔다. */}
      {challenge.status === "setup" && isHost && (
        <button
          type="button"
          onClick={onCancelChallenge}
          disabled={busy}
          className="h-10 text-[12.5px] font-bold text-warn underline underline-offset-2 disabled:opacity-50"
        >
          챌린지 취소하기
        </button>
      )}

      {/* 나가기 (0085) — 방장이 **아닌** 참가자에게만. 방장은 위의 취소를 쓴다. */}
      {challenge.status === "setup" && !invited && !isHost && (
        <button
          type="button"
          onClick={onLeave}
          disabled={busy}
          className="h-10 text-[12.5px] font-bold text-faint underline underline-offset-2 disabled:opacity-50"
        >
          이 챌린지에서 나가기
        </button>
      )}

      {/* ── 진행 중: 내 진행률만 공개 (§6 비공개) ─────────── */}
      {challenge.status === "active" && detailsAreCurrent && (
        <>
          {activeTab === "ranking" && (
            <CompetitionTab
              rows={sessionRows ?? []}
              members={members}
              myUserId={userId}
              startDate={challenge.start_date}
              endKey={competitionEndKey}
              todayKey={todayKey}
              timeZone={timeZone}
              todayDone={todayDone}
              streak={myStreak}
              liveRanking={challenge.live_ranking}
              periodOver={endedByDate}
              onOpenRanking={setRankingView}
            />
          )}

          {activeTab === "overview" && (
          <>
          {/* ── 내 진행 (2026-10-05) ─────────────────────────────
              시안의 `실시간 랭킹` 자리다. ⚠️⚠️ **진행 중에는 순위를 그리지 않는다**
              (사용자 확정 2026-10-05 "진행 중 챌린지는 내 목표·활동을 표시하고, TOP 3는
              종료 후"). 그래서 여기는 **내** 달성률·종합점수·레벨만이다 — 옛 금색→청록
              그라데이션 카드의 숫자를 그대로 옮겼다(`scoreParticipant` 한 곳). */}
          <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-extrabold">내 진행</h2>
              <Chip>{levelLabel(levelOf(userId))}</Chip>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="leading-none">
                <span className="block text-[11.5px] font-bold text-muted">평균 달성</span>
                <strong className="mt-1 block text-[40px] font-black text-accent tabular-nums">
                  {Math.round(myScore.achievement)}%
                </strong>
              </p>
              {/* 종합 점수는 **내 것도** 종료일 공개 (사용자 결정 2026-10-08) — 랭킹 탭 잠금 카드와 같은 말 */}
              <p className="text-right leading-none">
                <span className="block text-[11.5px] font-bold text-muted">종합점수</span>
                <span className="mt-1.5 flex items-center justify-end gap-1 text-[12.5px] font-extrabold text-muted">
                  <Icon name="lock" size={14} />
                  종료일 공개
                </span>
              </p>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, Math.round(myScore.achievement))}%` }}
              />
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              목표 {me?.goals.length ?? 0}개 · 참여율 {Math.round(myScore.participation)}% · 결과 발표{" "}
              <b className="text-text">{endedByDate ? "종료!" : `D-${Math.max(0, dday)}`}</b>
            </p>
          </section>

          {/* ── 4칸 정보줄 (시안 `12,384명 · 12일 · 오늘의 미션 · 1위까지`) ─────
              ⚠️ 마지막 칸은 `1위까지 N회`가 아니라 **내 진행**이다 — 진행 중 다른 참가자
                 성과를 근거로 한 숫자를 내지 않는다(적용 지침 §순위 카드).
              ⚠️ 오늘의 미션은 새 규칙이 아니다 — 오늘 운동을 했는지(챌린지 기간 운동일
                 `stats.workoutDayKeys`, 서버 집계와 같은 원천)만 말한다. */}
          <div className="grid grid-cols-4 divide-x divide-line rounded-card border border-line bg-surface py-3">
            <InfoCell icon="users" value={`${members.length}명`} label="참여 중" />
            <InfoCell
              icon="calendar"
              value={endedByDate ? "종료" : `${Math.max(0, dday)}일`}
              label="남은 기간"
            />
            <InfoCell
              icon="target"
              value={todayDone ? "완료" : "운동 1회"}
              label={todayDone ? "오늘 인증" : "오늘의 미션"}
              accent={todayDone}
            />
            {/* 랭킹 공개 방이면 `내 순위` (사용자 결정 2026-10-05), 아니면 `내 진행` */}
            {myRank !== null ? (
              <InfoCell icon="ranking" value={`${myRank}위`} label="내 순위" accent />
            ) : (
              <InfoCell
                icon="record"
                value={`${Math.round(myScore.achievement)}%`}
                label="내 진행"
                accent
              />
            )}
          </div>

          {me && me.goals.length > 0 && (
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h3 className="flex items-center gap-1.5 text-[15px] font-extrabold">
                <Icon name="target" size={17} className="text-accent" />
                내 목표 진행률
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {me.goals.map((g, i) => {
                  const rate = goalRate(g.target, g.actual);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[12.5px]">
                        <span className="font-bold">
                          {goalLabel(g.type, myQualifier(g.type))} {g.target.toLocaleString()}
                          {GOAL_TYPE_META[g.type].unit}
                        </span>
                        <span className="font-mono font-bold">
                          {Math.round(g.actual * 10) / 10} · {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full ${rate >= 1 ? "bg-good" : "bg-accent"}`}
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
              {/* 목표 올리기 (0090). ⚠️ 낮추는 길은 없다 — 서버 트리거가 막는다. */}
              {myGoals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRaisingGoals(true)}
                  className="mt-2.5 h-10 w-full rounded-card-sm border border-accent/50 text-[12.5px] font-bold text-accent"
                >
                  목표 올리기
                </button>
              )}
            </section>
          )}

          {raisingGoals && (
            <RaiseGoalSheet
              goals={myGoals.map((g) => ({
                id: g.id,
                label: goalLabel(g.goal_type, g.qualifier),
                unit: g.unit ?? "",
                target: Number(g.target_value),
              }))}
              onClose={() => setRaisingGoals(false)}
              onRaised={onGoalRaised}
            />
          )}

          {/* ⚠️ **한 줄은 접지 않는다** (2026-08-13) — "왜 남의 점수가 안 보이나"의 답.
              ⚠️ **잠기는 것은 목표 점수뿐이다** (사용자 결정 2026-09-18). */}
          {/* 랭킹 공개 방(0115)이면 "기간 중엔 내 진행률만"은 거짓말이 된다 — 대신 공개 방이라고 말한다 */}
          {challenge.live_ranking ? (
            <p className="flex items-center gap-1.5 rounded-card border border-line bg-surface p-3 text-[12px] font-bold text-muted">
              <Icon name="eye" size={15} className="flex-none text-accent" />
              실시간 랭킹 공개 챌린지예요 — 종합점수 순위가 기간 중에도 보여요
            </p>
          ) : (
          <div className="rounded-card border border-line bg-surface p-3 text-[12px] font-bold text-muted">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-start gap-1.5">
                <Icon name="lock" size={15} className="mt-px flex-none" />
                <span>
                  기간 중에는 <b className="text-text">종목별 기록만</b> 서로 볼 수 있어요
                </span>
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
                  다른 참가자의 <b>목표 점수</b>와 종합 순위는 <b>종료일에 한꺼번에</b> 공개돼요.
                  사람마다 목표가 달라서, 중간 점수는 앞선 사람은 느슨하게 뒤처진 사람은 포기하게 만들기 쉬워서예요.
                </p>
                <p>
                  대신 <b>누가 몇 번 운동했는지</b>와 운동 시간·유산소 거리·웨이트 볼륨은{" "}
                  <b>랭킹</b> 탭에서 기간 중에도 보여요. 실제 기록을 더한 값이라 목표 점수와는 다른 숫자예요.
                </p>
              </div>
            )}
          </div>
          )}

          {/* 꾸준왕 열람권 카드(ParticipantPerformanceCard)는 2026-10-07에 뺐다 — 종목별 랭킹이
              모두에게 보이므로 "5일 연속이면 남의 순위를 엿본다"가 의미를 잃었다(사용자 결정). */}

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">참여자 ({members.length}명)</h3>
              {!challenge.live_ranking && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Icon name="lock" size={13} /> 종료일 공개
                </span>
              )}
            </div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => onProfile(m)}
                  aria-label={`${m.nickname} 프로필 보기`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Avatar
                    src={m.avatar_url}
                    className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-base"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                    {m.nickname}
                    {m.id === userId && <span className="ml-1 text-faint">(나)</span>}
                  </span>
                </button>
                <span className="font-mono text-sm font-extrabold text-faint">
                  {m.id === userId ? (
                    `${Math.round(myScore.achievement)}%`
                  ) : liveRanked ? (
                    /* 랭킹 공개 방(0115)은 남의 달성률도 보인다 — 랭킹과 같은 원천 */
                    `${Math.round(liveRanked.find((r) => r.userId === m.id)?.achievement ?? 0)}%`
                  ) : (
                    <Icon name="lock" size={15} label="비공개" />
                  )}
                </span>
              </div>
            ))}
          </section>

          </>
          )}

          {/* 챌린지 활동 (0095) — active일 때만. 끝나면 서버가 막아 자동으로 닫힌다. */}
          {activeTab === "feed" && <ChallengeActivity challengeId={challenge.id} />}

          {/* ── 마일스톤 (2026-10-05 사용자 결정 "1번") ─────────────────
              시안의 `챌린지 보상` 자리. ⚠️ **지급이 없는 진행 표시다** — XP·배지를 주지
              않는다. 그래서 제목도 `보상`이 아니라 `마일스톤`이다. 계산은
              `challengeMilestones`(챌린지 기간 운동일, 서버 집계와 같은 원천). */}
          {activeTab === "mission" && (
          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">챌린지 마일스톤</h3>
              <span className="text-[11px] text-muted">이 챌린지 기간 기록</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {challengeMilestones({
                workoutDayKeys: stats?.get(userId)?.workoutDayKeys ?? [],
                startDate: challenge.start_date,
                endDate: challenge.end_date,
                todayKey,
                totalDays: dayProgress.total,
                dayIndex: dayProgress.day,
              }).map((m) => (
                <MilestoneCard key={m.key} m={m} />
              ))}
            </div>
          </section>
          )}
        </>
      )}

    </div>
  );
}
