import Image from "next/image";
import { toDisplayUnit, type Achievement } from "@/lib/domain/achievements";
import { ProgressBar } from "./progress-bar";

/** 최상단 "다음 목표" 카드 — 열자마자 한 번 더 하게 만드는 핵심. */
export function NextGoalCard({ goal }: { goal: Achievement | null }) {
  if (!goal) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <p className="text-[11px] font-extrabold text-accent">다음 목표</p>
        <p className="mt-1 text-sm font-bold">모든 목표를 달성했어요 🎉</p>
      </section>
    );
  }
  const cur = toDisplayUnit(goal.metricKey, goal.currentValue);
  const tgt = toDisplayUnit(goal.metricKey, goal.targetValue);
  const rem = toDisplayUnit(goal.metricKey, goal.remainingValue);
  return (
    <section className="rounded-card border border-accent/40 bg-accent-weak p-4 shadow-card">
      <p className="text-[11px] font-extrabold text-accent">다음 목표</p>
      <div className="mt-2 flex items-center gap-3">
        <Image src={`/badges/${goal.key}.png`} alt="" width={48} height={48} sizes="48px" className="flex-none opacity-40 grayscale" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">{goal.title}</p>
          <p className="text-[11.5px] text-muted">{goal.description}</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar progress={goal.progress} state="active" />
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[12.5px] font-bold">
            {cur.amount} / {tgt.amount}{tgt.unit}
          </span>
          <span className="text-[11.5px] text-muted">
            앞으로 {rem.amount}{rem.unit}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
        <span className="text-[11px] text-muted">획득 보상</span>
        <span className="text-sm font-extrabold text-accent">+{goal.rewardPoint} P</span>
      </div>
    </section>
  );
}
