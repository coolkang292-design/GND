import { Icon, type IconName } from "@/components/ui/icon";
import { formatShortDay, type BestRecords as Records } from "@/lib/domain/challenge-report";

/** 시안 `주요 기록` 4칸 — 값이 없으면 `-`(칸은 남겨 시안 배치를 지킨다) */
export function BestRecords({ records }: { records: Records }) {
  const tiles: { icon: IconName; label: string; value: string; day: string | null }[] = [
    {
      icon: "flame",
      label: "최다 운동일",
      value: records.longestStreak > 0 ? `연속 ${records.longestStreak}일` : "-",
      day: null,
    },
    {
      icon: "clock",
      label: "최대 운동 시간(일)",
      value: records.maxMinutes ? `${Math.round(records.maxMinutes.value)}분` : "-",
      day: records.maxMinutes?.dayKey ?? null,
    },
    {
      icon: "shoe",
      label: "최대 유산소 거리(일)",
      value: records.maxCardioKm ? `${records.maxCardioKm.value.toFixed(1)}km` : "-",
      day: records.maxCardioKm?.dayKey ?? null,
    },
    {
      icon: "dumbbell",
      label: "최대 볼륨(일)",
      value: records.maxVolumeKg ? `${Math.round(records.maxVolumeKg.value).toLocaleString()}kg` : "-",
      day: records.maxVolumeKg?.dayKey ?? null,
    },
  ];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [contain:inline-size]">
      {tiles.map((t) => (
        <div
          key={t.label}
          data-testid="best-record"
          className="flex min-w-[70px] flex-1 flex-col items-center gap-1 rounded-card-sm border border-line bg-surface-2 px-1 py-3 text-center"
        >
          <Icon name={t.icon} size={22} className="text-accent" />
          <p className="text-[10.5px] leading-tight text-muted">{t.label}</p>
          <p className="font-mono text-[13px] font-extrabold">{t.value}</p>
          {t.day && <p className="text-[10px] text-faint">{formatShortDay(t.day)}</p>}
        </div>
      ))}
    </div>
  );
}
