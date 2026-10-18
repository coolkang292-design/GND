import type { ProgressSummary } from "@/lib/progression";

export function GrowthSummaryCard({
  summary, streakDays, workoutCount,
}: {
  summary: ProgressSummary;
  streakDays: number;
  workoutCount: number;
}) {
  return (
    <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[22px] font-black tracking-tight text-accent">
            {summary.stageName} Lv.{summary.currentLevel}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            누적 {summary.totalXp.toLocaleString()} XP
            <span className="mx-2" aria-hidden>·</span>
            운동 {workoutCount.toLocaleString()}회
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/50 bg-accent/10 px-3 py-2 text-[12px] font-extrabold text-accent">
          연속 {streakDays}일
        </span>
      </div>
    </section>
  );
}
