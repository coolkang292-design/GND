"use client";

import { Avatar } from "@/components/avatar";
import { UiIcon } from "@/components/ui-icon";
import { goalLabel, type ChallengeParticipantProfile } from "@/lib/challenge";
import {
  gndLabel,
  goalRate,
  rankParticipants,
  type ParticipantInput,
} from "@/lib/domain/goal-score";
import { levelLabel } from "@/lib/domain/level";
import type { UserGoal } from "@/lib/types";

/*
  2026-09-18: `challenge/page.tsx`에서 그대로 옮겼다(챌린지 탭 목록/상세 분리).
  계산은 한 줄도 바꾸지 않았다 — 순위는 `rankParticipants`, 점수는
  `scoreParticipant`를 지난다(홈·탭·시상대가 같은 자로 잰다).
*/

/** 시상대 + 상세 순위 (§6 결과 발표) */
export function ResultView({
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
