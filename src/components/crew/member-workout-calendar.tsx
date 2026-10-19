"use client";

import { useEffect, useState } from "react";
import { WorkoutCompleteStamp } from "@/components/record/workout-complete-stamp";
import {
  getPublicCrewCalendarMonth,
  getMyWorkoutCalendarMonth,
  type PublicCrewCalendarMonth,
} from "@/lib/crew-calendar";
import type { DayStamp } from "@/lib/domain/calendar";

type Month = { year: number; month: number };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function currentMonth(): Month {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function shiftMonth(current: Month, delta: number): Month {
  const d = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function durationText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 조회·접근 검사는 상위 컴포넌트와 RLS가 맡고, 이 컴포넌트는 표시만 한다. */
export function CrewCalendarMonthView({
  view,
  data,
  selected,
  onSelect,
  onPrevious,
  onNext,
  onToday,
  nextDisabled,
  includePrivate = false,
}: {
  view: Month;
  data: PublicCrewCalendarMonth;
  selected: string | null;
  onSelect: (date: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  nextDisabled: boolean;
  includePrivate?: boolean;
}) {
  const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + days) / 7) * 7;
  const stamps = new Map(data.stamps.map((item) => [item.dateKey, item]));
  const selectedStamp: DayStamp | undefined = selected ? stamps.get(selected) : undefined;

  return (
    <section aria-label={includePrivate ? "내 운동 완료 캘린더" : "크루 운동 완료 캘린더"} className="mt-4 border-t border-line pt-3.5">
      <h4 className="text-sm font-extrabold">운동 완료 캘린더</h4>
      <div className="mt-2.5 rounded-card border border-line bg-surface p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h5 className="text-[14px] font-extrabold">{view.year}년 {view.month}월</h5>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="이전 달" onClick={onPrevious}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-2 text-base">‹</button>
            <button type="button" onClick={onToday}
              className="h-9 rounded-full border border-line bg-surface-2 px-2.5 text-[11px] font-bold">오늘</button>
            <button type="button" aria-label="다음 달" onClick={onNext}
              disabled={nextDisabled}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-2 text-base disabled:opacity-35">›</button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-card-sm bg-surface-2 px-2 py-2.5">
            <p className="text-lg font-extrabold">{data.workoutDays}일</p>
            <p className="text-[11px] text-muted">{includePrivate ? "운동한 날" : "공개 운동한 날"}</p>
          </div>
          <div className="rounded-card-sm bg-surface-2 px-2 py-2.5">
            <p className="text-lg font-extrabold">{durationText(data.totalDurationSeconds)}</p>
            <p className="text-[11px] text-muted">{includePrivate ? "완료 운동시간" : "공개 운동시간"}</p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="pb-1 text-center text-[10px] font-bold text-faint">
              {weekday}
            </span>
          ))}
          {Array.from({ length: cellCount }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1 || day > days) {
              return <span key={`empty-${index}`} aria-hidden="true" className="aspect-square" />;
            }
            const key = dateKey(view.year, view.month, day);
            const stamp = stamps.get(key);
            const isSelected = selected === key;
            const style = `relative flex aspect-square min-w-0 flex-col items-center justify-start overflow-hidden rounded-[9px] border pt-1 text-[10px] ${
              isSelected
                ? "border-2 border-accent bg-accent/10"
                : "border-line bg-surface-2"
            }`;
            const inner = (
              <>
                <span className={stamp ? "text-foreground" : "text-muted"}>{day}</span>
                {stamp && (
                  <WorkoutCompleteStamp
                    seed={key}
                    className="absolute bottom-[2px] left-1/2 h-[68%] w-[68%] -translate-x-1/2"
                  />
                )}
              </>
            );
            return stamp ? (
              <button type="button" key={key}
                aria-label={`${view.month}월 ${day}일, 운동 완료 ${stamp.count}회`}
                aria-pressed={isSelected}
                onClick={() => onSelect(key)}
                className={style}>{inner}</button>
            ) : (
              <span key={key} aria-label={`${view.month}월 ${day}일, 공개 운동 없음`}
                className={style}>{inner}</span>
            );
          })}
        </div>

        {selectedStamp && (
          <div role="status" className="mt-3 rounded-card-sm bg-surface-2 px-3 py-2 text-[12px]">
            <strong>{Number(selected?.slice(5, 7))}월 {Number(selected?.slice(8, 10))}일</strong>
            <span className="ml-2 text-muted">
              운동 {selectedStamp.count}회 · {durationText(selectedStamp.totalDurationSeconds)}
            </span>
          </div>
        )}
        {data.workoutDays === 0 && (
          <p className="mt-3 text-center text-[11.5px] text-muted">
            {includePrivate ? "이 달에 완료한 운동이 없어요" : "이 달에 크루에게 공개된 완료 운동이 없어요"}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <WorkoutCompleteStamp seed="crew-calendar-legend" className="h-6 w-6 flex-none" />
          <span>{includePrivate ? "내 운동 완료일 (비공개 포함)" : "크루에게 공개된 운동 완료일"}</span>
        </div>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
        {includePrivate
          ? "본인에게는 공개·비공개 완료 운동이 모두 표시됩니다."
          : "공개한 완료 운동만 표시됩니다. 누적 성과에는 비공개 운동이 포함될 수 있어요."}
      </p>
    </section>
  );
}

/** 크루 프로필용 읽기 전용 달력. 계획 작성/수정 UI 및 데이터를 가져오지 않는다. */
export function MemberWorkoutCalendar({ userId, includePrivate = false }: { userId: string; includePrivate?: boolean }) {
  const [view, setView] = useState<Month>(currentMonth);
  const [result, setResult] = useState<{
    key: string;
    data?: PublicCrewCalendarMonth;
    error?: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<{ key: string; day: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${userId}:${view.year}-${view.month}:${includePrivate ? "self" : "crew"}`;

  useEffect(() => {
    let cancelled = false;
    void (includePrivate ? getMyWorkoutCalendarMonth : getPublicCrewCalendarMonth)(userId, view.year, view.month)
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch((error: unknown) => {
        console.warn("[crew-calendar] 공개 운동 조회 실패", error);
        if (!cancelled) setResult({ key, error: true });
      });
    return () => { cancelled = true; };
  }, [userId, view.year, view.month, includePrivate, key, retry]);

  const visible = result?.key === key ? result : null;
  const now = currentMonth();
  const nextDisabled = view.year > now.year ||
    (view.year === now.year && view.month >= now.month);

  if (!visible?.data) {
    return (
      <section aria-label={includePrivate ? "내 운동 완료 캘린더" : "크루 운동 완료 캘린더"} className="mt-4 border-t border-line pt-3.5">
        <h4 className="text-sm font-extrabold">운동 완료 캘린더</h4>
        {visible?.error ? (
          <div className="mt-3 text-[12px] text-muted">
            {includePrivate ? "운동 기록을 불러오지 못했어요." : "공개 운동 기록을 불러오지 못했어요."}
            <button type="button" className="ml-2 text-accent underline"
              onClick={() => setRetry((n) => n + 1)}>다시 시도</button>
          </div>
        ) : (
          <p aria-busy="true" className="mt-3 text-[12px] text-muted">운동 기록 불러오는 중…</p>
        )}
      </section>
    );
  }

  return (
    <CrewCalendarMonthView
      view={view}
      data={visible.data}
      selected={selected?.key === key ? selected.day : null}
      onSelect={(day) => setSelected({ key, day })}
      onPrevious={() => setView((month) => shiftMonth(month, -1))}
      onNext={() => { if (!nextDisabled) setView((month) => shiftMonth(month, 1)); }}
      onToday={() => setView(currentMonth())}
      nextDisabled={nextDisabled}
      includePrivate={includePrivate}
    />
  );
}
