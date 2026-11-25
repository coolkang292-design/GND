"use client";

import { Icon } from "@/components/ui/icon";
import { questNamesLine } from "@/lib/domain/daily-quest";

/**
 * "내 방법으로 시작"한 날에 **달력에 오늘 계획이 있다**고 알리는 한 줄 (사용자 결정 2026-11-26).
 *
 * 내 방법 날은 퀘스트·계획과 분리한다(사용자 지시 2026-11-07) — 그래서 계획을 목록에 다시 채우지
 * 않는다. 그 대신 계획이 있다는 사실은 숨기지 않는다: 안 보이면 달력에만 "예정"이 남고, 사용자는
 * 퀘스트와 달력이 다르다고 느낀다. 누르면 그 계획으로 바꾼다(부르는 쪽이 정한다).
 */
export function TodayPlanNotice({
  names,
  onStart,
  disabled = false,
}: {
  /** 계획 종목 이름 — 3개까지 보이고 넘으면 "외 N" */
  names: string[];
  onStart: () => void;
  disabled?: boolean;
}) {
  const line = questNamesLine(names);
  return (
    <button
      type="button"
      data-testid="today-plan-notice"
      disabled={disabled}
      onClick={onStart}
      className="flex w-full items-center gap-3 rounded-card border border-accent/45 bg-surface px-4 py-3 text-left shadow-card disabled:opacity-60"
    >
      <Icon name="calendar" size={20} className="flex-none text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-extrabold">달력에 오늘 계획이 있어요</span>
        {line && (
          <span className="mt-0.5 block truncate text-[13px] text-muted">{line}</span>
        )}
      </span>
      <span className="flex-none text-[13.5px] font-black text-accent">계획으로 시작 ›</span>
    </button>
  );
}
