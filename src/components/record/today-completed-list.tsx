"use client";

import { CaptionPicker } from "@/components/feed/caption-picker";
import type { TodayCompletedSession } from "@/lib/workout";

/**
 * 기록 탭 **오늘 한 운동** 목록 (2026-11-11 사용자 지시).
 *
 * "오늘 운동한 내역을 유지하고, 그 날짜에 다른 시간에 운동을 추가해서 기록". 운동을 끝내면
 * 화면이 비워져 방금 한 운동이 사라진 것처럼 보였다. 같은 날 여러 번 한 운동을 시간순으로
 * 계속 보여 준다. 새 운동 추가는 아래 시작 카드(`RecordEmptyState`)가 맡는다.
 *
 * ⚠️ 지금 하는 운동(draft)과 섞지 않는다.
 *
 * 내가 올린 운동은 여기서 **한마디를 고칠 수 있다** (사용자 지시 2026-11-11 "내가 올린 피드는
 * 내가 수정할 수 있게"). 피드 카드와 **같은 `CaptionPicker`·같은 컬럼(`workout_sessions.title`)**
 * 이라 여기서 고치면 피드에도 그대로 반영된다 — 수정 규칙이 두 갈래로 갈라지지 않는다.
 */

/** "오전 7:20" — 사용자 시간대 기준 */
export function clockLabel(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
  return parts;
}

/** 종목명 요약 — 앞 2개 + "외 N" */
export function exerciseSummary(names: string[]): string {
  if (names.length === 0) return "운동 기록";
  const head = names.slice(0, 2).join(" · ");
  return names.length > 2 ? `${head} 외 ${names.length - 2}` : head;
}

export function TodayCompletedList({
  sessions,
  timeZone,
  onTitleChange,
  onToast,
}: {
  sessions: TodayCompletedSession[];
  timeZone: string;
  /** 한마디를 고쳤을 때 부모 상태에 반영한다. 안 주면 수정 칩을 안 그린다 */
  onTitleChange?: (sessionId: string, next: string | null) => void;
  onToast?: (message: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <section
      data-testid="today-completed-list"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <p className="text-[11.5px] font-bold text-muted">
        오늘 한 운동 · {sessions.length}회
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {sessions.map((s) => (
          <li
            key={s.id}
            data-testid="today-completed-item"
            className="py-2.5 first:pt-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold">
                  {s.title?.trim() || exerciseSummary(s.exerciseNames)}
                </p>
                {s.title?.trim() && (
                  <p className="mt-0.5 truncate text-[11.5px] text-muted">
                    {exerciseSummary(s.exerciseNames)}
                  </p>
                )}
              </div>
              <div className="flex-none text-right">
                <p className="text-[12.5px] font-bold text-accent">
                  {clockLabel(s.completedAt, timeZone)}
                </p>
                {s.durationMinutes ? (
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {s.durationMinutes}분
                  </p>
                ) : null}
              </div>
            </div>
            {onTitleChange && (
              <div className="mt-1">
                <CaptionPicker
                  sessionId={s.id}
                  caption={s.title}
                  onSaved={(next) => onTitleChange(s.id, next)}
                  onToast={onToast}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
