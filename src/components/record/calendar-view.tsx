"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeDayStamps,
  sessionsInMonth,
  sessionsOnDay,
  summarizeMonth,
  type Verification,
} from "@/lib/domain/calendar";
import { dayKey } from "@/lib/domain/time";
import { getMyProfile } from "@/lib/crew";
import { getCompletedSessions, type CalendarSession } from "@/lib/workout";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const VERIFICATION_META: Record<
  Verification,
  { glyph: string; label: string; camera: boolean }
> = {
  camera_verified: { glyph: "🔥", label: "카메라 인증", camera: true },
  photo_uploaded: { glyph: "●", label: "사진 업로드", camera: false },
  none: { glyph: "✓", label: "완료", camera: false },
};

/** 그레고리력 월 일수 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 그 달 1일의 요일 (0=일 … 6=토) */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** instant → tz 기준 "HH:MM" */
function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function durationLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

function totalTimeLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  return `${Math.floor(min / 60)}:${pad(min % 60)}`;
}

export function CalendarView({
  userId,
  onCopySession,
}: {
  userId: string;
  /** 지난 운동 복사 (§10) — 세션의 종목·세트 구조를 오늘 draft로 */
  onCopySession?: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
  );
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const todayKey = useMemo(() => dayKey(new Date(), timeZone), [timeZone]);
  const [view, setView] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return { year: y, month: m };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profile, list] = await Promise.all([
          getMyProfile(userId),
          getCompletedSessions(userId),
        ]);
        if (cancelled) return;
        if (profile) {
          setTimeZone(profile.timezone || timeZone);
          setWeeklyGoal(profile.weekly_goal);
        }
        setSessions(list);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // timeZone 초기값은 fetch 내부에서 갱신 — 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const summary = useMemo(
    () => summarizeMonth(sessions, timeZone, view.year, view.month, weeklyGoal),
    [sessions, timeZone, view, weeklyGoal],
  );

  const stampByDate = useMemo(() => {
    const monthSessions = sessionsInMonth(
      sessions,
      timeZone,
      view.year,
      view.month,
    );
    const map = new Map<string, ReturnType<typeof computeDayStamps>[number]>();
    for (const s of computeDayStamps(monthSessions, timeZone)) {
      map.set(s.dateKey, s);
    }
    return map;
  }, [sessions, timeZone, view]);

  const selectedSessions = useMemo(
    () =>
      selectedDate ? sessionsOnDay(sessions, timeZone, selectedDate) : [],
    [selectedDate, sessions, timeZone],
  );

  function shiftMonth(delta: number) {
    setView((v) => {
      const idx = (v.year * 12 + (v.month - 1)) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }

  function goToday() {
    const [y, m] = todayKey.split("-").map(Number);
    setView({ year: y, month: m });
  }

  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (loadError) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        달력 데이터를 불러오지 못했어요. 다시 시도해 주세요.
      </p>
    );
  }

  const offset = firstWeekday(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-3.5 pb-24">
      {/* 월간 요약 */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold">
            {view.year}년 {view.month}월
          </h3>
          <div className="flex items-center gap-1 text-muted">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold"
            >
              오늘
            </button>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {summary.sessionCount}회
            </p>
            <p className="text-[11px] text-muted">이번 달 운동</p>
          </div>
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {totalTimeLabel(summary.totalDurationSeconds)}
            </p>
            <p className="text-[11px] text-muted">총 운동시간</p>
          </div>
          <div className="rounded-card bg-surface-2 py-2.5">
            <p className="font-mono text-lg font-extrabold">
              {Math.round(summary.achievementRate * 100)}%
            </p>
            <p className="text-[11px] text-muted">달성률</p>
          </div>
        </div>
      </section>

      {/* 달력 그리드 */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-0.5 text-center text-[10.5px] font-bold text-faint"
            >
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} className="aspect-square" />;
            const dateKey = `${view.year}-${pad(view.month)}-${pad(day)}`;
            const stamp = stampByDate.get(dateKey);
            const meta = stamp ? VERIFICATION_META[stamp.verification] : null;
            const isToday = dateKey === todayKey;
            return (
              <button
                key={dateKey}
                onClick={() => stamp && setSelectedDate(dateKey)}
                disabled={!stamp}
                className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[11px] border text-xs ${
                  meta?.camera
                    ? "border-accent/35 bg-accent-weak"
                    : "border-line bg-surface"
                } ${isToday ? "outline outline-2 outline-accent outline-offset-1" : ""} ${
                  stamp ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`font-mono text-[11px] ${meta?.camera ? "text-accent" : "text-muted"}`}
                >
                  {day}
                </span>
                {meta && <span className="text-[15px] leading-none">{meta.glyph}</span>}
                {stamp && stamp.count > 1 && (
                  <span className="absolute right-0.5 top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent px-0.5 font-mono text-[9px] font-extrabold text-accent-ink">
                    {stamp.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="mt-3.5 flex flex-wrap gap-2.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded border border-accent bg-accent-weak" />
            카메라 인증
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded border border-line bg-surface-2" />
            사진 업로드
          </span>
          <span className="inline-flex items-center gap-1">✓ 사진 없음</span>
        </div>
      </section>

      {sessions.length === 0 && (
        <p className="text-center text-xs text-muted">
          아직 완료한 운동이 없어요. 첫 운동을 기록하면 스탬프가 찍혀요 💪
        </p>
      )}

      {/* 날짜 상세 시트 */}
      {selectedDate && (
        <>
          <button
            aria-label="닫기"
            onClick={() => setSelectedDate(null)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-line bg-surface p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold">
                {Number(selectedDate.slice(5, 7))}월{" "}
                {Number(selectedDate.slice(8, 10))}일
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-xs font-bold text-faint"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {selectedSessions.map((s) => {
                const meta = VERIFICATION_META[s.verification];
                return (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-card border border-line bg-surface-2 p-3"
                  >
                    <span className="font-mono text-xs text-muted">
                      {timeLabel(s.completedAt, timeZone)}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">
                        {s.exerciseNames.length > 0
                          ? s.exerciseNames.join(" · ")
                          : "운동 기록"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {durationLabel(s.durationSeconds)} · {meta.glyph}{" "}
                        {meta.label}
                      </p>
                    </div>
                    {onCopySession && s.exerciseNames.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedDate(null);
                          onCopySession(s.id);
                        }}
                        className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-accent"
                      >
                        📋 복사
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {onCopySession && (
              <p className="mt-2.5 text-left text-[11px] text-muted">
                📋 복사하면 그날의 종목·세트 구조를 오늘 운동으로 불러와요.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
