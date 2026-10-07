"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  formatMetric,
  gapMessage,
  metricMeta,
  metricTotalsByUser,
  minutesKnown,
  rankMetric,
  representativeStanding,
  weeklyLeaders,
  type MetricKey,
  type MetricRow,
} from "@/lib/domain/challenge-metrics";
import { MetricRankingList } from "./metric-ranking-list";
import { MetricSelector, type RankingKey } from "./metric-selector";
import { MyStandingCard } from "./my-standing-card";

type Member = { id: string; nickname: string; avatar_url: string | null };

/**
 * 진행 중 챌린지 `랭킹` 탭 — 최종 시안 1번 화면 (2026-10-07).
 * 순서: 내 현재 순위 → 지표 선택 → `{지표} 랭킹` 카드(내 기록·차이 문구·TOP 5·전체 랭킹 보기) → 종합 점수 잠금.
 *
 * ⚠️ 종합 점수는 종료일 공개(지침). 방장이 `live_ranking`을 켠 방만 랭킹 화면에서 볼 수 있다
 *    (사용자 결정 2026-10-07 "켠 방만 진행 중 공개").
 * ⚠️ 계산은 전부 `challenge-metrics.ts`. 이 파일은 고르고 그리기만 한다.
 */
export function CompetitionTab({
  rows,
  members,
  myUserId,
  startDate,
  endKey,
  todayKey,
  timeZone,
  todayDone,
  streak,
  liveRanking,
  periodOver = false,
  onOpenRanking,
}: {
  rows: readonly MetricRow[];
  members: readonly Member[];
  myUserId: string;
  startDate: string;
  /** 집계 끝 날짜 — 진행 중엔 오늘(종료일을 넘지 않게) */
  endKey: string;
  todayKey: string;
  timeZone: string;
  todayDone: boolean;
  streak: number;
  liveRanking: boolean;
  /** 종료일이 지났다(결과 발표 대기) */
  periodOver?: boolean;
  onOpenRanking: (key: RankingKey) => void;
}) {
  const [metric, setMetric] = useState<MetricKey>("sessions");
  const [showHelp, setShowHelp] = useState(false);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const minutesOk = minutesKnown(rows);
  const totals = useMemo(
    () => metricTotalsByUser(rows, memberIds, startDate, endKey, timeZone),
    [rows, memberIds, startDate, endKey, timeZone],
  );
  const standing = representativeStanding(totals, myUserId, minutesOk);
  const weeklyFirst = standing
    ? weeklyLeaders(rows, memberIds, startDate, todayKey, timeZone, standing.metric).includes(myUserId)
    : false;
  const ranks = rankMetric(totals, metric);
  const mine = ranks.find((r) => r.userId === myUserId);
  const gap = gapMessage(ranks, myUserId, metric);
  const meta = metricMeta(metric);
  const profileOf = (id: string) => members.find((m) => m.id === id);
  const minutesPending = metric === "minutes" && !minutesOk;

  return (
    <div className="flex flex-col gap-3">
      <MyStandingCard
        standing={standing}
        todayDone={todayDone}
        streak={streak}
        weeklyFirst={weeklyFirst}
        periodOver={periodOver}
        onOpenRanking={() => onOpenRanking(standing?.metric ?? metric)}
      />

      <MetricSelector
        value={metric}
        onChange={(k) => k !== "overall" && setMetric(k)}
        minutesAvailable={minutesOk}
      />

      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1 text-[16px] font-extrabold">
            {meta.label} 랭킹
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-label={`${meta.label} 기준 보기`}
              aria-expanded={showHelp}
              className="grid h-4 w-4 place-items-center rounded-full border border-faint text-[10px] font-black text-faint"
            >
              ?
            </button>
          </h3>
          {!minutesPending && (
            <span className="text-[12px] text-muted">
              내 기록{" "}
              <b className="font-mono text-[16px] font-black text-accent">
                {formatMetric(metric, mine?.value ?? 0)}
              </b>
            </span>
          )}
        </div>

        {showHelp && <p className="mt-1 text-[11.5px] text-faint">{meta.help}</p>}

        {minutesPending ? (
          <p className="mt-3 rounded-card-sm bg-surface-2 px-3 py-4 text-center text-[12.5px] text-muted">
            운동 시간 집계를 준비 중이에요. 다른 종목은 지금 볼 수 있어요.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] text-muted" data-testid="gap-message">
              <b className="text-text">{gap.headline}</b> {gap.tip}
            </p>
            <div className="mt-3">
              <MetricRankingList
                lines={ranks.map((r) => ({ userId: r.userId, rank: r.rank, value: formatMetric(metric, r.value) }))}
                myUserId={myUserId}
                profileOf={profileOf}
                limit={5}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => onOpenRanking(metric)}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-[12px] border border-accent/60 text-[13.5px] font-extrabold text-accent"
        >
          전체 랭킹 보기
          <Icon name="chevron" size={15} />
        </button>
      </section>

      {liveRanking ? (
        <button
          type="button"
          onClick={() => onOpenRanking("overall")}
          className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-card"
        >
          <span>
            <span className="block text-[14px] font-extrabold">종합 점수 실시간 공개 방</span>
            <span className="text-[12px] text-muted">방장이 켠 방이라 진행 중에도 종합 순위를 볼 수 있어요</span>
          </span>
          <Icon name="chevron" size={18} className="text-muted" />
        </button>
      ) : (
        <section
          data-testid="overall-locked"
          className="flex flex-col items-center gap-1.5 rounded-card border border-dashed border-line-strong bg-surface px-4 py-5 text-center"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-muted">
            <Icon name="lock" size={19} />
          </span>
          <p className="text-[14px] font-extrabold">종합 점수는 종료일 공개</p>
          <p className="text-[12px] text-muted">지금은 개별 종목만 확인할 수 있어요.</p>
        </section>
      )}
    </div>
  );
}
