"use client";

import type { ReactNode } from "react";

/**
 * 내역 전체보기 바텀시트 (XP·포인트 공용).
 *
 * 껍데기만 맡고 목록은 넘겨받는다. XP와 포인트는 한 줄에 보여주는 정보가
 * 달라서(XP는 획득 내역, 포인트는 불꽃 배수) 행 마크업을 공유할 수 없다.
 * 대신 각 컴포넌트가 자기 목록을 그리고 이 시트는 제목·닫기만 책임진다.
 *
 * 배지 시트(`badge-sheet.tsx`)와 같은 모양이라 사용자가 다시 배우지 않는다.
 */
export function HistorySheet({
  title,
  count,
  onClose,
  children,
}: {
  title: string;
  count: number;
  onClose: () => void;
  children: ReactNode;
}) {
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
        aria-labelledby="history-sheet-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />

        <div className="flex items-baseline justify-between">
          <h3 id="history-sheet-title" className="text-lg font-extrabold">
            {title}
          </h3>
          <p className="text-[12.5px] font-bold text-muted">{count}건</p>
        </div>

        <div className="mt-3">{children}</div>

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
