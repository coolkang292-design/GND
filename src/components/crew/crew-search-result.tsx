"use client";

import {
  crewActionButton,
  type CrewSearchResult as Result,
} from "@/lib/domain/crew-link";

/** 닉네임 검색 결과 1행 — 버튼 상태는 서버가 준 relation만으로 정해진다 */
export function CrewSearchResult({
  result,
  pending,
  onAction,
}: {
  result: Result;
  pending: boolean;
  onAction: (result: Result) => void;
}) {
  const button = crewActionButton(result.relation);
  const disabled = button.disabled || pending;

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/40 text-lg">
          {result.avatarUrl ?? "👤"}
        </span>
        <span className="truncate text-[14px] font-extrabold">
          {result.nickname}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction(result)}
        className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-extrabold text-white disabled:bg-line disabled:text-muted"
      >
        {pending ? "처리 중…" : button.label}
      </button>
    </div>
  );
}
