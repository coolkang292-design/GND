"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { MyChallenge } from "@/lib/challenge";
import { cardArtFor } from "@/lib/domain/challenge-art";
import { formatMonthDay } from "@/lib/domain/challenge-time";
import {
  SECTION_LABEL,
  challengeDayProgress,
  groupMyChallenges,
  primaryActionOf,
  type MySection,
} from "@/lib/domain/my-challenges";

/**
 * 내 챌린지 — 상태별 칸 (2026-09-18 챌린지 탭 개편).
 *
 * 옛 화면의 가로 칩(`ChallengePicker`)을 대신한다. 칩은 고른 하나만 보여줘서
 * **다른 챌린지의 상태(초대가 와 있다, 목표를 안 정했다)를 가렸다.** 여기는
 * 전부 한 목록에 두고 카드마다 할 일을 하나씩 단다(`primaryActionOf`).
 *
 * ⚠️ 카드 진행 막대는 **날짜만으로** 그린다(DAY 7 / 28). 운동 실적을 그리려면
 *    챌린지마다 기간 세션 RPC가 한 번씩 든다 — 1차 범위 밖이다.
 */
export function MyChallengeList({
  challenges,
  goalChallengeIds,
  todayKey,
  onOpen,
  onSetGoal,
}: {
  challenges: readonly MyChallenge[];
  /** 내가 목표를 세운 챌린지 id (`getMyGoalChallengeIds`) */
  goalChallengeIds: ReadonlySet<string>;
  todayKey: string;
  onOpen: (challengeId: string) => void;
  onSetGoal: (challengeId: string) => void;
}) {
  const groups = groupMyChallenges(challenges);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.section} aria-label={SECTION_LABEL[g.section]}>
          <h2 className="mb-2 flex items-baseline gap-1.5 px-0.5 text-[16px] font-extrabold">
            {SECTION_LABEL[g.section]}
            <span className="text-[13px] font-bold text-muted tabular-nums">{g.items.length}</span>
          </h2>
          <div className="flex flex-col gap-2">
            {g.items.map((c, i) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                section={g.section}
                hero={g.section === "active" && i === 0 && c.myStatus !== "dropped"}
                hasMyGoals={goalChallengeIds.has(c.id)}
                todayKey={todayKey}
                onOpen={onOpen}
                onSetGoal={onSetGoal}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * 카드 한 장 (2026-10-05 Performance Social).
 *
 * 시안은 진행 중 챌린지 하나를 **사진이 깔린 큰 카드**로 크게 보여 준다. 예전엔 카드마다
 * 큰 라임 버튼(`오늘 운동하기`)이 있어 10개짜리 목록이 버튼 10개로 읽혔다(사용자 화면).
 * 그래서 진행 중 칸의 **첫 카드만** 큰 카드(`hero`)로 그리고, 나머지는 한 줄 행 +
 * 작은 알약 버튼으로 줄였다. 할 일(`primaryActionOf`)은 그대로 카드마다 하나씩이다.
 *
 * ⚠️ 대표 버튼을 상세 열기 버튼 **안**에 넣지 마라 — 중첩 버튼은 유효하지 않은 HTML이고,
 *    버튼을 눌러도 상세가 먼저 열린다.
 * ⚠️ 진행 중 카드에 다른 참가자 순위·성과를 그리지 않는다(사용자 확정 2026-10-05).
 */
function ChallengeCard({
  challenge: c,
  section,
  hero = false,
  hasMyGoals,
  todayKey,
  onOpen,
  onSetGoal,
}: {
  challenge: MyChallenge;
  section: MySection;
  hero?: boolean;
  hasMyGoals: boolean;
  todayKey: string;
  onOpen: (id: string) => void;
  onSetGoal: (id: string) => void;
}) {
  const endedByDate = c.end_date < todayKey;
  const action = primaryActionOf({ ...c, hasMyGoals, endedByDate }, "card");
  const progress = challengeDayProgress(todayKey, c.start_date, c.end_date);
  const pct = Math.round(progress.ratio * 100);

  const statusLine = (() => {
    switch (section) {
      case "active":
        return c.myStatus === "dropped"
          ? "목표를 정하지 않아 이번 챌린지에선 빠졌어요"
          : `DAY ${progress.day} / ${progress.total}`;
      case "setup":
        return progress.daysUntilStart > 0
          ? `${formatMonthDay(c.start_date)} 시작 · D-${progress.daysUntilStart}`
          : "곧 시작해요";
      case "invited":
        return `초대받았어요 · ${formatMonthDay(c.start_date)} 시작`;
      case "ended":
        return c.myStatus === "dropped"
          ? "이번 챌린지에선 빠졌어요"
          : `${formatMonthDay(c.end_date)} 종료`;
    }
  })();

  const filled = action.kind === "goto_record" || action.kind === "open_goal_setup";

  if (hero) {
    const daysLeft = Math.max(0, progress.total - progress.day);
    return (
      <article className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
        <button
          type="button"
          onClick={() => onOpen(c.id)}
          aria-label={`${c.name} 열기`}
          className="relative block h-[150px] w-full text-left"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardArtFor(c.id, c.recruit_image_url)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-surface/10" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
          <span className="absolute inset-0 flex flex-col justify-between p-4">
            <span className="inline-flex h-6 w-fit items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2.5 text-[11px] font-extrabold">
              <Icon name="calendar" size={12} className="text-accent" />
              {daysLeft > 0 ? `${daysLeft}일 남음` : "오늘 마지막 날"}
            </span>
            <span className="line-clamp-2 max-w-[80%] text-[26px] font-black italic leading-[1.1] tracking-tight">
              {c.name}
            </span>
          </span>
        </button>
        <div className="px-4 pt-1 pb-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-extrabold text-muted">
              DAY <strong className="text-[22px] font-black text-text">{progress.day}</strong> / {progress.total}
            </p>
            <span className="text-[13px] font-bold text-muted tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <CardAction
            action={action}
            id={c.id}
            onOpen={onOpen}
            onSetGoal={onSetGoal}
            className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold ${
              filled ? "bg-accent text-accent-ink active:bg-accent-press" : "border border-line-strong bg-surface-2 text-text"
            }`}
            withPlay={action.kind === "goto_record"}
          />
        </div>
      </article>
    );
  }

  return (
    <article className="flex items-center gap-3 rounded-card border border-line bg-surface p-2.5">
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        aria-label={`${c.name} 열기`}
        className="flex-none"
      >
        {/* ⚠️ 사용자 사진이 언제나 이긴다 · 같은 방은 언제나 같은 그림(`cardArtFor`).
            ⚠️ 종료한 방은 트로피다 — 끝난 방에 운동 사진을 붙이면 아직 도는 방처럼 보인다. */}
        {section === "ended" && !c.recruit_image_url ? (
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-[12px] border border-line bg-surface-2 text-gold"
          >
            <Icon name="trophy" size={24} />
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cardArtFor(c.id, c.recruit_image_url)}
            alt=""
            loading="lazy"
            className="h-14 w-14 rounded-[12px] object-cover"
          />
        )}
      </button>
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-[14.5px] font-extrabold">{c.name}</p>
        <p className="mt-0.5 truncate text-[11.5px] font-bold text-muted">{statusLine}</p>
        {section === "active" && c.myStatus !== "dropped" && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <CardAction
        action={action}
        id={c.id}
        onOpen={onOpen}
        onSetGoal={onSetGoal}
        className={`flex h-8 flex-none items-center rounded-full px-3 text-[12px] font-extrabold whitespace-nowrap ${
          action.kind === "open_goal_setup"
            ? "bg-accent text-accent-ink"
            : action.kind === "goto_record"
              ? "border border-accent/60 text-accent"
              : "border border-line-strong text-text"
        }`}
      />
    </article>
  );
}

/** 카드의 할 일 하나 — 기록으로 가는 링크 / 목표 정하기 / 상세 열기 */
function CardAction({
  action,
  id,
  onOpen,
  onSetGoal,
  className,
  withPlay = false,
}: {
  action: ReturnType<typeof primaryActionOf>;
  id: string;
  onOpen: (id: string) => void;
  onSetGoal: (id: string) => void;
  className: string;
  withPlay?: boolean;
}) {
  const body = (
    <>
      {withPlay && <Icon name="play" size={15} filled />}
      {action.kind === "none" ? null : action.label}
    </>
  );
  if (action.kind === "goto_record") {
    return (
      <Link href="/record" className={className}>
        {body}
      </Link>
    );
  }
  if (action.kind === "open_goal_setup") {
    return (
      <button type="button" onClick={() => onSetGoal(id)} className={className}>
        {body}
      </button>
    );
  }
  if (action.kind === "open_detail") {
    return (
      <button type="button" onClick={() => onOpen(id)} className={className}>
        {body}
      </button>
    );
  }
  return null;
}
