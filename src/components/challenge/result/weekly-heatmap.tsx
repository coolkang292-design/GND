import { Icon } from "@/components/ui/icon";
import type { WeekAchievement } from "@/lib/domain/challenge-report";

/** 시안 `주간 달성 히트맵` — 주마다 상자, 목표 횟수만큼 체크 원, 가로로 넘긴다 */
export function WeeklyHeatmap({ weeks }: { weeks: WeekAchievement[] }) {
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {weeks.map((w) => (
        <div
          key={w.week}
          data-testid="heat-week"
          aria-label={`${w.week}주 ${w.target}회 중 ${w.done}회${w.extra > 0 ? `, ${w.extra}회 더` : ""}`}
          className="flex-none snap-start rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
        >
          <p className="text-center text-[11px] font-bold text-muted">{w.week}주</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {Array.from({ length: w.target }, (_, i) => (
              <span
                key={i}
                data-done={i < w.done}
                className={`grid h-[22px] w-[22px] place-items-center rounded-full ${
                  i < w.done ? "bg-accent text-accent-ink" : "bg-surface-3 text-faint"
                }`}
              >
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
            ))}
            {w.extra > 0 && (
              <span className="text-[11px] font-bold text-accent">+{w.extra}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
