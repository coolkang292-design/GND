/** 달성률 링 — 100%를 넘으면 링은 꽉 찬 데서 멈추고 숫자는 실제 %를 말한다 */
export function GoalRing({
  rate,
  size = 72,
  stroke = 7,
}: {
  rate: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const pct = Math.round(rate * 100);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`달성률 ${pct}%`}
      className="flex-none"
    >
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(Math.max(rate, 0), 1)} ${c}`}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text
        x={mid}
        y={mid}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text)"
        fontSize={size >= 70 ? 16 : 13}
        fontWeight={800}
        className="font-mono"
      >
        {pct}%
      </text>
    </svg>
  );
}
