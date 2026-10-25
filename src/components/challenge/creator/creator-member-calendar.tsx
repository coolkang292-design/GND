"use client";

import { useMemo, useState } from "react";
import { CrewCalendarMonthView } from "@/components/crew/member-workout-calendar";
import { Icon } from "@/components/ui/icon";
import { WorkoutSummary } from "@/components/feed/feed-item";
import {
  memberCalendarMonth,
  type MemberWorkoutDay,
  type MemberWorkoutSummary,
} from "@/lib/domain/creator-member-workouts";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { card } from "./creator-ui";

type Month = { year: number; month: number };
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

const toMonth = (key: string): Month => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
const monthIndex = (m: Month) => m.year * 12 + m.month;
const shift = (m: Month, d: number): Month => {
  const i = monthIndex(m) - 1 + d;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};
const num = (n: number) => n.toLocaleString("ko-KR");
const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분` : `${Math.round(m)}분`);

function dayTitle(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

function DayDetail({ day }: { day: MemberWorkoutDay }) {
  const t = day.totals;
  const chips = [
    `운동 ${t.sessions}회`,
    t.minutes !== null ? minutesText(t.minutes) : null,
    t.sets ? `${t.sets}세트` : null,
    t.volumeKg ? `볼륨 ${num(t.volumeKg)}kg` : null,
    t.distanceKm ? `${t.distanceKm}km` : null,
  ].filter(Boolean);
  return (
    // ⚠️ 틀을 더 겹치지 마라 — 카드 안 달력 상자 안 패널 안에 넣었더니 피드 블록이 좁아져
    //    "데드…"·"3,421 K"로 잘렸다(2026-10-25 미리보기). 달력 상자 폭을 그대로 쓴다.
    <div role="status" className="mt-3 border-t border-line pt-3">
      <p className="text-[14px] font-extrabold">{dayTitle(day.dayKey)}</p>
      {/* 한 번 운동한 날은 아래 피드 블록의 숫자 줄과 같아서 합계를 다시 쓰지 않는다 */}
      {t.sessions > 1 && <p className="mt-0.5 text-[12px] text-muted">{chips.join(" · ")}</p>}
      {/* 세션마다 피드 카드의 운동 요약 블록을 그대로 (사용자 지시 2026-10-25) — 숫자 줄 · 번호 목록 · +N종 더 보기 */}
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {day.sessions.map((s) => (
          <li key={s.at}>
            <p className="text-[11.5px] font-bold text-muted">{s.time} 완료</p>
            {/* 피드 블록의 좌우 여백(px-3.5)을 상쇄해 상자 폭을 다 쓴다 */}
            <div className="-mx-3.5 -mt-2">
              <WorkoutSummary item={s.feed} isMine={false} canCopy={false} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 참여자 상세의 운동 기록 (사용자 요청 2026-10-25) — **앱의 도장 달력을 그대로** 쓴다
 * (`CrewCalendarMonthView`). 날짜를 누르면 그날 한 운동과 성과가 나온다.
 * 챌린지에 반영된 세션만 보인다 — 방장이 읽는 원천이 그것뿐이다.
 */
export function CreatorMemberCalendar({
  days, summary, startDate, endDate, todayKey,
}: {
  days: readonly MemberWorkoutDay[];
  summary: MemberWorkoutSummary;
  startDate: string;
  endDate: string;
  todayKey: string;
}) {
  const ref = todayKey < endDate ? todayKey : endDate;
  const first = toMonth(startDate);
  const last = toMonth(ref);
  const [view, setView] = useState<Month>(last);
  // 처음엔 가장 최근 운동한 날을 열어 둔다 — 누르기 전에도 "무엇을 했는지"가 보인다
  const [selected, setSelected] = useState<string | null>(() => days.at(-1)?.dayKey ?? null);
  const data = useMemo(() => memberCalendarMonth(days, view.year, view.month, DEFAULT_TIMEZONE), [days, view]);
  const selectedDay = days.find((d) => d.dayKey === selected);

  return (
    <>
    <section className={`${card} p-3.5`}>
      <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
        <Icon name="calendar" size={19} className="text-accent" /> 운동 기록
      </h2>

      {summary.days > 0 ? (
        <div className="mt-2.5 rounded-card-sm bg-surface-2 p-3">
          <p className="text-[12.5px]">
            <strong>{summary.days}일</strong> 동안 <strong>{summary.sessions}번</strong> 운동했어요
            {summary.minutes !== null && <> · 총 {minutesText(summary.minutes)}</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.topExercises.map((e) => (
              <span key={e.name} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] font-bold">
                {e.name} <span className="text-accent">{e.days}일</span>
              </span>
            ))}
            {summary.volumeKg > 0 && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted">볼륨 {num(summary.volumeKg)}kg</span>
            )}
            {summary.distanceKm > 0 && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted">유산소 {summary.distanceKm}km</span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2.5 text-[12.5px] text-muted">아직 이 챌린지에 반영된 운동이 없어요.</p>
      )}
    </section>

      <CrewCalendarMonthView
        view={view}
        data={data}
        selected={selected}
        onSelect={setSelected}
        onPrevious={() => setView((m) => (monthIndex(m) > monthIndex(first) ? shift(m, -1) : m))}
        onNext={() => setView((m) => (monthIndex(m) < monthIndex(last) ? shift(m, 1) : m))}
        onToday={() => setView(last)}
        previousDisabled={monthIndex(view) <= monthIndex(first)}
        nextDisabled={monthIndex(view) >= monthIndex(last)}
        sectionClassName="-mt-1"
        labels={{
          title: "", // 카드 제목 "운동 기록"이 이미 있다
          aria: "참여자 운동 달력",
          days: "운동한 날",
          time: "운동 시간",
          empty: "이 달에 챌린지에 반영된 운동이 없어요",
          legend: "챌린지에 반영된 운동 완료일 · 날짜를 누르면 그날 운동이 보여요",
          footnote: "챌린지 기간 안의 인증된 운동만 표시돼요.",
        }}
        selectedDetail={selectedDay ? <DayDetail day={selectedDay} /> : null}
      />
    </>
  );
}
