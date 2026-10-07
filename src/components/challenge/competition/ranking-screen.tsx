"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/ui/icon";
import { ResultHeader } from "@/components/challenge/result/result-header";
import { dailyTotals } from "@/lib/domain/challenge-report";
import {
  dailyMetric,
  formatMetric,
  gapMessage,
  goalPace,
  metricMeta,
  metricTotalsByUser,
  minutesKnown,
  rankMetric,
  type MetricKey,
  type MetricRow,
} from "@/lib/domain/challenge-metrics";
import { inclusiveDays } from "@/lib/domain/challenge-time";
import { addDaysToDateKey } from "@/lib/domain/workout-plan";
import type { RankedParticipant } from "@/lib/domain/goal-score";
import { MetricDailyChart } from "./metric-daily-chart";
import { MetricRankingList } from "./metric-ranking-list";
import { MetricSelector, type RankingKey } from "./metric-selector";

type Member = { id: string; nickname: string; avatar_url: string | null };

/**
 * 진행 중 `챌린지 랭킹` 하위 화면 — 최종 시안 2번 (2026-10-07).
 * 지표 탭 → `{지표} 랭킹`(전체 순위, 10줄 + 내 줄 + 펼침) → `내 진행 현황` → `{n}위와 비교` → 팁.
 * `overallRanked`가 있으면(방장이 `live_ranking`을 켠 방) 맨 앞에 `종합 점수` 탭.
 */
export function RankingScreen({
  rows,
  members,
  myUserId,
  startDate,
  endDate,
  endKey,
  todayKey,
  timeZone,
  myGoals,
  initial,
  overallRanked,
  onBack,
}: {
  rows: readonly MetricRow[];
  members: readonly Member[];
  myUserId: string;
  startDate: string;
  endDate: string;
  endKey: string;
  todayKey: string;
  timeZone: string;
  myGoals: readonly { goal_type: string; target_value: number | string }[];
  initial: RankingKey;
  overallRanked: RankedParticipant[] | null;
  onBack: () => void;
}) {
  const [key, setKey] = useState<RankingKey>(overallRanked || initial !== "overall" ? initial : "sessions");
  const [period, setPeriod] = useState<"all" | "week">("all");
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const minutesOk = minutesKnown(rows);
  const totals = useMemo(
    () => metricTotalsByUser(rows, memberIds, startDate, endKey, timeZone),
    [rows, memberIds, startDate, endKey, timeZone],
  );
  const profileOf = (id: string) => members.find((m) => m.id === id);
  const myDays = useMemo(
    () => dailyTotals(rows.filter((r) => r.userId === myUserId), startDate, endKey, timeZone),
    [rows, myUserId, startDate, endKey, timeZone],
  );

  const metric = key === "overall" ? null : key;
  const ranks = metric ? rankMetric(totals, metric) : [];
  const gap = metric ? gapMessage(ranks, myUserId, metric) : null;
  const mine = metric ? ranks.find((r) => r.userId === myUserId) : null;
  const minutesPending = metric === "minutes" && !minutesOk;

  // 이번 주 = 오늘이 속한 챌린지 주(시작일부터 7일씩)
  const weekStart = addDaysToDateKey(startDate, Math.floor(Math.max(0, inclusiveDays(startDate, todayKey) - 1) / 7) * 7);
  const days = metric ? dailyMetric(myDays, metric, period === "week" ? weekStart : startDate, endKey) : [];
  const pace = metric ? goalPace(myGoals, metric, inclusiveDays(startDate, endDate)) : null;

  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader title="챌린지 랭킹" onBack={onBack} />
      <MetricSelector
        value={key}
        onChange={setKey}
        minutesAvailable={minutesOk}
        withOverall={overallRanked !== null}
      />

      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        {key === "overall" && overallRanked ? (
          <>
            <h3 className="text-[16px] font-extrabold">종합 점수 랭킹</h3>
            <p className="mt-1 text-[12px] text-muted">방장이 실시간 공개를 켠 방이에요. 점수는 종료 때 확정돼요.</p>
            <div className="mt-3">
              <MetricRankingList
                lines={overallRanked.map((r) => ({ userId: r.userId, rank: r.rank, value: `${r.overall.toFixed(1)}점` }))}
                myUserId={myUserId}
                profileOf={profileOf}
                limit={10}
                expandable
              />
            </div>
          </>
        ) : metric ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-extrabold">{metricMeta(metric).label} 랭킹</h3>
              {!minutesPending && (
                <span className="text-[12px] text-muted">
                  내 기록{" "}
                  <b className="font-mono text-[16px] font-black text-accent">{formatMetric(metric, mine?.value ?? 0)}</b>
                </span>
              )}
            </div>
            {minutesPending ? (
              <p className="mt-3 rounded-card-sm bg-surface-2 px-3 py-4 text-center text-[12.5px] text-muted">
                운동 시간 집계를 준비 중이에요. 다른 종목은 지금 볼 수 있어요.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[12.5px] text-muted" data-testid="gap-message">
                  <b className="text-text">{gap!.headline}</b> 이번 주에도 화이팅해요!
                </p>
                <div className="mt-3">
                  <MetricRankingList
                    lines={ranks.map((r) => ({ userId: r.userId, rank: r.rank, value: formatMetric(metric, r.value) }))}
                    myUserId={myUserId}
                    profileOf={profileOf}
                    limit={10}
                    expandable
                  />
                </div>
              </>
            )}
          </>
        ) : null}
      </section>

      {metric && !minutesPending && (
        <>
          <section className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">내 진행 현황</h3>
              <select
                id="ranking-period"
                aria-label="기간"
                value={period}
                onChange={(e) => setPeriod(e.target.value as "all" | "week")}
                className="rounded-[10px] border border-line bg-surface-2 px-2 py-1 text-[12px] font-bold text-text"
              >
                <option value="all">전체 기간</option>
                <option value="week">이번 주</option>
              </select>
            </div>
            <MetricDailyChart key={`${metric}-${period}`} days={days} metric={metric} pace={pace} />
          </section>

          {gap?.rival && mine && (
            <ComparisonCard
              metric={metric}
              me={{ value: mine.value, profile: profileOf(myUserId) }}
              rival={{ rank: gap.rival.rank, value: gap.rival.value, profile: profileOf(gap.rival.userId) }}
            />
          )}

          {gap && (
            <p className="flex items-start gap-2 rounded-card-sm border border-gold/40 bg-gold-weak px-3 py-2.5 text-[12.5px] font-bold text-gold">
              <Icon name="spark" size={15} className="mt-0.5 flex-none" />
              {gap.tip}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** 시안 `2위와 비교` — 나 · 차이 알약 · 상대, 아래 진행 막대(내 값 ÷ 큰 값) */
function ComparisonCard({
  metric,
  me,
  rival,
}: {
  metric: MetricKey;
  me: { value: number; profile?: Member };
  rival: { rank: number | null; value: number; profile?: Member };
}) {
  const diff = me.value - rival.value;
  const ratio = Math.max(me.value, rival.value) > 0 ? me.value / Math.max(me.value, rival.value) : 0;
  return (
    <section data-testid="comparison" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-[15px] font-extrabold">{rival.rank}위와 비교</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar src={me.profile?.avatar_url} className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full border-2 border-accent bg-surface-2" />
          <div className="min-w-0">
            <p className="text-[12px] text-muted">나</p>
            <p className="truncate font-mono text-[15px] font-black text-accent">{formatMetric(metric, me.value)}</p>
          </div>
        </div>
        <span className="rounded-full border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[12px] font-extrabold whitespace-nowrap">
          {diff >= 0 ? "+" : "-"}
          {formatMetric(metric, Math.abs(diff))}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-muted">{rival.profile?.nickname ?? "?"}</p>
            <p className="truncate font-mono text-[15px] font-black">{formatMetric(metric, rival.value)}</p>
          </div>
          <Avatar src={rival.profile?.avatar_url} className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full bg-surface-2" />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </section>
  );
}
