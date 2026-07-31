"use client";

import type { PointTransactionRow } from "@/lib/points";
import { pointAmountText, pointReasonLabel } from "@/lib/domain/point-history";

function dayKst(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

/**
 * 최근 포인트 획득 내역 (최대 20건).
 *
 * XP 내역과 따로 두는 이유: 장부가 둘이다(`xp_transactions` ·
 * `point_transactions`). 합치면 운동 한 번이 XP 한 줄·포인트 한 줄로 두 번
 * 떠서 중복으로 읽힌다.
 */
export function PointHistory({ rows }: { rows: PointTransactionRow[] }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-extrabold">최근 포인트 획득</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-muted">
          아직 획득한 포인트가 없어요. 운동을 완료하거나 크루를 응원하면 받아요.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((r) => {
            const spent = r.transactionType === "spend";
            return (
              <li
                key={r.id}
                className="flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold">
                    {pointReasonLabel(r.reason)}
                  </p>
                  <p className="truncate text-[10.5px] text-faint">
                    {dayKst(r.createdAt)}
                    {/* 불꽃 배수는 운동 포인트에만 붙는다 (0032 point_multiplier) */}
                    {r.multiplier !== null && r.multiplier > 1 && (
                      <> · 🔥 ×{r.multiplier}</>
                    )}
                  </p>
                </div>
                <span
                  className={`flex-none text-[12.5px] font-extrabold ${
                    spent ? "text-muted" : "text-accent"
                  }`}
                >
                  {pointAmountText(r.amount, r.transactionType)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
