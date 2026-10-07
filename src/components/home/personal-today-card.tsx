"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Chip, type ChipDot } from "@/components/ui/chip";
import { Icon, type IconName } from "@/components/ui/icon";
import { isPhotoAvatar } from "@/lib/domain/avatar-source";
import type { FriendStatus } from "@/lib/domain/friend-board";
import { personalTodayAction } from "@/lib/domain/home-competition";
import {
  currentStreak,
  streakStage,
  workoutDayKeys,
} from "@/lib/domain/streak";
import {
  dailyMessage,
  pickByDay,
  STAGE_MESSAGES,
} from "@/lib/domain/streak-messages";
import { DEFAULT_TIMEZONE, DAY_MS, dayKey, weekStart } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";
import { MAX_DAILY_WORKOUT_XP_NOW } from "@/lib/domain/xp";
import type { ProgressSummary } from "@/lib/progression";
import type { TodayWorkoutTotals } from "@/lib/workout";

/**
 * 홈 최상단 — 인사말 · 이번 주 날짜별 운동 · 오늘 숫자 세 칸.
 *
 * 사용자가 공유한 홈 시안(`안녕하세요, 형` · `이번 주 운동` · `42 MIN / 18 SETS /
 * 6,840 KG`)을 그대로 따른다. 옛 `나의 오늘` 카드(2026-08-21 설계,
 * `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md`)가
 * 가지던 기능은 **하나도 지우지 않고 자리만 옮겼다**:
 *
 * | 옛 자리 | 새 자리 |
 * |---|---|
 * | 아바타·이름(성과 시트 열기) | 인사말 줄 — 같은 버튼, 같은 접근 이름 `… 성과 보기` |
 * | 단계·레벨·XP 진행바 | 인사말 아래 알약 + 얇은 진행바 |
 * | 오늘 상태 알약(오늘 완료/운동 중/운동 전) | 이번 주 운동 카드 오른쪽 위 |
 * | 이번 주 운동일 | 완료 일수 + 월~일 7칸 + 작은 챌린지 목표 문구 |
 * | 연속 · 배지 | 인사말 아래 스트릭 알약 · 배지 알약 |
 * | 스트릭 오늘의 한 줄 · 소멸 경고 | 이번 주 운동 카드 안 |
 * | 주 행동(시작/이어하기/완료 배너) | 이번 주 운동 카드 맨 아래 |
 *
 * ⚠️ **여기서 조회하지 않는다.** 재료는 전부 홈이 부른 것을 내려받는다 — 크루 카드와 같은 규약.
 * ⚠️ 홈의 **유일한** 운동 시작 버튼이 이 안에 있다. 다른 곳에 또 만들지 마라(2026-08-13).
 * ⚠️ 시안의 `👋`·`🔥` 이모지는 쓰지 않는다(기획안 17-A). 불꽃은 패키지의 입체 장식이다.
 */

const STATUS_STYLE: Record<FriendStatus, { label: string; dot: ChipDot }> = {
  done: { label: "오늘 완료", dot: "good" },
  active: { label: "운동 중", dot: "warn" },
  idle: { label: "운동 전", dot: "muted" },
};

/** 배지 알약의 금색 육각형 — 보상은 금색이다(적용 지침 §디자인 규칙) */
function BadgeHex() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[13px] w-[13px] flex-none">
      <path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7z" fill="var(--gold)" />
      <path d="M12 5.2 18.2 8.8v7.2L12 19.6 5.8 16V8.8z" fill="#090a0c" opacity="0.28" />
    </svg>
  );
}

/** 오늘 숫자 한 칸 — 시안의 `42 MIN / 오늘 운동 시간` */
function TodayTile({
  icon,
  value,
  unit,
  label,
}: {
  icon: IconName;
  /** `null` = 모른다 → `—`. 0으로 지어내지 않는다 */
  value: string | null;
  unit: string;
  label: string;
}) {
  return (
    <Link
      href="/record"
      className="flex min-w-0 flex-col rounded-card-sm border border-line bg-surface px-3 pt-2.5 pb-2"
    >
      <span className="flex items-center justify-between">
        <Icon name={icon} size={20} className="text-accent" />
        <Icon name="chevron" size={14} className="text-faint" />
      </span>
      <span className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
        <strong className="text-[22px] font-black leading-none tracking-tight">
          {value ?? "—"}
        </strong>
        <span className="text-[11px] font-extrabold text-text">{unit}</span>
      </span>
      <span className="mt-1 truncate text-[11px] text-muted">{label}</span>
    </Link>
  );
}

export type PersonalTodayCardProps = {
  profile: { nickname: string; avatarUrl: string | null };
  /**
   * 성장 요약. `null` = **조회 실패** — 그때도 오늘 상태·이번 주·연속·주 행동은 그대로
   * 그리고 레벨 자리에만 실패를 적는다. 조회 **중**에는 홈이 스켈레톤을 그린다.
   */
  summary: ProgressSummary | null;
  /**
   * 내 **전체** 완료 세션 시각.
   * ⚠️ `visibility='group'`으로 좁힌 값을 넣지 마라 — 서버 규칙(`poke_requires_workout`)과
   * 같은 "오늘"을 써야 한다.
   */
  completedAts: Date[];
  /**
   * 세션 조회가 실패했다 (2026-10-05). 홈은 다른 위젯 때문에 `completedAts`를 `[]`로
   * 떨어뜨리는데, 그대로 그리면 이번 주가 **0일**로 보인다 — 실패를 기록 없음으로
   * 위장하는 것이다. 이 표식이 서면 목표 자리에 재시도를 그린다.
   */
  weekLoadError?: boolean;
  onRetryWeek?: () => void;
  /**
   * 오늘 숫자 세 칸. `undefined` = 아직 조회 중, `null` = 조회 실패 — 둘 다 `—`.
   * ⚠️ 0으로 미리 채우지 않는다. 도착하는 순간 숫자가 튀어 기록이 생긴 것처럼 읽힌다.
   */
  todayTotals?: TodayWorkoutTotals | null;
  /** 진행 중 챌린지의 주 운동일. 없으면 `null` — 기본값(4 등)을 넣지 않는다 */
  weeklyGoal: number | null;
  status: FriendStatus;
  /** 내 보유 배지 종류 수. `null` = 아직 안 왔거나 실패 → `—`(0과 구별) */
  badgeCount: number | null;
  /**
   * 인사말(아바타·이름)을 눌렀을 때 — 크루 행과 **같은 성과 시트**를 연다.
   * ⚠️ `/profile`로 보내지 않는다(2026-08-21 사용자 지시). 설정은 하단 탭이 맡는다.
   */
  onOpenProfile: () => void;
  /** 홈이 한 번 만든 기준 시각. 카드가 `new Date()`를 부르면 화면마다 "오늘"이 갈린다 */
  now: Date;
};

export function PersonalTodayCard({
  profile,
  summary,
  completedAts,
  weekLoadError = false,
  onRetryWeek,
  todayTotals,
  weeklyGoal,
  status,
  badgeCount,
  onOpenProfile,
  now,
}: PersonalTodayCardProps) {
  const tz = DEFAULT_TIMEZONE;
  // 분자는 **고유 운동일**이다 — 같은 날 두 번 해도 1일(`weekWorkoutDays`가 중복을 지운다)
  const { days } = weekWorkoutDays(completedAts, now, tz);
  const keys = workoutDayKeys(completedAts, tz);
  const todayKey = dayKey(now, tz);
  const streak = currentStreak(keys, todayKey);
  /**
   * 소멸 경고 — 판정은 `STAGE_MESSAGES`(d4~d1에만 값)가 한다. **조건을 손으로 붙이지 마라.**
   * 이 앱의 스트릭은 5일 유예라 "오늘 안 하면 리셋"은 거짓말이다(`streak-messages.ts`).
   */
  const stage = streakStage(keys, todayKey);
  const warning =
    streak > 0 && STAGE_MESSAGES[stage]
      ? pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)
      : undefined;
  /** 반복이 성공을 만든다는 오늘의 한 줄 — 문구·출처는 `streak-messages.ts`가 갖는다 */
  const persistence = dailyMessage({ stage, streak, todayKey });
  const hasGoal = weeklyGoal !== null && weeklyGoal > 0;
  const action = personalTodayAction(status, MAX_DAILY_WORKOUT_XP_NOW);
  const pct = summary ? Math.min(100, Math.round(summary.levelProgressPercent)) : 0;
  // 월~일은 목표 수가 아니라 날짜별 완료 기록이다. 홈과 같은 KST 경계를 쓴다.
  const monday = weekStart(now, tz);
  const weekDays = ["월", "화", "수", "목", "금", "토", "일"].map((label, i) => {
    const date = new Date(monday.getTime() + i * DAY_MS);
    const key = dayKey(date, tz);
    return { label, key, dateNumber: Number(key.slice(-2)), done: days.includes(key) };
  });

  const minutes =
    todayTotals == null
      ? null
      : todayTotals.sessionCount === 0
        ? "0"
        : todayTotals.minutes === null
          ? null
          : todayTotals.minutes.toLocaleString();

  return (
    <div className="flex flex-col gap-3">
      {/* ── 인사말 ─────────────────────────────────────────────
          ⚠️ 아바타·이름·알약 영역**만** 버튼이다. 아래 CTA를 품으면 운동하러 가려다
          시트가 열린다. CTA는 형제로 둔다. */}
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label={`${profile.nickname} 성과 보기`}
        className="flex w-full items-center gap-3 text-left"
      >
        {/* 판정은 `isPhotoAvatar` 한 곳 — 이모지 아바타는 레벨 캐릭터를 그린다 */}
        {isPhotoAvatar(profile.avatarUrl) ? (
          <Avatar
            src={profile.avatarUrl}
            label={`${profile.nickname}님 프로필 사진`}
            className="h-[60px] w-[60px] flex-none overflow-hidden rounded-full border-2 border-line-strong bg-surface"
          />
        ) : summary ? (
          <Image
            src={summary.characterPath}
            alt={`${summary.stageName} 캐릭터`}
            width={60}
            height={80}
            sizes="60px"
            className="h-[60px] w-[60px] flex-none rounded-full border-2 border-line-strong bg-surface object-cover object-top"
          />
        ) : (
          <Avatar
            src={null}
            className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full border-2 border-line-strong bg-surface text-2xl"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-extrabold leading-tight">
            안녕하세요, {profile.nickname}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* 알약 둘(레벨·배지) — 톤은 `Chip` 하나로 맞춘다(2026-10-05 사용자 지시
                "톤앤매너에 맞게"). 연속일은 아래 스트릭 배너로 옮겼다 — 같은 숫자를 두 번
                적지 않는다. */}
            {/* ⚠️ 단계명이 앞, 레벨이 뒤 (2026-08-08 사용자 지시) */}
            {summary && (
              <Chip>
                {summary.stageName} Lv.{summary.currentLevel}
              </Chip>
            )}
            <Chip>
              <span className="font-medium text-muted">배지</span>
              {badgeCount === null ? "—" : badgeCount}
              {badgeCount !== null && <BadgeHex />}
            </Chip>
          </div>
          {summary ? (
            <div className="mt-1.5 flex items-center gap-2">
              {/* 진행은 라임이다(사용자 색상 표: Accent = CTA·활성·진행) */}
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-label="다음 레벨까지 진행"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <span className="flex-none text-[10.5px] text-muted">
                {summary.nextLevelRequiredXp === null
                  ? "최고 레벨 달성"
                  : `다음 레벨까지 ${summary.xpToNextLevel} XP`}
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">성장 정보를 불러오지 못했어요</p>
          )}
        </div>
      </button>

      {/* ── 스트릭 배너 (2026-10-05 사용자 지시 — 시안 `🔥 12 DAY STREAK`를 이번 주 운동 위에) ──
          숫자는 `currentStreak` 하나에서 온다(옛 `연속` 칸·스트릭 칸과 같은 값).
          ⚠️ 0일이면 0을 크게 자랑하지 않는다 — 시작을 권하는 문장으로 바꾼다.
          ⚠️ 불꽃은 패키지의 입체 장식이다(이모지 🔥 금지, 기획안 17-A). */}
      <div
        role="group"
        aria-label={streak > 0 ? `연속 ${streak}일 스트릭` : "스트릭 없음"}
        className="flex h-14 items-center gap-2.5 rounded-card border border-line bg-surface/90 px-4"
      >
        <Image
          src="/gnd/decorations/flame-64.webp"
          alt=""
          width={30}
          height={30}
          unoptimized
          className={`h-[30px] w-[30px] flex-none ${streak > 0 ? "" : "opacity-35 grayscale"}`}
        />
        {streak > 0 ? (
          <p aria-hidden className="flex items-baseline gap-1.5 leading-none">
            <strong className="text-[28px] font-black italic text-warn">{streak}</strong>
            <span className="text-[13px] font-extrabold tracking-wide">
              {streak === 1 ? "DAY STREAK" : "DAYS STREAK"}
            </span>
          </p>
        ) : (
          <p className="text-[13px] font-bold text-muted">
            오늘 운동으로 스트릭을 시작해요
          </p>
        )}
      </div>

      {/* ── 이번 주 운동 ─────────────────────────────────────────
          사진은 오른쪽(셰이커), 왼쪽은 어둡게 눌러 숫자를 읽힌다(적용 지침 §디자인 규칙). */}
      <section className="relative overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
        <Image
          src="/gnd/photos/goal-860.webp"
          alt=""
          fill
          sizes="(max-width: 430px) 100vw, 430px"
          className="object-cover object-right"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/85 to-surface/10" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />

        <div className="relative p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[16px] font-extrabold">이번 주 운동</h2>
            <Chip dot={STATUS_STYLE[status].dot}>{STATUS_STYLE[status].label}</Chip>
          </div>

          {weekLoadError ? (
            /* 실패를 0일로 위장하지 않는다 */
            <div className="mt-3 flex max-w-[70%] flex-col items-start gap-2">
              <p className="text-[13px] text-muted">이번 주 기록을 불러오지 못했어요</p>
              {onRetryWeek && (
                <button
                  type="button"
                  onClick={onRetryWeek}
                  className="min-h-[36px] rounded-full border border-line-strong bg-bg/60 px-3 text-[12px] font-bold"
                >
                  다시 시도
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mt-2 flex items-baseline gap-2 leading-none" aria-label={`이번 주 ${days.length}일 완료`}>
                <strong aria-hidden className="text-[56px] font-black italic text-accent">{days.length}</strong>
                <span aria-hidden className="text-[20px] font-extrabold">일 완료</span>
              </p>
              <ol aria-label="이번 주 날짜별 운동 기록" className="mt-4 grid grid-cols-7 gap-1.5">
                {weekDays.map(({ label, key, dateNumber, done }) => (
                  <li
                    key={key}
                    aria-label={`${key} ${label}요일 · ${done ? "운동 완료" : key > todayKey ? "예정" : "운동 기록 없음"}`}
                    aria-current={key === todayKey ? "date" : undefined}
                    className="flex min-w-0 flex-col items-center gap-1.5"
                  >
                    <span className={`text-[11px] font-bold ${key === todayKey ? "text-accent" : "text-muted"}`}>{label}</span>
                    <span aria-hidden className={`flex aspect-square w-full max-w-11 items-center justify-center rounded-[12px] border text-[13px] font-extrabold ${
                      done ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-bg/70 text-muted"
                    } ${key === todayKey ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}>
                      {done ? <Icon name="check" size={18} strokeWidth={2.6} /> : dateNumber}
                    </span>
                  </li>
                ))}
              </ol>
              {hasGoal ? (
                <p className="mt-3 text-[12px] text-muted">
                  주간 목표 {weeklyGoal}일 · {days.length >= weeklyGoal ? "달성" : `${weeklyGoal - days.length}일 남음`}
                </p>
              ) : (
                <Link href="/challenge" className="mt-3 inline-flex min-h-[32px] items-center rounded-full border border-accent/50 bg-bg/60 px-3 text-[12px] font-extrabold text-accent">
                  이번 주 · 목표 정하기 ›
                </Link>
              )}
            </>
          )}

          <p className="mt-3 max-w-[78%] text-[11.5px] leading-snug text-muted">{persistence}</p>

          {/* 소멸 경고 — 위험할 때만 붙는다(평소 높이 비용 0) */}
          {warning && (
            <p
              role="alert"
              className="mt-2 rounded-card-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-bold leading-snug text-warn"
            >
              {warning}
            </p>
          )}

          {/* ⚠️ 완료 상태는 **링크가 아니다** — 오늘 마친 사람에게 다음 운동을 재촉하지 않는다 */}
          {action.kind === "link" ? (
            <Link
              href="/record"
              className="mt-3 flex h-12 items-center justify-between rounded-[14px] bg-accent px-4 text-[16px] font-extrabold text-accent-ink active:bg-accent-press"
            >
              <span className="w-4" />
              <span className="flex items-center gap-2">
                <Icon name="play" size={16} filled />
                {action.label}
              </span>
              <Icon name="chevron" size={18} strokeWidth={2.4} />
            </Link>
          ) : (
            <div
              role="status"
              className="mt-3 flex h-12 items-center justify-center gap-1.5 rounded-[14px] border border-accent/50 bg-bg/70 text-[15px] font-extrabold text-accent"
            >
              <Icon name="success" size={18} />
              {action.label}
            </div>
          )}
        </div>
      </section>

      {/* ── 오늘 숫자 세 칸 ──────────────────────────────────────
          ⚠️ 모르는 값은 `—`다. 오늘 운동을 안 했으면 0이 사실이므로 0을 적는다. */}
      <div className="grid grid-cols-3 gap-2">
        <TodayTile icon="clock" value={minutes} unit="MIN" label="오늘 운동 시간" />
        <TodayTile
          icon="dumbbell"
          value={todayTotals == null ? null : todayTotals.setCount.toLocaleString()}
          unit="SETS"
          label="오늘 총 세트"
        />
        <TodayTile
          icon="volume"
          value={
            todayTotals == null ? null : Math.round(todayTotals.weightVolumeKg).toLocaleString()
          }
          unit="KG"
          label="오늘 총 볼륨"
        />
      </div>
    </div>
  );
}

/**
 * 조회 전 자리 — 실제 카드와 **같은 구조**라 도착해도 튀지 않는다.
 * ⚠️ 주 행동은 여기에도 있다. 조회가 느리다고 운동을 시작할 수 없게 되면 안 된다.
 * ⚠️ 숫자를 지어내지 않는다.
 */
export function PersonalTodayCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden className="flex animate-pulse items-center gap-3">
        <div className="h-[60px] w-[60px] flex-none rounded-full bg-surface-2" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-40 rounded-full bg-surface-2" />
          <div className="mt-2 h-5 w-48 rounded-full bg-surface-2" />
        </div>
      </div>
      <section className="rounded-card border border-line-strong bg-surface p-4">
        <h2 className="text-[16px] font-extrabold">이번 주 운동</h2>
        <div aria-hidden className="mt-2 animate-pulse">
          <div className="h-14 w-32 rounded-card-sm bg-surface-2" />
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="aspect-square rounded-[12px] bg-surface-2" />)}
          </div>
        </div>
        <Link
          href="/record"
          className="mt-3 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-accent text-[16px] font-extrabold text-accent-ink"
        >
          <Icon name="play" size={16} filled />
          운동 시작하기
        </Link>
      </section>
      <div aria-hidden className="grid animate-pulse grid-cols-3 gap-2">
        <div className="h-[86px] rounded-card-sm bg-surface-2" />
        <div className="h-[86px] rounded-card-sm bg-surface-2" />
        <div className="h-[86px] rounded-card-sm bg-surface-2" />
      </div>
    </div>
  );
}
