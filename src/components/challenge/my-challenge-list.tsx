"use client";

import Link from "next/link";
import type { MyChallenge } from "@/lib/challenge";
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
          <h2 className="mb-2 flex items-baseline gap-1.5 text-[15px] font-extrabold">
            {SECTION_LABEL[g.section]}
            <span className="font-mono text-[13px] text-muted">{g.items.length}</span>
          </h2>
          <div className="flex flex-col gap-2.5">
            {g.items.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                section={g.section}
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

function ChallengeCard({
  challenge: c,
  section,
  hasMyGoals,
  todayKey,
  onOpen,
  onSetGoal,
}: {
  challenge: MyChallenge;
  section: MySection;
  hasMyGoals: boolean;
  todayKey: string;
  onOpen: (id: string) => void;
  onSetGoal: (id: string) => void;
}) {
  const endedByDate = c.end_date < todayKey;
  const action = primaryActionOf({ ...c, hasMyGoals, endedByDate }, "card");
  const progress = challengeDayProgress(todayKey, c.start_date, c.end_date);

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

  const ctaClass =
    "mt-2 flex h-10 w-full items-center justify-center rounded-card-sm text-[13.5px] font-extrabold";
  const filled = action.kind === "goto_record" || action.kind === "open_goal_setup";
  const style = filled
    ? "bg-accent text-accent-ink"
    : "border border-line bg-surface-2 text-text";

  return (
    <article className="flex gap-3 rounded-card border border-line bg-surface p-2.5 shadow-card">
      {/* 카드 본문 = 상세 열기. ⚠️ 대표 버튼을 이 버튼 **안**에 넣지 마라 — 중첩
          버튼은 유효하지 않은 HTML이고, 버튼을 눌러도 상세가 먼저 열린다. */}
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        aria-label={`${c.name} 열기`}
        className="flex-none"
      >
        {c.recruit_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={c.recruit_image_url}
            alt=""
            loading="lazy"
            className="h-[92px] w-[80px] rounded-card-sm object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-[92px] w-[80px] place-items-center rounded-card-sm bg-gradient-to-br from-accent/35 to-surface-2 text-3xl"
          >
            {section === "ended" ? "🏆" : "🏁"}
          </span>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => onOpen(c.id)}
          className="min-w-0 text-left"
        >
          <p className="truncate text-[15px] font-extrabold">{c.name}</p>
          <p className="mt-0.5 text-[12px] font-bold text-muted">{statusLine}</p>
        </button>
        {section === "active" && c.myStatus !== "dropped" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>
            <span className="flex-none font-mono text-[10.5px] text-muted">
              {Math.round(progress.ratio * 100)}%
            </span>
          </div>
        )}
        {action.kind === "goto_record" ? (
          <Link href="/record" className={`${ctaClass} ${style}`}>
            {action.label}
          </Link>
        ) : action.kind === "open_goal_setup" ? (
          <button type="button" onClick={() => onSetGoal(c.id)} className={`${ctaClass} ${style}`}>
            {action.label}
          </button>
        ) : action.kind === "open_detail" ? (
          <button type="button" onClick={() => onOpen(c.id)} className={`${ctaClass} ${style}`}>
            {action.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}
