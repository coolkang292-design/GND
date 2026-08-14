"use client";

import Image from "next/image";
import { UiIcon } from "@/components/ui-icon";
import {
  categoryCompletion,
  overallCompletion,
  toDisplayUnit,
  toRemainingDisplay,
  type Achievement,
} from "@/lib/domain/achievements";
import type { BadgeMetricKey } from "@/lib/domain/badges";
// ⚠️ 날짜 포맷을 새로 짜지 마라. `formatMonthDay`는 `"YYYY-MM-DD"` 문자열만 받고,
//    `Date`를 `toLocaleDateString`에 그대로 넣으면 기기 타임존에 따라 하루가
//    밀린다. `dayKey`로 KST 날짜를 먼저 정하고 넘긴다.
import { formatMonthDay } from "@/lib/domain/challenge-time";
import { dayKey } from "@/lib/domain/time";
import { ProgressBar } from "./progress-bar";
import { RarityPill } from "./rarity-pill";

const METRIC_LABEL: Record<BadgeMetricKey, string> = {
  workout_count: "운동 횟수",
  total_minutes: "운동 시간",
  streak_days: "불꽃",
  weight_volume_kg: "웨이트 볼륨",
  cardio_distance_m: "유산소 거리",
  record_beaten: "기록 갱신",
};

function AchievementRow({ a }: { a: Achievement }) {
  const cur = toDisplayUnit(a.metricKey, a.currentValue);
  const tgt = toDisplayUnit(a.metricKey, a.targetValue);
  const rem = toRemainingDisplay(a.metricKey, a.remainingValue);
  const state = a.unlocked ? "earned" : a.progress > 0 ? "active" : "locked";
  return (
    <li className="rounded-card-sm border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-3">
        <Image
          src={`/badges/${a.key}.png`}
          alt=""
          width={44}
          height={44}
          sizes="44px"
          className={a.unlocked ? "flex-none" : "flex-none opacity-30 grayscale"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-extrabold">{a.title}</p>
            {a.count > 1 && <span className="text-[11px] font-bold text-accent">×{a.count}</span>}
          </div>
          <p className="truncate text-[11px] text-muted">{a.description}</p>
        </div>
        <RarityPill rarity={a.rarity} />
      </div>

      <div className="mt-2.5">
        <ProgressBar progress={a.progress} state={state} />
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[11.5px] font-bold">
            {cur.amount} / {tgt.amount}{tgt.unit}
          </span>
          {a.unlocked ? (
            /* 0077: 딴 날짜를 포인트 왼쪽에 붙인다. **새 줄을 만들지 않는다** —
               이 행은 이미 4단(그림·이름·희귀도·진행)이라 줄을 더하면 시트가
               길어져 스크롤이 늘고, 미획득 행과 높이가 어긋난다.
               ⚠️ 반복 횟수(`×N`)를 여기 또 넣지 마라 — 위쪽 배지 이름 옆에
                  이미 그려진다. 두 곳에 적으면 같은 정보가 한 행에 두 번 뜬다. */
            <span className="inline-flex items-baseline gap-1.5 text-[11px]">
              {a.earnedAt && (
                <span className="font-bold text-faint">
                  {formatMonthDay(dayKey(a.earnedAt, "Asia/Seoul"))} 획득
                </span>
              )}
              <span className="font-extrabold text-accent">+{a.rewardPoint} P</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              {/* 옛 표기는 `🔒`였다 (2026-08-07 2차 시안으로 교체) */}
              <UiIcon name="lock" size={13} />앞으로 {rem.amount}
              {rem.unit} · +{a.rewardPoint} P
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** 배지 전체 시트 = 퀘스트 화면. 완료율·카테고리·배지별 진행. */
export function BadgeSheet({
  achievements,
  onClose,
}: {
  achievements: Achievement[];
  onClose: () => void;
}) {
  const overall = overallCompletion(achievements);
  const cats = categoryCompletion(achievements);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-sheet-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-baseline justify-between">
          <h3 id="badge-sheet-title" className="text-lg font-extrabold">업적</h3>
          <p className="text-[12.5px] font-bold">
            {overall.done} / {overall.total}
            <span className="ml-1.5 text-muted">{overall.pct}%</span>
          </p>
        </div>
        <div className="mt-2">
          <ProgressBar progress={overall.total ? overall.done / overall.total : 0} state="active" />
        </div>

        {cats.map((c) => {
          const items = achievements.filter((a) => a.metricKey === c.metricKey);
          return (
            <section key={c.metricKey} className="mt-5">
              <div className="flex items-baseline justify-between">
                <h4 className="text-[12.5px] font-extrabold">{METRIC_LABEL[c.metricKey]}</h4>
                <p className="text-[11px] text-muted">{c.done} / {c.total} · {c.pct}%</p>
              </div>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((a) => (
                  <AchievementRow key={a.key} a={a} />
                ))}
              </ul>
            </section>
          );
        })}

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
