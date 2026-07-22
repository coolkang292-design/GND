"use client";

import type { XpTransactionRow } from "@/lib/progression";

const REASON_LABEL: Record<string, string> = {
  workout_completed: "운동 완료",
  workout_photo: "인증 사진",
  weekly_goal: "주간 목표 달성",
  historical_backfill: "과거 기록 소급",
  level_compensation: "레벨 보정",
  admin_adjustment: "관리자 조정",
  workout_reversal: "운동 취소 회수",
};

const BREAKDOWN_LABEL: [string, string][] = [
  ["base_xp", "기본"],
  ["duration_xp", "시간"],
  ["record_xp", "기록"],
  ["photo_xp", "사진"],
  ["plan_xp", "계획"],
];

function breakdownText(metadata: Record<string, number | boolean>): string {
  const parts = BREAKDOWN_LABEL.filter(
    ([key]) => typeof metadata[key] === "number" && (metadata[key] as number) > 0,
  ).map(([key, label]) => `${label} ${metadata[key]}`);
  return parts.join(" · ");
}

function dayKst(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

/** 최근 XP 획득 내역 (최대 20건). */
export function XpHistory({ rows }: { rows: XpTransactionRow[] }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">최근 XP 획득</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-muted">
          아직 획득한 XP가 없어요. 오늘 운동을 완료하면 첫 XP를 받아요.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((r) => {
            const detail = breakdownText(r.metadata);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">
                    {REASON_LABEL[r.reason] ?? r.reason}
                    {r.metadata.is_tabata === true && (
                      <span className="ml-1.5 text-[10.5px] text-muted">
                        타바타
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10.5px] text-faint">
                    {dayKst(r.createdAt)}
                    {detail && ` · ${detail}`}
                  </p>
                </div>
                <span className="flex-none text-[12.5px] font-extrabold text-accent">
                  +{r.amount} XP
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
