"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/ui/icon";
import { MetricSelector, type RankingKey } from "@/components/challenge/competition/metric-selector";
import {
  formatMetric,
  metricMeta,
  rankMetric,
  type MetricTotals,
} from "@/lib/domain/challenge-metrics";
import type { RankedParticipant } from "@/lib/domain/goal-score";

const MEDAL: Record<1 | 2 | 3, string> = {
  1: "bg-gold text-accent-ink",
  2: "bg-silver text-accent-ink",
  3: "bg-bronze text-accent-ink",
};

type Row = { userId: string; rank: number | null; value: string };

/**
 * 종료 화면 `최종 랭킹` 탭 — 최종 시안 4번 (2026-10-07).
 * 탭 `종합 점수 · 운동 횟수 · 운동 시간 · 유산소 거리 · 웨이트 볼륨` → 표 `순위 · 참가자 · 값 · 주요 기록`.
 * 최종 랭킹은 전체를 보는 화면이라 **전원**을 그린다(수십 명이어도 한 줄씩 가볍다).
 * 아래: `챌린지 기록 인증 >`(결과 텍스트 공유, 결정 4) · `다음 챌린지 참여하기`(둘러보기, 결정 3).
 */
export function FinalRanking({
  overall,
  totals,
  minutesAvailable,
  myUserId,
  profileOf,
  onCertify,
  certifyNote,
  onDiscover,
}: {
  overall: RankedParticipant[];
  totals: ReadonlyMap<string, MetricTotals>;
  minutesAvailable: boolean;
  myUserId: string;
  profileOf: (id: string) => { nickname: string; avatar_url: string | null } | undefined;
  /** 목표를 안 건 사람은 종합 순위가 없어 인증할 게 없다 — undefined면 줄을 숨긴다 */
  onCertify?: () => void;
  certifyNote: string | null;
  onDiscover: () => void;
}) {
  const [key, setKey] = useState<RankingKey>("overall");
  const rows: Row[] =
    key === "overall"
      ? overall.map((r) => ({ userId: r.userId, rank: r.rank, value: r.overall.toFixed(1) }))
      : rankMetric(totals, key).map((r) => ({
          userId: r.userId,
          rank: r.rank,
          value: key === "minutes" && !minutesAvailable ? "-" : r.rank === null ? "-" : formatMetric(key, r.value),
        }));
  const column = key === "overall" ? "종합 점수" : metricMeta(key).label;

  return (
    <div className="flex flex-col gap-3">
      <MetricSelector value={key} onChange={setKey} minutesAvailable={minutesAvailable} withOverall />

      <section className="rounded-card border border-line bg-surface shadow-card">
        <div className="grid grid-cols-[40px_1fr_76px_64px] items-center gap-1 border-b border-line px-3 py-2 text-[11px] font-bold text-muted">
          <span>순위</span>
          <span>참가자</span>
          <span className="text-right">{column}</span>
          <span className="text-right">주요 기록</span>
        </div>
        {key === "minutes" && !minutesAvailable && (
          <p className="px-3 py-2 text-[11.5px] text-muted">운동 시간 집계를 준비 중이에요.</p>
        )}
        <ol>
          {rows.map((r) => {
            const mine = r.userId === myUserId;
            const p = profileOf(r.userId);
            const t = totals.get(r.userId);
            return (
              <li
                key={r.userId}
                data-testid="final-row"
                data-mine={mine || undefined}
                className={`grid grid-cols-[40px_1fr_76px_64px] items-center gap-1 px-3 py-2 ${
                  mine ? "border-y border-accent bg-accent-weak" : "border-b border-line last:border-b-0"
                }`}
              >
                <span>
                  {r.rank !== null && r.rank <= 3 ? (
                    <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[12px] font-black ${MEDAL[r.rank as 1 | 2 | 3]}`}>
                      {r.rank}
                    </span>
                  ) : (
                    <span className="pl-1.5 font-mono text-[13px] font-extrabold text-muted">{r.rank ?? "-"}</span>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar
                    src={p?.avatar_url}
                    className="grid h-7 w-7 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-xs"
                  />
                  <span className={`truncate text-[13px] font-bold ${mine ? "text-accent" : ""}`}>
                    {mine ? "나" : (p?.nickname ?? "?")}
                  </span>
                </span>
                <span className={`text-right font-mono text-[14px] font-extrabold ${mine ? "text-accent" : ""}`}>
                  {r.value}
                </span>
                <span className="text-right text-[10.5px] leading-tight text-muted">
                  {t ? `${formatMetric("sessions", t.sessions)}` : "-"}
                  <br />
                  {t && minutesAvailable ? formatMetric("minutes", t.minutes) : "-"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {onCertify && (
        <button
          type="button"
          onClick={onCertify}
          className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-card"
        >
          <span className="flex items-center gap-2 text-[14px] font-extrabold">
            <Icon name="award" size={18} className="text-accent" />
            챌린지 기록 인증
          </span>
          <Icon name="chevron" size={18} className="text-muted" />
        </button>
      )}
      {certifyNote && (
        <p role="status" className="text-center text-[12px] font-bold text-accent">
          {certifyNote}
        </p>
      )}

      <button
        type="button"
        onClick={onDiscover}
        className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-[15px] font-extrabold text-accent-ink active:bg-accent-press"
      >
        다음 챌린지 참여하기
      </button>
    </div>
  );
}
