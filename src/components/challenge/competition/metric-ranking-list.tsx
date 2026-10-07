"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/ui/icon";
import { pinMine } from "@/lib/domain/challenge-metrics";

export type RankingLine = {
  userId: string;
  /** null = 기록 없음(순위 없음) */
  rank: number | null;
  /** 오른쪽 굵은 값 — `12회` · `83.2` 등, 이미 표기된 글자 */
  value: string;
  /** 값 아래 작은 줄(최종 랭킹의 `28회 · 603분`) */
  sub?: string;
};

const MEDAL: Record<1 | 2 | 3, string> = {
  1: "bg-gold text-accent-ink",
  2: "bg-silver text-accent-ink",
  3: "bg-bronze text-accent-ink",
};

/**
 * 최종 시안의 순위 목록 — 1~3위 메달, 내 줄 라임, 기록 없음 `-`.
 *
 * 참가자 2명~수십 명(사용자 지시 2026-10-07):
 *  - `limit`까지만 보여 주고, 내가 밖이면 점선 아래 **내 줄을 고정**한다(`pinMine`)
 *  - `expandable`이면 `전체 N명 보기`로 펼친다
 */
export function MetricRankingList({
  lines,
  myUserId,
  profileOf,
  limit,
  expandable = false,
}: {
  lines: readonly RankingLine[];
  myUserId: string;
  profileOf: (id: string) => { nickname: string; avatar_url: string | null } | undefined;
  limit: number;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { rows, pinned } = open ? { rows: [...lines], pinned: false } : pinMine(lines, myUserId, limit);
  return (
    <div>
      <ol className="flex flex-col gap-1">
        {rows.map((l, i) => {
          const mine = l.userId === myUserId;
          const p = profileOf(l.userId);
          const isPinned = pinned && i === rows.length - 1;
          return [
            isPinned && (
              <li key="pin-gap" aria-hidden className="mx-3 my-1 border-t border-dashed border-line-strong" />
            ),
            <li
              key={l.userId}
              data-testid="ranking-line"
              data-mine={mine || undefined}
              className={`flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 ${
                mine ? "border border-accent bg-accent-weak" : "border border-transparent"
              }`}
            >
              <span className="grid w-7 flex-none place-items-center">
                {l.rank !== null && l.rank <= 3 ? (
                  <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[12px] font-black ${MEDAL[l.rank as 1 | 2 | 3]}`}>
                    {l.rank}
                  </span>
                ) : (
                  <span className="font-mono text-[14px] font-extrabold text-muted">{l.rank ?? "-"}</span>
                )}
              </span>
              <Avatar
                src={p?.avatar_url}
                className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface-2 text-sm"
              />
              <span className={`min-w-0 flex-1 truncate text-[13.5px] font-bold ${mine ? "text-accent" : ""}`}>
                {mine ? "나" : (p?.nickname ?? "?")}
              </span>
              <span className="flex flex-col items-end">
                <span className={`font-mono text-[14px] font-extrabold ${mine ? "text-accent" : ""}`}>
                  {l.rank === null && !l.sub ? "기록 없음" : l.value}
                </span>
                {l.sub && <span className="text-[10.5px] text-muted">{l.sub}</span>}
              </span>
            </li>,
          ];
        })}
      </ol>
      {pinned && (
        <p className="sr-only">내 순위는 목록 밖이라 맨 아래에 따로 보여요</p>
      )}
      {expandable && lines.length > limit && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 flex w-full items-center justify-center gap-1 py-2 text-[12.5px] font-bold text-muted"
        >
          {open ? "접기" : `전체 ${lines.length}명 보기`}
          <Icon name="chevron" size={14} className={open ? "-rotate-90" : "rotate-90"} />
        </button>
      )}
    </div>
  );
}
