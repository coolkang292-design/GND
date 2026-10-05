"use client";

import { Icon } from "@/components/ui/icon";
import { RankingPodium } from "@/components/challenge/ranking-podium";
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

  return (
    <>
      {/* 시상대 — 진행 중 실시간 랭킹과 **같은 부품**(`RankingPodium`, 2026-10-05) */}
      <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
        <h3 className="mb-2 flex items-center justify-center gap-1.5 text-[16px] font-extrabold">
          <Icon name="trophy" size={18} className="text-gold" /> 최종 순위 발표
        </h3>
        <RankingPodium
          ranked={ranked}
          profileOf={profileOf}
          myUserId={myUserId}
          onProfileClick={onProfileClick}
        />
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {ranked.slice(0, 3).map((r) => (
            <span key={r.userId} className="text-[10.5px] font-bold text-muted">
              {r.rank}위 {gndLabel(r.rank, total)}
            </span>
          ))}
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
                    ? "bg-gold text-accent-ink"
                    : "bg-surface-3 text-muted"
                }`}
              >
                {r.rank}
              </span>
              <div className="flex-1">
                <p className="text-sm font-extrabold">
                  {p?.nickname ?? "?"}
                  {r.userId === myUserId && (
                    <span className="ml-1 rounded-full border border-accent/60 px-1.5 text-[10px] text-accent">
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
