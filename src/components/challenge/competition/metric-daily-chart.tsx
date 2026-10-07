"use client";

import { useState } from "react";
import { formatShortDay } from "@/lib/domain/challenge-report";
import { formatMetric, type MetricKey } from "@/lib/domain/challenge-metrics";

const H = 96;

/**
 * 최종 시안 `내 진행 현황` — 선택 지표의 날짜별 라임 막대 + 말풍선 `9/14(일) · 62분`.
 * 점선은 **같은 지표의 목표가 있을 때만** 하루 페이스(`goalPace`). 처음엔 마지막 기록일이 선택돼 있다.
 */
export function MetricDailyChart({
  days,
  metric,
  pace,
}: {
  days: { dayKey: string; value: number }[];
  metric: MetricKey;
  pace: number | null;
}) {
  const last = [...days].map((d, i) => ({ d, i })).reverse().find((x) => x.d.value > 0);
  const [sel, setSel] = useState<number | null>(last ? last.i : null);
  const slot = 300 / Math.max(1, days.length);
  const bw = Math.min(8, slot * 0.55);
  const max = Math.max(1e-9, pace ?? 0, ...days.map((d) => d.value));
  const y = (v: number) => H - (v / max) * (H - 6);
  const picked = sel !== null ? days[sel] : null;
  const left = sel === null ? 0 : Math.min(86, Math.max(14, ((sel + 0.5) / days.length) * 100));
  const step = days.length > 14 ? 7 : 1;

  return (
    <div className="relative pt-12">
      {picked && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] border border-line-strong bg-surface-2 px-2.5 py-1 text-center text-[10.5px] leading-snug shadow-card"
          style={{ left: `${left}%` }}
        >
          <p className="text-muted">{formatShortDay(picked.dayKey)}</p>
          <p className="font-mono text-[12.5px] font-extrabold">{formatMetric(metric, picked.value)}</p>
        </div>
      )}
      <svg viewBox={`0 0 300 ${H + 16}`} className="w-full" role="img" aria-label="내 진행 현황">
        <line x1={0} x2={300} y1={H + 0.5} y2={H + 0.5} stroke="var(--line-strong)" />
        {pace !== null && (
          <g>
            <line x1={0} x2={300} y1={y(pace)} y2={y(pace)} stroke="var(--muted)" strokeDasharray="3 3" />
            <text x={298} y={y(pace) - 3} textAnchor="end" fontSize={8.5} fill="var(--muted)">
              하루 목표 {formatMetric(metric, pace)}
            </text>
          </g>
        )}
        {days.map((d, i) => {
          const x = i * slot + (slot - bw) / 2;
          const h = d.value > 0 ? Math.max(3, H - y(d.value)) : 0;
          return (
            <g key={d.dayKey} data-testid="metric-day" onClick={() => setSel(sel === i ? null : i)} className="cursor-pointer">
              <title>{`${formatShortDay(d.dayKey)} ${formatMetric(metric, d.value)}`}</title>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && (
                <rect
                  x={x}
                  y={H - h}
                  width={bw}
                  height={h}
                  rx={Math.min(3, bw / 2)}
                  fill="var(--accent)"
                  opacity={sel === null || sel === i ? 1 : 0.45}
                />
              )}
            </g>
          );
        })}
        {days.map((d, i) =>
          i % step === 0 || i === days.length - 1 ? (
            <text
              key={d.dayKey}
              x={i === days.length - 1 ? 300 : i === 0 ? 0 : i * slot + slot / 2}
              y={H + 13}
              textAnchor={i === days.length - 1 ? "end" : i === 0 ? "start" : "middle"}
              fontSize={8.5}
              fill="var(--muted)"
            >
              {formatShortDay(d.dayKey).split("(")[0]}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
