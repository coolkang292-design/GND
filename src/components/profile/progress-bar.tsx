type BarState = "locked" | "active" | "earned";

const FILL: Record<BarState, string> = {
  locked: "bg-line",
  active: "bg-amber-400",
  earned: "bg-accent",
};

/** 진행바. width는 인라인 style로 % 지정(트랜지션 0.3s ease-out). */
export function ProgressBar({
  progress,
  state,
}: {
  progress: number;
  state: BarState;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${FILL[state]}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
