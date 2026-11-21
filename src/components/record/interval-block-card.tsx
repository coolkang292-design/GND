"use client";

import { Icon } from "@/components/ui/icon";
import { INTERVAL_COPY, tabataRepsForMinutes, type TabataMinutes } from "@/lib/domain/tabata";

/**
 * 운동 목록 안의 **인터벌 덩어리** 카드 (설계 2026-11-22).
 *
 * 인터벌 4종목은 목록에서 카드 4장이 아니라 **이 카드 한 장**으로 보인다. 인터벌은 음악을 따라
 * 자동으로 진행되고, 종목별로 세트를 누르지 않기 때문이다. 그래서 이 카드에는 세트 입력이 없다.
 *
 * 세 가지 모양:
 * - 시작 전: 위·아래로 순서를 옮기고, 뺀다. (`onMoveUp`·`onMoveDown`·`onRemove`)
 * - 운동 중 · 내 차례: `인터벌 시작` 버튼 하나. (`onStart`)
 * - 끝남: 완료 표시.
 *
 * ⚠️ 시작한 뒤에는 순서를 옮기지도 빼지도 못한다 — 부르는 쪽이 `onMove*`·`onRemove`를 **안 넘긴다.**
 *    (저장되는 시작 위치가 이미 정해졌다. `tabata.ts`의 "인터벌 블록 위치" 주석.)
 */
export function IntervalBlockCard({
  minutes,
  names,
  done,
  onStart,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  minutes: TabataMinutes;
  /** 블록 4종목의 이름 */
  names: readonly string[];
  done: boolean;
  /** 운동 중이고 인터벌 차례일 때만 넘긴다 */
  onStart?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
}) {
  return (
    <section
      data-testid="interval-block-card"
      data-done={done ? "true" : "false"}
      className="rounded-card border border-accent/50 bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold">
            <Icon name="interval" size={17} className="text-accent" />
            {INTERVAL_COPY.blockCardTitle(minutes)}
            {done && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-ink">
                {INTERVAL_COPY.blockCardDone}
              </span>
            )}
          </p>
          <p className="mt-1 break-words text-[12.5px] font-bold text-muted">
            {names.join(" · ")}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            음악에 맞춰 20초 운동 · 10초 휴식 · 종목마다 {tabataRepsForMinutes(minutes)}회로 기록돼요
          </p>
        </div>

        {(onMoveUp || onMoveDown || onRemove) && (
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              aria-label={`인터벌 ${INTERVAL_COPY.blockMoveUp}`}
              title={INTERVAL_COPY.blockMoveUp}
              disabled={!onMoveUp}
              onClick={onMoveUp}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-extrabold text-muted disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`인터벌 ${INTERVAL_COPY.blockMoveDown}`}
              title={INTERVAL_COPY.blockMoveDown}
              disabled={!onMoveDown}
              onClick={onMoveDown}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm font-extrabold text-muted disabled:opacity-30"
            >
              ↓
            </button>
            {onRemove && (
              <button
                type="button"
                aria-label={INTERVAL_COPY.blockRemove}
                title={INTERVAL_COPY.blockRemove}
                onClick={onRemove}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-faint"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {onStart && !done && (
        <button
          type="button"
          data-testid="interval-block-start"
          onClick={onStart}
          className="mt-3 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          {INTERVAL_COPY.blockCardStart}
        </button>
      )}
    </section>
  );
}
