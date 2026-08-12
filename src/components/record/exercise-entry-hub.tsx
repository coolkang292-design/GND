"use client";

import Image from "next/image";
import { INTERVAL_COPY } from "@/lib/domain/tabata";

export type ExerciseEntryHubProps = {
  hasPast: boolean;
  routineCount: number;
  onPrograms?: () => void;
  onSearch: () => void;
  onPast: () => void;
  onRoutine: () => void;
  onInterval?: () => void;
};

export function ExerciseEntryHub({
  hasPast,
  routineCount,
  onPrograms,
  onSearch,
  onPast,
  onRoutine,
  onInterval,
}: ExerciseEntryHubProps) {
  const hasQuickStart = hasPast || routineCount > 0 || Boolean(onInterval);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-1">
      <div className="space-y-2">
        {onPrograms && (
          <button
            type="button"
            onClick={onPrograms}
            className="relative flex min-h-32 w-full overflow-hidden rounded-card border border-accent/55 bg-bg p-4 text-left shadow-card"
          >
            <span className="relative z-10 flex min-w-0 flex-1 flex-col items-start pr-24">
              <span className="rounded-full border border-accent/45 bg-accent/10 px-2 py-1 text-[10px] font-extrabold text-accent">
                GND 추천
              </span>
              <span className="mt-3 block text-base font-black text-text">
                프로그램으로 시작하기
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                목표만 고르면 6주 운동을 달력에 담아요
              </span>
            </span>
            <Image
              src="/record-assets/exercise-picker-hero.webp"
              alt=""
              width={132}
              height={132}
              className="absolute right-0 bottom-0 h-32 w-32 object-contain object-right-bottom"
            />
          </button>
        )}

        <button
          type="button"
          onClick={onSearch}
          className="flex min-h-24 w-full items-center gap-3 rounded-card border border-line bg-surface-2 p-4 text-left"
        >
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-accent/35 bg-bg">
            <Image
              src="/ui-icons/hub-search.webp"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-text">
              운동 직접 고르기
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted">
              검색·상황·부위별로 오늘 운동을 추가해요
            </span>
          </span>
          <span aria-hidden className="flex-none text-lg text-accent">
            ›
          </span>
        </button>
      </div>

      {hasQuickStart && (
        <section className="mt-4" aria-labelledby="quick-start-title">
          <h4
            id="quick-start-title"
            className="mb-2 text-xs font-extrabold text-muted"
          >
            빠른 시작
          </h4>
          {(hasPast || routineCount > 0) && (
            <div className="grid grid-cols-2 gap-2">
              {hasPast && (
                <button
                  type="button"
                  onClick={onPast}
                  className="min-h-11 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold text-text"
                >
                  지난 운동
                </button>
              )}
              {routineCount > 0 && (
                <button
                  type="button"
                  onClick={onRoutine}
                  className="min-h-11 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold text-text"
                >
                  내 루틴
                </button>
              )}
            </div>
          )}

          {onInterval && (
            <button
              type="button"
              onClick={onInterval}
              className="mt-2 flex min-h-16 w-full items-center gap-3 rounded-card-sm border border-line bg-surface-2 p-3 text-left"
            >
              <Image
                src="/ui-icons/hub-tabata.webp"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 flex-none object-contain"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-text">
                  {INTERVAL_COPY.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {INTERVAL_COPY.description}
                </span>
              </span>
              <span aria-hidden className="flex-none text-lg text-accent">
                ›
              </span>
            </button>
          )}
        </section>
      )}
    </div>
  );
}
