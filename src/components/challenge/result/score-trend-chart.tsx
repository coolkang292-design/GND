import { useId } from "react";

const W = 320;
const H = 150;
const PAD = { l: 18, r: 18, t: 44, b: 22 };

function Bubble({
  x,
  y,
  title,
  value,
  strong,
}: {
  x: number;
  y: number;
  title: string;
  value: string;
  strong: boolean;
}) {
  const w = 64;
  const bx = Math.min(W - w - 2, Math.max(2, x - w / 2));
  return (
    <g>
      <rect
        x={bx}
        y={y - 40}
        width={w}
        height={32}
        rx={8}
        fill="var(--surface-2)"
        stroke={strong ? "var(--accent)" : "var(--line-strong)"}
      />
      <text x={bx + w / 2} y={y - 28} textAnchor="middle" fontSize={8.5} fill="var(--muted)">
        {title}
      </text>
      <text
        x={bx + w / 2}
        y={y - 15}
        textAnchor="middle"
        fontSize={11.5}
        fontWeight={800}
        fill={strong ? "var(--accent)" : "var(--text)"}
        className="font-mono"
      >
        {value}
      </text>
    </g>
  );
}

/**
 * 시안 `나의 성장` — 주차 끝까지의 누적 종합점수(`myScoreTrend`).
 * 시안의 `챌린지 전`은 `챌린지 시작`(0점)으로 쓴다 — 누적 점수라 시작은 늘 0이다(D3 기본값).
 */
export function ScoreTrendChart({ points }: { points: { label: string; overall: number }[] }) {
  const gradId = useId();
  if (points.length < 2) return null;
  const top = Math.max(100, ...points.map((p) => p.overall));
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const last = points.length - 1;
  const line = points.map((p, i) => `${x(i)},${y(p.overall)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`종합점수 ${points[0].overall.toFixed(1)}점에서 ${points[last].overall.toFixed(1)}점`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity={0.35} />
          <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
      <polygon points={`${x(0)},${y(0)} ${line} ${x(last)},${y(0)}`} fill={`url(#${gradId})`} />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label} data-testid="trend-point">
          <title>{`${p.label} ${p.overall.toFixed(1)}점`}</title>
          <circle
            cx={x(i)}
            cy={y(p.overall)}
            r={i === last ? 5 : 4}
            fill={i === 0 ? "var(--text)" : "var(--accent)"}
            stroke="var(--surface)"
            strokeWidth={2}
          />
          <text x={x(i)} y={H - 5} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {p.label}
          </text>
        </g>
      ))}
      <Bubble x={x(0)} y={y(points[0].overall)} title="챌린지 시작" value={`${points[0].overall.toFixed(1)}점`} strong={false} />
      <Bubble x={x(last)} y={y(points[last].overall)} title="챌린지 후" value={`${points[last].overall.toFixed(1)}점`} strong />
    </svg>
  );
}
