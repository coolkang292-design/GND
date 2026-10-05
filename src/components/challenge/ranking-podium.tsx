"use client";

import { Avatar } from "@/components/avatar";
import type { ChallengeParticipantProfile } from "@/lib/challenge";
import type { rankParticipants } from "@/lib/domain/goal-score";

type Ranked = ReturnType<typeof rankParticipants>[number];

/**
 * TOP 3 시상대 — Performance Social 시안의 `실시간 랭킹` 카드 (2026-10-05).
 *
 * 종료 결과(`ResultView`)와 진행 중 실시간 랭킹(`live_ranking`, 0115)이 **같은 부품**을 쓴다.
 * 순위는 부르는 쪽이 `rankParticipants`로 이미 매긴 값을 받는다 — 여기서 다시 세지 않는다
 * (종합점수 기준, 동점이면 같은 등수. 사용자 결정 2026-10-05 "순위 기준은 종합점수").
 *
 * 시안 규칙(적용 지침 §챌린지·§순위 카드):
 *  - 1위 왕관·월계수는 금색, 2위 은색, 3위 동색, **내 카드는 라임 테두리 + YOU**
 *  - **공동 1위도 금색** — 색은 자리(가운데)가 아니라 등수가 정한다
 *  - 가운데 1위 카드를 더 높게, 왕관은 카드 위, 월계수는 아바타 둘레
 *  - 카드 아래 금속 받침대(`ranking/platform-*.svg`)
 *  - 인물은 **실제 참가자 아바타**다. 패키지의 가상 인물 사진을 쓰지 않는다
 *
 * ⚠️ 프로필을 못 찾으면(`p` 없음) 누를 수 없다 — 누구인지 모르는 대상의 시트를 열면
 *    조회가 `not_crew`로 떨어진다(옛 ResultView와 같은 규칙).
 */
const TIER = {
  1: { name: "gold", text: "text-gold", border: "border-gold/70" },
  2: { name: "silver", text: "text-silver", border: "border-silver/50" },
  3: { name: "bronze", text: "text-bronze", border: "border-bronze/60" },
} as const;

function tierOf(rank: number) {
  return TIER[Math.min(Math.max(rank, 1), 3) as 1 | 2 | 3];
}

export function RankingPodium({
  ranked,
  profileOf,
  myUserId,
  secondaryOf,
  onProfileClick,
}: {
  ranked: Ranked[];
  profileOf: (id: string) => ChallengeParticipantProfile | undefined;
  myUserId: string;
  /** 점수 아래 한 줄(예: `12회 운동`) — 없으면 점수만 */
  secondaryOf?: (userId: string) => string | null;
  onProfileClick: (p: ChallengeParticipantProfile) => void;
}) {
  // 가운데가 1등 자리 — [2, 1, 3] 순서로 놓는다(옛 시상대와 같은 배치)
  const podium = [ranked[1], ranked[0], ranked[2]];

  return (
    <div className="relative">
      <div className="grid grid-cols-3 items-end gap-2 px-1">
        {podium.map((r, slot) => {
          if (!r) return <div key={`empty-${slot}`} />;
          const p = profileOf(r.userId);
          const tier = tierOf(r.rank);
          const center = slot === 1;
          const mine = r.userId === myUserId;
          const secondary = secondaryOf?.(r.userId) ?? null;
          return (
            <div key={r.userId} className="relative flex flex-col items-center">
              {/* 내 카드 표시 — 시안의 `YOU` */}
              <span
                className={`mb-0.5 text-[10px] font-black tracking-wider ${
                  mine ? "text-accent" : "invisible"
                }`}
              >
                YOU
              </span>
              {r.rank === 1 && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src="/gnd/decorations/crown-64.webp"
                  alt=""
                  width={30}
                  height={30}
                  className="-mb-1 h-[30px] w-[30px]"
                />
              )}
              <button
                type="button"
                disabled={!p}
                onClick={() => p && onProfileClick(p)}
                aria-label={p ? `${p.nickname} 프로필 보기` : undefined}
                className={`relative flex w-full flex-col items-center overflow-hidden rounded-t-[18px] border border-b-0 px-1.5 pt-2.5 disabled:cursor-default ${
                  mine ? "border-accent/80" : tier.border
                } ${center ? "pb-4" : "pb-3"}`}
                style={{
                  backgroundImage: `url(/gnd/ranking/panel-${tier.name}.svg)`,
                  backgroundSize: "100% 100%",
                }}
              >
                <span className={`flex items-center gap-1 text-[13px] font-black ${tier.text}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/gnd/ranking/medal-${mine ? "you" : tier.name}.svg`}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4"
                  />
                  {r.rank}위
                </span>
                <span className={`relative mt-2 grid place-items-center ${center ? "h-[78px] w-[78px]" : "h-[62px] w-[62px]"}`}>
                  {r.rank === 1 && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src="/gnd/decorations/laurel-128.webp"
                      alt=""
                      className="absolute inset-0 h-full w-full scale-[1.18] object-contain"
                    />
                  )}
                  <Avatar
                    src={p?.avatar_url}
                    className={`relative grid place-items-center overflow-hidden rounded-full border-2 bg-surface-2 text-xl ${
                      mine ? "border-accent" : tier.border
                    } ${center ? "h-[58px] w-[58px]" : "h-[52px] w-[52px]"}`}
                  />
                </span>
                <span className="mt-1.5 w-full truncate text-center text-[12.5px] font-extrabold">
                  {mine ? "나" : (p?.nickname ?? "?")}
                </span>
                <span className={`mt-0.5 text-[15px] font-black tabular-nums ${r.rank === 1 ? "text-gold" : "text-text"}`}>
                  {r.overall.toFixed(1)}
                  <span className="ml-0.5 text-[10.5px] font-bold text-muted">점</span>
                </span>
                {secondary && <span className="text-[10.5px] text-muted">{secondary}</span>}
              </button>
              {/* 금속 받침대 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/gnd/ranking/platform-${tier.name}.svg`}
                alt=""
                className="-mt-1 h-auto w-[112%] max-w-none"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
