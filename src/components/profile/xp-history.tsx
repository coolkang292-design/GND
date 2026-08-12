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

/** 섹션에 바로 보여주는 줄 수. 나머지는 전체보기 시트에서 본다. */
const PREVIEW_COUNT = 5;

/**
 * XP 내역 목록. 섹션(5건)과 전체보기 시트(전체)가 같은 마크업을 쓴다.
 * 따로 만들면 한쪽만 고쳐져 두 화면이 달라진다.
 */
export function XpHistoryList({ rows }: { rows: XpTransactionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-[11.5px] text-muted">
        아직 획득한 XP가 없어요. 오늘 운동을 완료하면 첫 XP를 받아요.
      </p>
    );
  }
  return (
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
                        전신 인터벌
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
  );
}

/**
 * 최근 XP 획득 — 5건만 보여주고 나머지는 전체보기로.
 *
 * XP는 레벨을 올리는 값이고 포인트는 쓰는 값이다. 두 섹션이 나란히 있어
 * 헷갈리기 쉬워서 한 줄 설명을 붙였다.
 */
export function XpHistory({
  rows,
  onOpenAll,
}: {
  rows: XpTransactionRow[];
  onOpenAll: () => void;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-extrabold">최근 XP 획득</h2>
        {rows.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={onOpenAll}
            className="flex-none text-[11.5px] font-bold text-accent"
          >
            {rows.length}건 · 전체 보기 ›
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[10.5px] text-faint">
        XP는 레벨과 캐릭터 단계를 올려요
      </p>

      <XpHistoryList rows={rows.slice(0, PREVIEW_COUNT)} />
    </section>
  );
}
