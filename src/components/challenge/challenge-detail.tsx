"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ChallengeActivity } from "@/components/challenge/challenge-activity";
import { ResultView } from "@/components/challenge/challenge-result";
import { ParticipantPerformanceCard } from "@/components/challenge/participant-performance-card";
import { RaiseGoalSheet } from "@/components/challenge/raise-goal-sheet";
import { UiIcon } from "@/components/ui-icon";
import {
  EMPTY_STATS,
  GOAL_TYPE_META,
  buildParticipantInput,
  goalLabel,
  type ChallengeParticipantProfile,
  type MyChallenge,
  type PeriodStats,
} from "@/lib/challenge";
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
  scoreParticipant,
  type GoalType,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { challengeLevel, levelLabel } from "@/lib/domain/level";
import { primaryActionOf } from "@/lib/domain/my-challenges";
import type { UserGoal } from "@/lib/types";

type Profile = ChallengeParticipantProfile;

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
  onFinalize,
  onShare,
  onOpenManage,
  onProfile,
  onCreate,
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
  onFinalize: () => void;
  onShare: () => void;
  onOpenManage: () => void;
  onProfile: (p: Profile) => void;
  onCreate: () => void;
  onGoalRaised: () => void;
}) {
  /** 공정성 안내 상세 접힘 — 기본은 접힌다 (2026-08-13, CrewCard와 같은 규약) */
  const [showFairness, setShowFairness] = useState(false);
  /** 목표 올리기 시트 (0090) */
  const [raisingGoals, setRaisingGoals] = useState(false);

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
        className="h-13 min-h-[52px] w-full rounded-card bg-accent text-[16px] font-extrabold text-accent-ink disabled:opacity-60"
      >
        {action.kind === "finalize" ? (
          <>
            <UiIcon name="trophy" /> {action.label}
          </>
        ) : (
          action.label
        )}
      </button>
    );

  return (
    <div className="flex flex-col gap-3 pb-10">
      {/* ── 머리 ─────────────────────────────────────────── */}
      <header className="flex h-11 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="챌린지 목록으로"
          className="grid h-10 w-10 flex-none place-items-center rounded-full text-xl font-bold text-muted"
        >
          ←
        </button>
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-muted">챌린지</p>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            aria-label="초대 링크 공유"
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-lg"
          >
            ↗
          </button>
        )}
        {isHost && (
          <button
            type="button"
            onClick={onOpenManage}
            aria-label="챌린지 관리"
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-xl font-extrabold text-muted"
          >
            ⋯
          </button>
        )}
      </header>

      {/* 시안 ④는 상세가 언제나 사진으로 연다. 사진을 안 넣은 방은 대체 그림으로.
          ⚠️ 사용자 사진이 언제나 이긴다(`detailArtFor`). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={detailArtFor(challenge.recruit_image_url)}
        alt=""
        className="aspect-[16/9] w-full rounded-card object-cover"
      />

      <div>
        <h1 className="text-[21px] leading-snug font-extrabold tracking-tight">
          {challenge.name}
        </h1>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {formatMonthDay(challenge.start_date)} ~ {formatMonthDay(challenge.end_date)} ·{" "}
          {days}일간
        </p>
        {challenge.recruit_note && challenge.status === "setup" && (
          <p className="mt-2 text-[13px] leading-relaxed break-words whitespace-pre-line text-muted">
            {challenge.recruit_note}
          </p>
        )}
        {challenge.photo_required && (
          <span className="mt-1.5 inline-block rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">
            <UiIcon name="camera" /> 사진 인증 필수 · 사진 없는 운동은 집계되지 않아요
          </span>
        )}
      </div>

      {/* ── 초대받음 ─────────────────────────────────────── */}
      {invited && (
        <section className="rounded-card border border-accent/40 bg-accent/10 p-4 shadow-card">
          <p className="text-sm font-extrabold">
            <UiIcon name="trophy" /> 챌린지에 초대받았어요
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
                <p className="text-[12.5px] font-extrabold">
                  <UiIcon name="goal" /> 내 목표
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
                    <span
                      className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        ready ? "bg-good-weak text-good" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {ready ? "준비 완료" : "목표 정하는 중"}
                    </span>
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

      {/* 나가기 (0085) — 방장이 **아닌** 참가자에게만. 방장은 ⋯에서 취소한다. */}
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
          {/* ⚠️ **높이를 다시 늘리지 마라** (2026-08-13 사용자 지시). */}
          <section className="rounded-card bg-gradient-to-br from-accent to-[#0B6E66] px-3.5 py-3 text-accent-ink shadow-card">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13.5px] font-extrabold">{challenge.name}</p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-extrabold">
                {levelLabel(levelOf(userId))}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] opacity-90">
                평균 달성{" "}
                <b className="font-mono text-[22px] font-extrabold">
                  {Math.round(myScore.achievement)}%
                </b>
              </p>
              <p className="flex-none text-[11px] opacity-90">
                종합점수{" "}
                <b className="font-mono text-[22px] font-extrabold">
                  {myScore.overall.toFixed(1)}
                </b>
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.min(100, Math.round(myScore.achievement))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] opacity-95">
              목표 {me?.goals.length ?? 0}개 · 참여율 {Math.round(myScore.participation)}% ·
              결과 발표{" "}
              <b className="font-mono">{endedByDate ? "종료!" : `D-${Math.max(0, dday)}`}</b>
            </p>

            {/* ⚠️ 이 탭의 대표 버튼이다 — "그래서 오늘 뭘 하면 되나"의 답.
                ⚠️ `상세 보기` 버튼은 넣지 않는다(바로 아래가 이미 상세다).
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
                          {goalLabel(g.type, myQualifier(g.type))} {g.target.toLocaleString()}
                          {GOAL_TYPE_META[g.type].unit}
                        </span>
                        <span className="font-mono font-bold">
                          {Math.round(g.actual * 10) / 10} · {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
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
                  className="mt-2.5 h-10 w-full rounded-card-sm border border-line bg-surface-2 text-[12.5px] font-bold text-accent"
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
          <div className="rounded-card border border-line bg-surface-2 p-3 text-[12px] font-bold text-muted">
            <div className="flex items-center justify-between gap-2">
              <span>
                <UiIcon name="lock" /> 공정성을 위해 <b>기간 중에는 내 진행률만</b> 볼 수 있어요
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
                  다른 참가자의 <b>목표 점수</b>와 순위는 <b>종료일에 한꺼번에</b> 공개돼요.
                  중간 순위를 보면 앞선 사람은 느슨해지고 뒤처진 사람은 포기하기 쉬워서예요.
                </p>
                <p>
                  <b>5일 연속</b> 운동하면 아래 참가자 성과가 <b>2시간 동안</b> 열려요.
                </p>
                <p>
                  다만 <b>누가 몇 번 운동했는지</b>는 아래 <b>챌린지 활동</b>에서 기간 중에도
                  보여요. 목록에 한 줄씩 올라오는 것을 센 숫자라 목표 점수와는 다른 값이에요.
                </p>
              </div>
            )}
          </div>

          {/* key: 챌린지를 바꾸면 리마운트시켜 이전 챌린지의 순위·열람 대상이 남지 않게 */}
          <ParticipantPerformanceCard
            key={challenge.id}
            challengeId={challenge.id}
            endDate={challenge.end_date}
            completedAts={completedAts}
          />

          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">참여자 ({members.length}명)</h3>
              <span className="text-xs text-muted">
                <UiIcon name="lock" size={13} /> 종료일 공개
              </span>
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
                  ) : (
                    <UiIcon name="lock" size={15} alt="비공개" />
                  )}
                </span>
              </div>
            ))}
          </section>

          {/* 챌린지 활동 (0095) — active일 때만. 끝나면 서버가 막아 자동으로 닫힌다. */}
          <ChallengeActivity challengeId={challenge.id} />
        </>
      )}

      {/* ── 종료: 시상대 + 상세 순위 (§6) ─────────────────── */}
      {challenge.status === "ended" && detailsAreCurrent && (
        <>
          <ResultView
            participants={participantInputs}
            goals={[...goals]}
            profileOf={profileOf}
            myUserId={userId}
            levelOf={levelOf}
            onProfileClick={onProfile}
          />
          <button
            type="button"
            onClick={onCreate}
            className="h-12 rounded-card border border-accent/40 bg-accent-weak text-sm font-extrabold text-accent"
          >
            ＋ 새 챌린지 만들기
          </button>
        </>
      )}
    </div>
  );
}
