"use client";

import { Icon } from "@/components/ui/icon";
import { ExerciseThumbTile } from "./exercise-thumb";

export type QuestPreviewItem = {
  name: string;
  /** `3세트` · `4분 인터벌` 같은 한마디 */
  detail?: string;
  /** 카탈로그 운동 ID — 있으면 그림을 그린다 */
  imageId?: string;
};

/** 가로로 보여 줄 운동 수 — 넘으면 `+N종 더보기` 칸이 마지막에 선다 */
const SHOWN = 3;

/**
 * 오늘의 운동 카드 (시안 2026-11-07) — 그림 있는 운동 칸을 가로로, 그 아래 큰 시작 버튼.
 *
 * 글자를 줄이려고 **설명 대신 그림**을 쓴다. 칸은 운동 그림 · 이름 · `N세트`뿐이다.
 * `더보기`는 부르는 쪽이 정한 곳(계획 화면)으로 보낸다.
 */
export function QuestTodayCard({
  items,
  onMore,
  children,
}: {
  items: QuestPreviewItem[];
  onMore?: () => void;
  /** 카드 아래에 놓을 큰 시작 버튼 */
  children?: React.ReactNode;
}) {
  const shown = items.slice(0, SHOWN);
  const rest = items.length - shown.length;
  return (
    <div
      data-testid="quest-today-card"
      className="rounded-card border border-line-strong bg-surface p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[17px] font-black">
          <Icon name="calendar" size={20} className="text-accent" />
          오늘의 운동
          <span className="text-[14px] font-bold text-muted">({items.length}종)</span>
        </h3>
      </div>
      <ul className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
        {shown.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="flex w-[104px] flex-none flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface-2/70 px-2 py-3 text-center"
          >
            <ExerciseThumbTile id={item.imageId} name={item.name} size={72} />
            <span className="line-clamp-2 min-h-[2.5em] text-[14px] font-bold leading-tight break-keep">
              {item.name}
            </span>
            {item.detail && (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-[12.5px] font-bold text-muted">
                {item.detail}
              </span>
            )}
          </li>
        ))}
        {rest > 0 && (
          <li className="flex w-[84px] flex-none">
            <button
              type="button"
              onClick={onMore}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface-2/70 text-center"
            >
              <span className="text-[16px] font-black">+{rest}종</span>
              <span className="text-[13px] text-muted">더보기 ›</span>
            </button>
          </li>
        )}
      </ul>
      {children}
    </div>
  );
}
