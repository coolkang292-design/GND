"use client";

import { useEffect, useState } from "react";
import {
  BottomSheet,
  PrimaryButton,
  SheetHeader,
} from "@/components/challenge/bottom-sheet";
import { UiIcon } from "@/components/ui-icon";
import { recordFunnelEvent } from "@/lib/analytics-events";
import {
  createChallengeRoom,
  setChallengeDiscoverable,
} from "@/lib/challenge";
import { errorMessage } from "@/lib/challenge-errors";
import {
  isLocalOnlyUrl,
  shareChallengeInvite,
  type ShareResult,
} from "@/lib/challenge-share";
import {
  DEFAULT_START_OFFSET,
  DEFAULT_WEEKS,
  START_OFFSET_CHOICES,
  WEEK_CHOICES,
  challengePeriodFor,
  earliestStartDate,
  inviteShareMessage,
  startOffsetLabel,
} from "@/lib/domain/challenge-invite";
import { formatMonthDay, inclusiveDays } from "@/lib/domain/challenge-time";
import type { Challenge } from "@/lib/types";

/** 이름 칸 상한. DB는 40자(`challenges_name_check`)지만 카드 한 줄에 맞게 시안대로 20자 */
export const NAME_MAX = 20;

export type Audience = "public" | "friends" | "solo";

const AUDIENCES: readonly {
  key: Audience;
  icon: string;
  title: string;
  sub: string;
}[] = [
  { key: "public", icon: "friends", title: "누구나 참여", sub: "GND에서 참가자를 모집해요" },
  { key: "friends", icon: "friends-add", title: "아는 사람끼리", sub: "링크를 공유해서 친구를 초대해요" },
  { key: "solo", icon: "person", title: "나 혼자 먼저", sub: "나중에 사람을 초대할 수 있어요" },
];

type RecruitState = "open" | "blocked" | "failed" | "none";

const TITLE_ID = "create-challenge-title";

/**
 * 새 챌린지 만들기 (2026-09-18 개편).
 *
 * 묻는 것은 **이름 · 기간 · 누구와** 셋뿐이다. 목표는 여기서 묻지 않는다 —
 * 챌린지 생성과 개인 목표는 따로다. 완료 화면에서 "내 목표 정하기"로 이어진다.
 *
 * "누구와"는 새 상태를 만들지 않고 **기존 기능에 옮겨 담는다**:
 *   · 누구나 참여   → `discoverable = true` (피드·둘러보기에 모집 카드, 0085)
 *   · 아는 사람끼리 → 비공개 + 완료 화면의 대표 버튼이 **초대 링크 공유**
 *   · 나 혼자 먼저  → 비공개, 바로 끝
 *
 * ⚠️⚠️ **오늘 시작은 만들 수 없다.** 시작일 = 오늘 + 모집 기간(최소 1일,
 *    `challengePeriodFor`). 오늘 시작하는 방은 탭을 한 번 더 여는 것만으로
 *    `autostart_due_challenges`가 시작시켜 초대가 닫힌다(2026-08-17 실측).
 *
 * ⚠️ 방은 반드시 `create_challenge_room`으로 만든다 — 직접 INSERT하면 host 참가
 *    행이 안 생겨 내가 만든 방이 내 목록에 안 뜬다(0044).
 *
 * ⚠️ 공개 모집 켜기가 실패해도 **방을 되돌리지 않는다.** 방장당 공개 모집은
 *    1건이라(`challenges_one_open_recruit_per_host`, 0089) 이미 열어 둔 모집이 있으면
 *    막힌다. 방은 비공개로 남기고 이유를 말한다 — 관리(⋯)에서 다시 켤 수 있다.
 */
export function CreateChallengeFlow({
  userId,
  todayKey,
  onClose,
  onCreated,
  onSetGoal,
}: {
  userId: string;
  todayKey: string;
  /** 만들기 전에 닫았다 (또는 완료 화면에서 ✕) — 만든 방이 있으면 그 id */
  onClose: (createdId: string | null) => void;
  /** 방이 만들어졌다 — 목록을 다시 읽을 때 쓴다 */
  onCreated: (challenge: Challenge) => void;
  /** 완료 화면의 "내 목표 정하기" */
  onSetGoal: (challengeId: string) => void;
}) {
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState<number>(DEFAULT_WEEKS);
  const [startOffset, setStartOffset] = useState<number>(DEFAULT_START_OFFSET);
  const [showStart, setShowStart] = useState(false);
  const [customDates, setCustomDates] = useState<{ start: string; end: string } | null>(null);
  const [audience, setAudience] = useState<Audience>("public");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    challenge: Challenge;
    audience: Audience;
    recruit: RecruitState;
  } | null>(null);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  // 퍼널 (0109) — 만들기 화면을 열었다. 만들었는지는 challenges가 안다.
  useEffect(() => {
    void recordFunnelEvent("challenge_create_started", userId);
  }, [userId]);

  const minStart = earliestStartDate(todayKey);
  const period = customDates
    ? { startDate: customDates.start, endDate: customDates.end }
    : challengePeriodFor(todayKey, startOffset, weeks);
  const periodDays = inclusiveDays(period.startDate, period.endDate);

  async function create() {
    if (busy) return;
    setNotice(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setNotice("챌린지 이름을 입력하세요");
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setNotice(`이름은 ${NAME_MAX}자까지예요`);
      return;
    }
    if (!period.startDate || !period.endDate || period.startDate > period.endDate) {
      setNotice("기간을 확인하세요 (시작일 ≤ 종료일)");
      return;
    }
    // ⚠️ `min` 속성만으로는 못 막는다 — 날짜 칸은 손으로 칠 수 있다. 이유를 같이 쓴다.
    if (period.startDate < minStart) {
      setNotice(
        `시작일은 ${formatMonthDay(minStart)}부터예요 — 시작하면 초대가 닫혀서, 사람을 모을 하루가 필요해요`,
      );
      return;
    }

    setBusy(true);
    try {
      const ch = await createChallengeRoom({
        name: trimmed,
        startDate: period.startDate,
        endDate: period.endDate,
      });
      let recruit: RecruitState = "none";
      if (audience === "public") {
        try {
          await setChallengeDiscoverable(ch.id, true);
          recruit = "open";
        } catch (e) {
          recruit =
            e instanceof Error && e.message === "recruit_already_open"
              ? "blocked"
              : "failed";
        }
      }
      setCreated({
        challenge: { ...ch, discoverable: recruit === "open" },
        audience,
        recruit,
      });
      onCreated(ch);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function doShare() {
    if (!created || shareBusy) return;
    setShareBusy(true);
    try {
      const r = await shareChallengeInvite({
        challengeId: created.challenge.id,
        challengeName: created.challenge.name,
        inviteCode: created.challenge.invite_code ?? null,
        userId,
      });
      setShare(r);
    } finally {
      setShareBusy(false);
    }
  }

  /* ── 완료 화면 ─────────────────────────────────────────────── */
  if (created) {
    const ch = created.challenge;
    const friendsFirst = created.audience === "friends";
    const days = inclusiveDays(todayKey, ch.start_date) - 1;
    const shareButtonLabel = shareBusy ? "링크 준비 중…" : "친구 초대하기";

    return (
      <BottomSheet
        titleId={TITLE_ID}
        onClose={() => onClose(ch.id)}
        header={
          <SheetHeader titleId={TITLE_ID} title="챌린지 만들기" onClose={() => onClose(ch.id)} />
        }
        footer={
          <>
            <PrimaryButton
              onClick={friendsFirst ? () => void doShare() : () => onSetGoal(ch.id)}
              disabled={friendsFirst && shareBusy}
            >
              {friendsFirst ? shareButtonLabel : "내 목표 정하기"}
            </PrimaryButton>
            <button
              type="button"
              onClick={friendsFirst ? () => onSetGoal(ch.id) : () => void doShare()}
              disabled={!friendsFirst && shareBusy}
              className="mt-2 h-10 w-full text-[13.5px] font-bold text-accent disabled:opacity-50"
            >
              {friendsFirst ? "내 목표 정하기 ›" : `${shareButtonLabel} ›`}
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-accent text-2xl font-extrabold text-accent">
            ✓
          </span>
          <p className="mt-3 text-[20px] font-extrabold">챌린지가 만들어졌어요</p>
          <p className="mt-2 text-[16px] font-extrabold">{ch.name}</p>
          <p className="mt-0.5 font-mono text-[13px] text-muted">
            {formatMonthDay(ch.start_date)} ~ {formatMonthDay(ch.end_date)}
          </p>
          <p className="mt-2 rounded-full bg-surface-2 px-3 py-1 text-[12px] font-bold text-muted">
            {days > 0 ? `모집 기간 ${days}일 · ` : ""}
            {formatMonthDay(ch.start_date)}에 자동으로 시작해요
          </p>
        </div>

        {created.recruit === "open" && (
          <p className="mt-4 rounded-card-sm border border-good/40 bg-good-weak px-3 py-2 text-center text-[12.5px] font-bold text-good">
            ✓ 모집 시작됨 · 피드와 둘러보기에 올라갔어요
          </p>
        )}
        {created.recruit === "blocked" && (
          <p role="alert" className="mt-4 rounded-card-sm border border-warn/40 bg-surface-2 px-3 py-2 text-[12.5px] font-bold text-warn">
            이미 공개 모집 중인 챌린지가 있어서 이 챌린지는 비공개로 만들었어요.
            상세 화면의 관리(⋯)에서 바꿀 수 있어요.
          </p>
        )}
        {created.recruit === "failed" && (
          <p role="alert" className="mt-4 rounded-card-sm border border-warn/40 bg-surface-2 px-3 py-2 text-[12.5px] font-bold text-warn">
            공개 모집을 켜지 못했어요. 상세 화면의 관리(⋯)에서 다시 켤 수 있어요.
          </p>
        )}

        <p className="mt-4 text-center text-[12px] text-muted">
          시작일까지 목표를 정한 사람과 함께 시작해요. 목표를 정하면 시작일을 알림으로 알려드려요.
        </p>

        {share && (
          <div className="mt-3 rounded-card-sm bg-surface-2 px-3 py-2">
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
      </BottomSheet>
    );
  }

  /* ── 입력 화면 ─────────────────────────────────────────────── */
  return (
    <BottomSheet
      titleId={TITLE_ID}
      onClose={() => onClose(null)}
      header={
        <SheetHeader titleId={TITLE_ID} title="새 챌린지 만들기" onClose={() => onClose(null)} />
      }
      footer={
        <>
          {notice && (
            <p role="alert" className="mb-2 text-center text-[12.5px] font-bold text-warn">
              {notice}
            </p>
          )}
          <PrimaryButton onClick={() => void create()} disabled={busy}>
            {busy ? "만드는 중…" : "챌린지 만들기"}
          </PrimaryButton>
        </>
      }
    >
      <label htmlFor="challenge-name" className="text-[13px] font-bold text-muted">
        챌린지 이름
      </label>
      <input
        id="challenge-name"
        autoFocus
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="예: 30일 아침 운동"
        className="mt-1.5 h-12 w-full rounded-card-sm border border-line bg-surface-2 px-3.5 text-[15px] font-bold outline-none focus:border-accent"
      />
      <p className="mt-1 text-right font-mono text-[11px] text-faint">
        {name.length}/{NAME_MAX}
      </p>

      <p className="mt-2 text-[13px] font-bold text-muted">챌린지 기간</p>
      <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="챌린지 기간">
        {WEEK_CHOICES.map((w) => {
          const on = !customDates && weeks === w;
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setCustomDates(null);
                setWeeks(w);
              }}
              className={`h-12 flex-1 rounded-full border text-[15px] font-extrabold ${
                on ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface-2"
              }`}
            >
              {w}주
            </button>
          );
        })}
      </div>

      <div className="mt-2 rounded-card-sm bg-surface-2 px-3 py-2 text-[12.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">
            {formatMonthDay(period.startDate)} ~ {formatMonthDay(period.endDate)}
            <span className="ml-1 font-normal text-muted">({periodDays}일)</span>
          </span>
          <button
            type="button"
            onClick={() => setShowStart((v) => !v)}
            aria-expanded={showStart}
            className="flex-none text-[12px] font-bold text-accent"
          >
            시작일 바꾸기
          </button>
        </div>
        <p className="mt-0.5 text-[11.5px] text-muted">
          시작 전까지 사람을 모으고 각자 목표를 정해요
        </p>
        {showStart && (
          <div className="mt-2 border-t border-line pt-2">
            <div className="flex gap-1.5" role="radiogroup" aria-label="시작 시점">
              {START_OFFSET_CHOICES.map((d) => {
                const on = !customDates && startOffset === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setCustomDates(null);
                      setStartOffset(d);
                    }}
                    className={`h-9 flex-1 rounded-full border text-[12.5px] font-bold ${
                      on ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface"
                    }`}
                  >
                    {startOffsetLabel(d)} 시작
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setCustomDates((c) =>
                  c ? null : { start: period.startDate, end: period.endDate },
                )
              }
              className="mt-2 text-[12px] font-bold text-muted underline underline-offset-2"
            >
              {customDates ? "직접 설정 닫기" : "직접 날짜 설정"}
            </button>
            {customDates && (
              <div className="mt-2 flex gap-2">
                <label className="flex-1 text-[11px] font-bold text-muted">
                  시작일
                  {/* ⚠️ `min`은 시작일에만 건다. 종료일에 걸면 "시작일보다 뒤"라는
                      진짜 규칙과 겹쳐 엉뚱한 날짜를 못 고르게 된다. */}
                  <input
                    type="date"
                    aria-label="시작일"
                    min={minStart}
                    value={customDates.start}
                    onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                    className="mt-1 h-10 w-full rounded-card-sm border border-line bg-surface px-2 text-[13px]"
                  />
                </label>
                <label className="flex-1 text-[11px] font-bold text-muted">
                  종료일
                  <input
                    type="date"
                    aria-label="종료일"
                    value={customDates.end}
                    onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                    className="mt-1 h-10 w-full rounded-card-sm border border-line bg-surface px-2 text-[13px]"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-[13px] font-bold text-muted">누구와 같이 할까요?</p>
      <div className="mt-1.5 flex flex-col gap-2" role="radiogroup" aria-label="누구와 같이 할까요">
        {AUDIENCES.map((a) => {
          const on = audience === a.key;
          return (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setAudience(a.key)}
              className={`flex items-center gap-3 rounded-card border px-3.5 py-3 text-left ${
                on ? "border-accent bg-accent/10" : "border-line bg-surface-2"
              }`}
            >
              <UiIcon name={a.icon} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{a.title}</span>
                <span className="block text-[12px] text-muted">{a.sub}</span>
              </span>
              <span
                className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[13px] font-extrabold ${
                  on ? "border-accent bg-accent text-accent-ink" : "border-line"
                }`}
                aria-hidden
              >
                {on ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 rounded-card-sm bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent">
        <UiIcon name="camera" size={15} />이 챌린지는 사진 인증한 운동만 집계돼요
      </p>
    </BottomSheet>
  );
}
