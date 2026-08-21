"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { UiIcon } from "@/components/ui-icon";
import { isPhotoAvatar } from "@/lib/domain/avatar-source";
import type { FriendStatus } from "@/lib/domain/friend-board";
import { personalTodayAction } from "@/lib/domain/home-competition";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";
import { MAX_DAILY_WORKOUT_XP_NOW } from "@/lib/domain/xp";
import type { ProgressSummary } from "@/lib/progression";

/**
 * 홈 최상단 `나의 오늘` 카드 (2026-08-21 개편).
 *
 * 설계: `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md`
 *
 * ⚠️ **내 정보가 크루 목록에서 나온 자리다.** 옛 홈은 내 행을 크루 카드 안에 한 줄로
 * 넣고, 성장·스트릭·주간 통계를 챌린지 카드 **아래** 별도 카드 셋으로 또 그렸다.
 * 같은 사실이 네 곳에 흩어져 첫 화면이 589px짜리 카드 하나로 차 있었다(설계 §2).
 * 이 카드는 그 넷을 하나로 합친 것이지 새 정보를 만든 것이 아니다.
 *
 * ⚠️ **여기서 조회하지 않는다.** 재료는 전부 홈이 이미 부른 것을 내려받는다
 * (`getMyProfile` · `getProgressSummary` · `getCompletedSessions`). 카드 안에서
 * 다시 부르면 홈에서 같은 질의가 두 번 나간다 — 크루 카드가 같은 규약이다.
 *
 * ⚠️ 실제 렌더 높이 목표는 **330px 이내**다(설계 §10). 지표를 늘리기 전에 재라 —
 * 이 카드가 커지면 크루 두 행이 375×812의 하단 탭 아래로 밀려 카드를 나눈 이유가
 * 사라진다.
 */

/** 오늘 상태 알약 — 크루 행과 **같은 3단계**, 문구만 넓은 자리에 맞춰 온전하다.
 *
 * ⚠️ 크루 행의 `완료`와 달리 여기는 `오늘 완료`다(설계 §6.1). 크루 행은 4칸 그리드
 * 안이라 18px 잘려서 줄인 것이고(2026-08-08 실측), 이 카드는 이름 아래 한 줄을
 * 통째로 쓰므로 잘리지 않는다. 판정 규칙은 `resolvePersonalTodayStatus` 하나다.
 */
const STATUS_STYLE: Record<FriendStatus, { label: string; className: string }> =
  {
    done: { label: "오늘 완료", className: "bg-good-weak text-good" },
    active: { label: "운동 중", className: "bg-warn/15 text-warn" },
    idle: { label: "운동 전", className: "bg-surface text-muted" },
  };

const METRIC_CLASS =
  "flex flex-col items-center justify-center rounded-card-sm border border-line bg-surface-2 px-2 py-2";

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  /** 값 옆 장식. 옆에 숫자가 있으므로 낭독에서는 빼도 된다 */
  icon?: React.ReactNode;
}) {
  return (
    <div className={METRIC_CLASS}>
      <span className="text-[11px] text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <strong className="text-[17px] font-extrabold">{value}</strong>
        {icon}
      </span>
    </div>
  );
}

/**
 * 배지 칸의 금색 육각형 (목업 그대로).
 *
 * ⚠️ 인라인 SVG인 이유는 `public/ui-icons`에 배지 글리프가 **없어서**다. 자산을
 * 새로 만들지 않고 목업의 모양만 맞춘다. 옆에 개수가 글자로 있으므로 `aria-hidden`이다.
 */
function BadgeHex() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px] flex-none"
      fill="currentColor"
    >
      <path
        d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7z"
        className="text-accent"
        fill="currentColor"
      />
      <path d="M12 5.2 18.2 8.8v7.2L12 19.6 5.8 16V8.8z" fill="#0b0b0c" opacity="0.28" />
    </svg>
  );
}

export type PersonalTodayCardProps = {
  profile: { nickname: string; avatarUrl: string | null };
  /**
   * 성장 요약. `null` = **조회 실패**(설계 §9) — 그때도 오늘 상태·이번 주·연속·주
   * 행동은 그대로 그리고 레벨 자리에만 실패를 적는다.
   *
   * ⚠️ 조회 **중**에는 이 카드를 그리지 않는다. 홈이 `PersonalTodayCardSkeleton`을
   * 대신 그린다 — 안 그러면 도착 직전까지 "불러오지 못했어요"가 번쩍인다.
   */
  summary: ProgressSummary | null;
  /**
   * 내 **전체** 완료 세션 시각.
   *
   * ⚠️ 크루 행처럼 `visibility='group'`으로 좁힌 값을 넣지 마라. 내 오늘·이번 주·
   * 스트릭은 비공개 운동까지 포함해야 서버 규칙(`poke_requires_workout`)과 같은
   * "오늘"을 쓴다(설계 §8, `workedOutToday` 주석).
   */
  completedAts: Date[];
  /** 진행 중 챌린지의 주 운동일. 없으면 `null` — 가짜 달성률을 만들지 않는다 */
  weeklyGoal: number | null;
  status: FriendStatus;
  /**
   * 내 보유 배지 종류 수.
   *
   * ⚠️ `null` = **아직 안 왔거나 조회 실패**다. `0`(정말 없다)과 구별해 `—`를 그린다 —
   * 늦다고 `0`으로 속이면 도착하는 순간 숫자가 튀어 배지가 생긴 것처럼 읽힌다
   * (`FriendRow.badgeCount`가 같은 규약).
   *
   * ⚠️ 2026-08-21 설계 검토에서 이 칸을 한 번 뺐다가, 같은 날 사용자가 목업을 보고
   * **되살리라고 지시했다**(보완 기준 1 철회). 되살린 것은 개수 한 칸뿐이다 —
   * 배지 썸네일 줄은 프로필 상세에 남는다.
   */
  badgeCount: number | null;
  /** 홈이 한 번 만든 기준 시각. 카드가 `new Date()`를 부르면 화면마다 "오늘"이 갈린다 */
  now: Date;
};

export function PersonalTodayCard({
  profile,
  summary,
  completedAts,
  weeklyGoal,
  status,
  badgeCount,
  now,
}: PersonalTodayCardProps) {
  const tz = DEFAULT_TIMEZONE;
  const { days } = weekWorkoutDays(completedAts, now, tz);
  const streak = currentStreak(workoutDayKeys(completedAts, tz), dayKey(now, tz));
  const hasGoal = weeklyGoal !== null && weeklyGoal > 0;
  const action = personalTodayAction(status, MAX_DAILY_WORKOUT_XP_NOW);
  const pct = summary
    ? Math.min(100, Math.round(summary.levelProgressPercent))
    : 0;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
        <UiIcon name="person" size={20} />
        나의 오늘
      </h2>

      {/* ⚠️ 아바타·이름·레벨 영역**만** 링크다 (설계 §6.3). 카드 전체를 `<Link>`로
          감싸면 아래 주 행동 버튼이 링크 안의 링크가 되어 — HTML상 무효인 데다 —
          운동하러 가려다 프로필이 열린다. CTA는 이 링크의 **형제**로 둔다. */}
      <Link
        href="/profile"
        aria-label={`${profile.nickname} 프로필 열기`}
        className="mt-2.5 flex items-center gap-3"
      >
        {/* ⚠️ 판정은 `isPhotoAvatar` 한 곳이다. `avatarUrl != null`로 가르면
            이모지를 쓰는 사람 전원이 캐릭터를 잃는다.
            ⚠️ 성장 조회가 실패하면 캐릭터 경로가 없다 — 그때만 기본 아바타로 접는다. */}
        {isPhotoAvatar(profile.avatarUrl) ? (
          <Avatar
            src={profile.avatarUrl}
            label={`${profile.nickname}님 프로필 사진`}
            className="h-14 w-14 flex-none overflow-hidden rounded-full border border-line bg-surface"
          />
        ) : summary ? (
          <Image
            src={summary.characterPath}
            alt={`${summary.stageName} 캐릭터`}
            width={56}
            height={74}
            sizes="56px"
            className="h-14 w-14 flex-none rounded-full border border-line bg-surface object-cover object-top"
          />
        ) : (
          <Avatar
            src={null}
            className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-line bg-surface text-2xl"
          />
        )}

        <div className="min-w-0 flex-1">
          {/* 긴 닉네임은 말줄임하되 전체 이름은 링크의 접근 가능한 이름에 남는다 */}
          <p className="truncate text-[17px] font-extrabold">
            {profile.nickname}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`flex-none rounded-full px-2 py-[2px] text-[11px] font-bold ${STATUS_STYLE[status].className}`}
            >
              {STATUS_STYLE[status].label}
            </span>
            {/* ⚠️ **단계명이 앞, 레벨이 뒤**다 (2026-08-08 사용자 지시 "개노답 LV2
                이 순으로"). 크루 행과 같은 표기여야 같은 사람이 두 자리에서 다르게
                안 읽힌다. 단계·레벨 모두 `getLevelProgress` 한 원천에서 온다. */}
            {summary && (
              <span className="flex-none rounded-full border border-accent/40 bg-accent-weak px-2 py-[2px] text-[11px] font-extrabold text-accent">
                {summary.stageName} Lv.{summary.currentLevel}
              </span>
            )}
          </div>

          {/* 설계 §9 — 성장 요약이 없어도 오늘 상태·지표·CTA는 그대로 남는다 */}
          {summary ? (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {summary.nextLevelRequiredXp === null
                  ? "최고 레벨 달성"
                  : `다음 레벨까지 ${summary.xpToNextLevel} XP`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-muted">
              성장 정보를 불러오지 못했어요
            </p>
          )}
        </div>
      </Link>

      {/* ⚠️ **세 칸이다** — 이번 주 · 연속 · 배지 (2026-08-21 사용자 지시로 배지 복원).
          칸을 더 늘리기 전에 375px에서 재라: 카드 안쪽 폭 311px를 3등분하면 한 칸이
          98px인데, `1 / 5`가 45px라 아직 여유가 있지만 네 칸이면 잘린다.
          ⚠️ 칸을 늘려도 **행이 하나**라 카드 높이는 그대로다(실측 326px). */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {hasGoal ? (
          <Metric label="이번 주" value={`${days.length} / ${weeklyGoal}`} />
        ) : (
          /* ⚠️ `0%`로 채우지 않는다 (설계 §9). 목표를 안 정했을 뿐인데 실패한
             것처럼 읽힌다 — `weekly-stats.tsx`가 2026-08-08에 같은 이유로 분모를
             지웠고, 같은 자리에서 정하러 가는 문을 연다. */
          <Link href="/challenge" className={METRIC_CLASS}>
            {/* ⚠️ 라벨에 `이번 주`를 **남긴다.** 옆 칸의 `연속`도 `N일`이라 라벨을
                `목표 정하기 ›`로 통째로 갈면 같은 `1일`이 두 개 놓여 무엇을 센
                숫자인지 알 수 없다(2026-08-21 테스트가 잡았다). 주간 통계 카드는
                3칸이라 폭이 111px뿐이어서 라벨을 못 늘렸지만(`weekly-stats.tsx`
                주석), 이 카드는 2칸이라 375px에서도 ~135px가 남는다. */}
            <span className="text-[11px] text-accent">이번 주 · 목표 정하기 ›</span>
            <strong className="text-[17px] font-extrabold">
              {days.length}일
            </strong>
          </Link>
        )}
        <Metric label="연속" value={`${streak}일`} />
        <Metric
          label="배지"
          value={badgeCount === null ? "—" : `${badgeCount}`}
          icon={badgeCount === null ? undefined : <BadgeHex />}
        />
      </div>

      {/* ⚠️ **여기 비교 문구를 다시 넣지 마라** (2026-08-21 사용자 지시).
          `크루 2명 중 1명 완료 · 나는 아직` 한 줄이 있었는데, 같은 날 크루 헤더에
          `1 / 2명 완료` 칩이 들어오면서 **앞뒤가 둘 다 중복**이 됐다 —
          완료 인원은 크루 칩이, 내 상태는 위 `운동 전` 알약이 이미 말한다.
          사용자가 화면을 보고 지우라고 했다. 되살리려면 그 둘부터 없애라. */}
      {/* ⚠️ 완료 상태는 **링크가 아니다** (설계 §6.2, 사용자 확정 9번 요구).
          오늘 마친 사람에게 다음 운동을 재촉하지 않고 같은 면적을 칭찬에 쓴다.
          문구만 바꾸고 `<Link>`로 그리면 그 결정이 화면에서 사라진다.
          ⚠️ 금색 **채움**은 눌리는 것에만 쓴다. 배너는 같은 계열이되 테두리·약한
          배경으로 눌리지 않음을 보인다(설계 §10). */}
      {action.kind === "link" ? (
        <Link
          href="/record"
          className="mt-3 flex h-12 items-center justify-center gap-1.5 rounded-card bg-accent text-[15px] font-extrabold text-accent-ink shadow-card"
        >
          <UiIcon name="streak-on" size={18} />
          {action.label}
        </Link>
      ) : (
        <div
          role="status"
          className="mt-3 flex h-12 items-center justify-center rounded-card border border-accent/40 bg-accent-weak text-[15px] font-extrabold text-accent"
        >
          {action.label}
        </div>
      )}
    </section>
  );
}

/**
 * 조회 전 자리를 잡는 스켈레톤 — 실제 카드와 **같은 구조**라 도착해도 튀지 않는다.
 *
 * ⚠️ **주 행동은 여기에도 있다.** 홈의 유일한 운동 버튼이 이 카드로 들어왔으므로
 * 조회가 느리다는 이유로 사라지면 안 된다 — 크루 카드가 2026-08-13에 정확히 그
 * 사고를 겪고 네 갈래 전부에 CTA를 그리게 바뀌었다.
 *
 * ⚠️ 숫자를 지어내지 않는다. `0일`·`0%`를 채우면 조회가 끝나는 순간 값이 바뀌어
 * **기록이 사라졌다 생긴 것처럼** 읽힌다.
 */
export function PersonalTodayCardSkeleton() {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold">
        <UiIcon name="person" size={20} />
        나의 오늘
      </h2>
      <div aria-hidden className="mt-2.5 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 flex-none rounded-full bg-surface-2" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-28 rounded-full bg-surface-2" />
            <div className="mt-2 h-4 w-40 rounded-full bg-surface-2" />
            <div className="mt-2 h-2 rounded-full bg-surface-2" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-14 rounded-card-sm bg-surface-2" />
          <div className="h-14 rounded-card-sm bg-surface-2" />
          <div className="h-14 rounded-card-sm bg-surface-2" />
        </div>
        <div className="mt-3 h-9 rounded-card-sm bg-surface-2" />
      </div>
      <Link
        href="/record"
        className="mt-3 flex h-12 items-center justify-center gap-1.5 rounded-card bg-accent text-[15px] font-extrabold text-accent-ink shadow-card"
      >
        <UiIcon name="streak-on" size={18} />
        운동 시작하기
      </Link>
    </section>
  );
}
