"use client";

import { intervalCueAt } from "@/lib/domain/interval-cue";
import type { TabataMinutes } from "@/lib/domain/tabata";

/**
 * 인터벌 실행 화면 (사용자 지시 2026-08-13).
 *
 * 근력용 `ActiveSessionOverlay`에 모드를 더하지 않고 **새 파일로 만들었다.**
 * 저 파일은 이미 600줄이 넘고 세트 입력·휴식 두 모드를 갖고 있다. 세 번째
 * 모드를 더하면 다루기 어려워진다 (설계 2026-08-12 §3.6).
 *
 * ## 근력과 무엇이 다른가
 *
 * **사용자가 아무것도 입력하지 않는다.** 20초가 지나면 다음 종목으로 넘어가고
 * 10초 쉬고 다시 시작한다. 음원이 끝나면 스스로 종료된다. 그래서 여기에는
 * 세트 입력칸도, ± 버튼도, 완료 체크도 없다 — 있으면 안 된다.
 *
 * 이 컴포넌트는 **그리기만 한다.** 지금이 몇 라운드인지는 `intervalCueAt`이
 * 음원 위치로 정하고, 재생·정지·기록은 부모가 한다. 화면에 계산을 두면
 * 일시정지·복귀 때마다 음악과 어긋난다.
 */
export type IntervalSessionOverlayProps = {
  open: boolean;
  /** 4종목. 순서가 라운드 순서다 */
  exerciseNames: readonly string[];
  minutes: TabataMinutes;
  /** 음원의 현재 위치(초). 부모가 `audio.currentTime`을 그대로 넘긴다 */
  elapsedSeconds: number;
  paused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
};

function clock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function IntervalSessionOverlay({
  open,
  exerciseNames,
  minutes,
  elapsedSeconds,
  paused,
  onTogglePause,
  onStop,
}: IntervalSessionOverlayProps) {
  if (!open) return null;

  const cue = intervalCueAt(elapsedSeconds, minutes);
  const nameAt = (index: number | null) =>
    index === null ? null : (exerciseNames[index] ?? null);

  const heading =
    cue.phase === "work"
      ? nameAt(cue.exerciseIndex)
      : cue.phase === "rest"
        ? "휴식"
        : cue.phase === "prep"
          ? "준비"
          : "끝났어요";
  const secondsLeft = cue.phase === "done" ? 0 : cue.secondsLeft;
  const upcoming =
    cue.phase === "work" || cue.phase === "rest" || cue.phase === "prep"
      ? nameAt(
          cue.phase === "prep" ? cue.nextExerciseIndex : cue.nextExerciseIndex,
        )
      : null;
  const roundLabel =
    cue.phase === "done"
      ? `${cue.totalRounds}라운드 완료`
      : `${Math.min(cue.round + 1, cue.totalRounds)}라운드 / ${cue.totalRounds}라운드`;

  return (
    <section
      data-testid="interval-session-overlay"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+20px)]"
    >
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/45 bg-accent/10 px-3 py-1.5 text-[11px] font-extrabold text-accent">
          <span aria-hidden>●</span> 지금 인터벌 중
        </span>
        <span
          data-testid="interval-round"
          className="text-[11px] font-bold text-muted"
        >
          {roundLabel}
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p
          data-testid="interval-phase"
          className={`text-center text-3xl font-black leading-9 ${
            cue.phase === "work" ? "text-text" : "text-muted"
          }`}
        >
          {heading}
        </p>
        <p
          data-testid="interval-countdown"
          className={`font-mono text-[4.5rem] font-black leading-none tabular-nums ${
            cue.phase === "work" ? "text-accent" : "text-text"
          }`}
        >
          {clock(secondsLeft)}
        </p>
        {upcoming && (
          <p className="text-sm font-bold text-muted">다음: {upcoming}</p>
        )}
        {paused && (
          <p role="status" className="text-xs font-bold text-warn">
            일시정지 중 — 음악도 함께 멈췄어요
          </p>
        )}
      </div>

      <ul
        aria-label="이번 회차 구성"
        className="mb-4 flex flex-wrap justify-center gap-1.5"
      >
        {exerciseNames.map((name, index) => {
          const current = cue.phase === "work" && cue.exerciseIndex === index;
          return (
            <li
              key={`${name}-${index}`}
              data-current={current ? "true" : undefined}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                current
                  ? "bg-accent text-accent-ink"
                  : "bg-surface-2 text-muted"
              }`}
            >
              {name}
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onTogglePause}
          className="min-h-12 rounded-card border border-line bg-surface text-sm font-black text-text"
        >
          {paused ? "이어서 하기" : "일시정지"}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="min-h-12 rounded-card border border-line bg-surface text-sm font-black text-warn"
        >
          중단하기
        </button>
      </div>
    </section>
  );
}
