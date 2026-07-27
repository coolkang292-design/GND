"use client";

/**
 * 포인트 요약 3칸 — 잔액 · 불꽃 배수 · 불꽃 일수.
 *
 * ⚠️ 배수 구간은 SQL `point_multiplier`(0032)와 **같은 값**이어야 한다.
 * 어긋나면 화면이 안내한 배수와 실제 지급액이 달라진다.
 */
const TIERS: { min: number; label: string }[] = [
  { min: 25, label: "×4" },
  { min: 15, label: "×3" },
  { min: 10, label: "×2" },
  { min: 5, label: "×1.5" },
  { min: 0, label: "×1" },
];

export function multiplierFor(streakDays: number): {
  label: string;
  daysToNext: number | null;
} {
  const tier = TIERS.find((t) => streakDays >= t.min)!;
  // 나보다 높은 구간 중 가장 가까운 것
  const next = [...TIERS].reverse().find((t) => t.min > streakDays);
  return {
    label: tier.label,
    daysToNext: next ? next.min - streakDays : null,
  };
}

export function PointSummary({
  balance,
  streakDays,
}: {
  balance: number;
  streakDays: number;
}) {
  const { label, daysToNext } = multiplierFor(streakDays);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-extrabold text-accent">
            {balance.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">GND 포인트</p>
        </div>
        <div className="border-x border-line">
          <p className="text-lg font-extrabold text-accent">⚡{label}</p>
          <p className="mt-0.5 text-[11px] text-muted">포인트 배수</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-accent">🔥{streakDays}일</p>
          <p className="mt-0.5 text-[11px] text-muted">연속</p>
        </div>
      </div>

      {daysToNext !== null && (
        <p className="mt-2.5 text-center text-[11px] text-faint">
          {daysToNext}일 더 이어가면 배수가 올라가요
        </p>
      )}
    </section>
  );
}
