"use client";

import { intervalCheer } from "@/lib/domain/interval-cheer";
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
  const upcoming =
    cue.phase === "work" || cue.phase === "rest" || cue.phase === "prep"
      ? nameAt(
          cue.phase === "prep" ? cue.nextExerciseIndex : cue.nextExerciseIndex,
        )
      : null;
  const cheer = intervalCheer(cue);
  const roundLabel =
    cue.phase === "done"
      ? `${cue.totalRounds}라운드 완료`
      : `${Math.min(cue.round + 1, cue.totalRounds)}라운드 / ${cue.totalRounds}라운드`;
  /*
    마친 라운드 수. 지금 하고 있는 라운드는 **아직 안 센다** — 20초를 다 채워야
    한 라운드다. 근력의 `0 / 12 완료`와 같은 규칙이다.
  */
  const doneRounds = cue.phase === "done" ? cue.totalRounds : cue.round;
  const percent = Math.round((doneRounds / cue.totalRounds) * 100);

  return (
    <section
      data-testid="interval-session-overlay"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col bg-bg px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+20px)]"
    >
      <header>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/45 bg-accent/10 px-3 py-1.5 text-[11px] font-extrabold text-accent">
            <span aria-hidden>●</span> 지금 인터벌 중
          </span>
          <span
            data-testid="interval-round"
            className="text-[11px] font-bold text-muted"
          >
            {roundLabel}
          </span>
        </div>

        {/*
          진행률 막대 (사용자 지시 2026-08-13) — 일반 운동과 같은 모양이다.
          인터벌은 세트가 아니라 **라운드**로 센다.

          ⚠️ **`transition-[width]`를 붙이지 마라.** 근력 오버레이에서 그걸
             붙였다가 인라인 `width: 16%`가 있는데도 계산 폭이 0px에 머물러
             막대가 아예 안 보였다(2026-08-07). 단위 테스트는 `aria-valuenow`만
             보므로 화면을 봐야 잡힌다.
        */}
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="인터벌 진행률"
          className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        {/* 숫자가 빠진 자리를 종목 이름이 채운다 — 이제 이게 화면의 주인공이다 */}
        <p
          data-testid="interval-phase"
          className={`text-center text-[2rem] font-black leading-[2.25rem] ${
            cue.phase === "work" ? "text-accent" : "text-muted"
          }`}
        >
          {heading}
        </p>
        {/*
          카운트다운을 **되살렸다** (사용자 지시 2026-08-16).

          2026-08-13에는 뺐었다 — *"음원의 3·2·1 멘트와 화면 숫자가 1~2초라도
          어긋나면 그게 제일 먼저 보인다."* 그 위험은 지금도 그대로다.

          ⚠️⚠️ 그래서 **여기서 숫자를 세지 않는다.** `intervalCueAt`이 준
             `secondsLeft`를 그대로 그린다 — 그 값은 `audio.currentTime`에서
             나오고, 종목 전환을 정하는 값과 **같은 값**이다. 숫자가 화면의 다른
             요소와 어긋나는 것 자체가 불가능하다.

          ⚠️⚠️ `setInterval`·`requestAnimationFrame`으로 따로 세지 마라. 그 순간
             2026-08-13에 뺐던 이유가 그대로 돌아온다. 음원이 멈추면
             (일시정지·버퍼링) 숫자도 같이 멈춰야 하는데, 따로 세면 계속 간다.

          ⚠️ 음원 대비 절대 오프셋은 `INTERVAL_PREP_SECONDS`가 정한다. 그 상수는
             주석이 말하듯 **귀로 맞추는 값**이다. 숫자가 보이게 됐으니 이제
             어긋나면 바로 눈에 띈다 — 화면이 이르면 그 상수를 1씩 올린다.
        */}
        {cue.phase !== "done" && (
          <p
            data-testid="interval-countdown"
            aria-hidden="true"
            className={`text-center text-[5.5rem] font-black leading-none [font-variant-numeric:tabular-nums] ${
              cue.phase === "work" ? "text-accent" : "text-text"
            }`}
          >
            {cue.secondsLeft}
          </p>
        )}
        {upcoming && (
          <p className="text-base font-bold text-muted">다음: {upcoming}</p>
        )}
        {/*
          응원 문구 (사용자 지시 2026-08-13) — 종목 이름만 있으니 허전했다.
          라운드로 정해지는 순수 함수라 렌더마다 깜빡이지 않는다.
        */}
        {cheer && (
          <p
            data-testid="interval-cheer"
            className="mt-1 text-center text-[13px] leading-5 text-muted"
          >
            {cheer}
          </p>
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
              /*
                글씨를 키웠다 (사용자 지시 2026-08-16) — 11px는 운동 중에 폰을
                내려다보는 거리에서 읽히지 않았다. 지금 하는 종목은 더 굵게.
              */
              className={`rounded-full px-3.5 py-1.5 text-[15px] font-bold ${
                current
                  ? "bg-accent font-extrabold text-accent-ink"
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
