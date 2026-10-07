"use client";

import { useState } from "react";
import { formatShortDay, type DailyBar } from "@/lib/domain/challenge-report";

const SLOT = 10;
const BW = 3.6;
const H = 88;

/**
 * 시안 `일별 활동` — 날마다 계획(회색)·실제(라임) 막대 한 쌍 + 말풍선.
 * 높이 = 세트 수(계획 세트 / 완료 세트) — 계획과 실제가 같은 단위를 가진 유일한 값이다.
 * 말풍선 = 그날 계획 개수 · 운동 횟수(시안 `계획 1회 · 실제 1회`).
 * 처음엔 마지막 운동일이 선택돼 있다(시안처럼 말풍선이 떠 있는 상태).
 */
export function DailyActivityChart({ bars }: { bars: DailyBar[] }) {
  const lastWorked = [...bars].reverse().find((b) => b.actualCount > 0);
  const [sel, setSel] = useState<number | null>(lastWorked ? lastWorked.day - 1 : null);
  const max = Math.max(1, ...bars.flatMap((b) => [b.planSets, b.actualSets]));
  const h = (v: number, present: boolean) => (present ? Math.max(3, (v / max) * H) : 0);
  const width = Math.max(1, bars.length * SLOT);
  const picked = sel === null ? null : bars[sel];
  const left = sel === null ? 0 : Math.min(86, Math.max(14, ((sel + 0.5) / bars.length) * 100));
  const ticks = bars.filter((b) => b.day === 1 || b.day % 5 === 0 || b.day === bars.length);

  return (
    <div className="relative pt-14">
      {picked && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-[10px] border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[10.5px] leading-snug shadow-card"
          style={{ left: `${left}%` }}
        >
          <p className="font-bold">{formatShortDay(picked.dayKey)}</p>
          <p className="flex items-center gap-1 text-muted">
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-faint" />
            계획 {picked.planCount}회
          </p>
          <p className="flex items-center gap-1 text-muted">
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            실제 {picked.actualCount}회
          </p>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${H + 16}`}
        className="w-full"
        role="img"
        aria-label={`일별 활동, ${bars.filter((b) => b.actualCount > 0).length}일 운동`}
      >
        {[0.33, 0.66].map((f) => (
          <line key={f} x1={0} x2={width} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="2 3" />
        ))}
        <line x1={0} x2={width} y1={H + 0.5} y2={H + 0.5} stroke="var(--line-strong)" />
        {bars.map((b, i) => {
          const x = i * SLOT + 1.2;
          const ph = h(b.planSets, b.planCount > 0);
          const ah = h(b.actualSets, b.actualCount > 0);
          return (
            <g
              key={b.dayKey}
              data-testid="day-bar"
              onClick={() => setSel(sel === i ? null : i)}
              className="cursor-pointer"
            >
              <title>{`${formatShortDay(b.dayKey)} 계획 ${b.planCount}회 · 실제 ${b.actualCount}회`}</title>
              <rect x={i * SLOT} y={0} width={SLOT} height={H} fill="transparent" />
              {sel === i && (
                <line x1={x + BW} x2={x + BW} y1={0} y2={H} stroke="var(--line-strong)" strokeDasharray="2 2" />
              )}
              {ph > 0 && (
                <rect x={x} y={H - ph} width={BW} height={ph} rx={1.8} fill="var(--faint)" opacity={0.6} />
              )}
              {ah > 0 && (
                <rect x={x + BW + 0.6} y={H - ah} width={BW} height={ah} rx={1.8} fill="var(--accent)" />
              )}
            </g>
          );
        })}
        {ticks.map((b) => (
          <text
            key={b.day}
            x={(b.day - 1) * SLOT + SLOT / 2}
            y={H + 13}
            textAnchor="middle"
            fontSize={8}
            fill="var(--muted)"
          >
            {b.day}
          </text>
        ))}
      </svg>
    </div>
  );
}
