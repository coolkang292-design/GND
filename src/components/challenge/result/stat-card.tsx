import { Icon, type IconName } from "@/components/ui/icon";
import { GoalRing } from "./goal-ring";

export type StatCardData = {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  /** `목표 30회` 또는 `기간 기록` */
  sub: string;
  /** 목표가 없는 기간 기록 카드는 null — 링을 그리지 않는다 */
  rate: number | null;
};

/** 시안 화면 A의 2×2 카드 */
export function StatCard({ s }: { s: StatCardData }) {
  return (
    <div
      data-testid="stat-card"
      className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5 shadow-card"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 truncate text-[12px] font-bold text-muted">
          <Icon name={s.icon} size={15} className="text-accent" />
          {s.label}
        </p>
        <p className="mt-1.5 font-mono text-[24px] font-black leading-none">
          {s.value}
          <span className="ml-0.5 text-[13px] font-bold">{s.unit}</span>
        </p>
        <p className="mt-1 truncate text-[11px] text-muted">{s.sub}</p>
      </div>
      {s.rate !== null && <GoalRing rate={s.rate} size={58} stroke={6} />}
    </div>
  );
}
