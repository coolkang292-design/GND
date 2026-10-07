import { Icon, type IconName } from "@/components/ui/icon";
import { METRICS, type MetricKey } from "@/lib/domain/challenge-metrics";

export type RankingKey = MetricKey | "overall";

const ICON: Record<RankingKey, IconName> = {
  overall: "trophy",
  sessions: "dumbbell",
  minutes: "clock",
  cardioKm: "shoe",
  volumeKg: "sets",
};

/**
 * 최종 시안의 지표 선택 칸 — `운동 횟수 · 운동 시간 · 유산소 거리 · 웨이트 볼륨`
 * (`withOverall`이면 맨 앞에 `종합 점수` — 종료 후, 또는 `live_ranking` 방의 진행 중).
 * 선택 = 라임 테두리. 운동 시간 집계 전(0117)이면 그 칸에 `준비 중`.
 */
export function MetricSelector({
  value,
  onChange,
  minutesAvailable,
  withOverall = false,
}: {
  value: RankingKey;
  onChange: (key: RankingKey) => void;
  minutesAvailable: boolean;
  withOverall?: boolean;
}) {
  const items: { key: RankingKey; label: string }[] = [
    ...(withOverall ? [{ key: "overall" as const, label: "종합 점수" }] : []),
    ...METRICS.map((m) => ({ key: m.key as RankingKey, label: m.label })),
  ];
  return (
    <div
      role="tablist"
      aria-label="랭킹 종목"
      className={withOverall ? "-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" : "grid grid-cols-4 gap-1.5"}
    >
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[12px] border px-1 py-2 ${
              withOverall ? "w-[74px] flex-none" : ""
            } ${on ? "border-accent bg-accent-weak text-accent" : "border-line bg-surface text-muted"}`}
          >
            <Icon name={ICON[it.key]} size={19} />
            <span className="w-full truncate text-center text-[11.5px] font-extrabold">{it.label}</span>
            {it.key === "minutes" && !minutesAvailable && (
              <span className="text-[9.5px] font-bold text-faint">준비 중</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
