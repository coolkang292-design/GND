"use client";

import Image from "next/image";
import {
  groupByMetric,
  type BadgeMetricKey,
  type BadgeShelfItem,
} from "@/lib/domain/badges";

const METRIC_LABEL: Record<BadgeMetricKey, string> = {
  workout_count: "운동 횟수",
  total_minutes: "총 운동 시간",
  streak_days: "불꽃",
  weight_volume_kg: "웨이트 볼륨",
  cardio_distance_m: "유산소 거리",
  record_beaten: "기록 갱신",
};

/**
 * 배지 전체 시트.
 * 미획득 배지도 비유 문구와 함께 보여준다 — "코끼리 한 마리"가 다음 목표로
 * 보여야 들어올릴 마음이 생긴다.
 */
export function BadgeSheet({
  shelf,
  onClose,
}: {
  shelf: BadgeShelfItem[];
  onClose: () => void;
}) {
  const groups = groupByMetric(shelf);
  const owned = shelf.filter((b) => b.earnedAt !== null).length;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-sheet-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-baseline justify-between">
          <h3 id="badge-sheet-title" className="text-lg font-extrabold">
            배지
          </h3>
          <p className="text-[11px] text-muted">
            {owned} / {shelf.length}
          </p>
        </div>

        {groups.map((g) => (
          <section key={g.metricKey} className="mt-4">
            <h4 className="text-[12.5px] font-extrabold text-muted">
              {METRIC_LABEL[g.metricKey]}
            </h4>
            <ul className="mt-2 flex flex-col gap-2">
              {g.items.map((b) => (
                <li key={b.key} className="flex items-center gap-3">
                  <Image
                    src={`/badges/${b.key}.png`}
                    alt=""
                    width={44}
                    height={44}
                    sizes="44px"
                    className={b.earnedAt ? "" : "opacity-30 grayscale"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">
                      {b.name}
                      {b.count > 1 && (
                        <span className="ml-1 text-accent">×{b.count}</span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {b.description}
                    </p>
                  </div>
                  <span className="flex-none text-[11px] font-bold text-faint">
                    {b.earnedAt ? `+${b.pointReward} P` : "🔒"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          닫기
        </button>
      </div>
    </>
  );
}
