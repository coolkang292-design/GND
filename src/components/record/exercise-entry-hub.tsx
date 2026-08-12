"use client";

import Image from "next/image";
import { UiIcon } from "@/components/ui-icon";

export type ExerciseEntryHubProps = {
  hasPast: boolean;
  routineCount: number;
  onPrograms?: () => void;
  onSearch: () => void;
  onPast: () => void;
  onRoutine: () => void;
};

export function ExerciseEntryHub({
  hasPast,
  routineCount,
  onPrograms,
  onSearch,
  onPast,
  onRoutine,
}: ExerciseEntryHubProps) {
  /*
    이 화면은 **네 개만** 둔다 (사용자 지시 2026-08-12):
    프로그램으로 시작하기 · 운동 직접 고르기 · 지난 운동 · 내 루틴.

    ⚠️ 전신 인터벌을 여기 다시 세우지 마라. 같은 날 '운동 직접 고르기' 밑으로
       내렸다가, 다시 **'프로그램으로 시작하기' 안**으로 들어갔다
       (`ProgramCatalog`). 두 군데에 있으면 어느 쪽이 정본인지 알 수 없다.
  */
  const hasQuickStart = hasPast || routineCount > 0;

  return (
    <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto pb-1">
      <div className="space-y-2">
        {onPrograms && (
          <button
            type="button"
            data-priority="primary"
            onClick={onPrograms}
            className="group relative flex min-h-44 w-full overflow-hidden rounded-[24px] border border-accent/60 bg-bg p-5 text-left shadow-card"
          >
            <Image
              src="/program-assets/shoulder.webp"
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 60vw, 360px"
              className="object-cover object-[center_38%] transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-bg via-bg/90 to-bg/10"
            />
            <span className="relative z-10 flex min-w-0 max-w-[68%] flex-1 flex-col items-start">
              <span className="rounded-full border border-accent/55 bg-bg/75 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-accent backdrop-blur-sm">
                GND 추천
              </span>
              <span className="mt-4 block text-lg font-black leading-6 text-text">
                프로그램으로 시작하기
              </span>
              <span className="mt-1.5 block text-xs leading-5 text-muted">
                목표만 고르면 6주 계획을 달력에 자동으로 담아요
              </span>
              <span className="mt-auto pt-3 text-[11px] font-extrabold text-accent">
                주 3회 · 6주 · 총 18회
              </span>
            </span>
          </button>
        )}

        {/*
          프로그램 카드와 **같은 포맷**이다 (사용자 지시 2026-08-12) — 사진을 깔고
          왼쪽에서 그라데이션으로 덮는다.

          ⚠️ 테두리는 `border-line`으로 둔다. 크기가 같아졌으므로 위 카드의
             `border-accent`만이 "이게 먼저다"를 말한다. 여기까지 강조하면 첫 화면에
             같은 무게의 카드가 둘이 된다.
        */}
        <button
          type="button"
          data-priority="secondary"
          onClick={onSearch}
          className="group relative flex min-h-44 w-full overflow-hidden rounded-[24px] border border-line bg-bg p-5 text-left shadow-card transition-colors hover:border-accent/45 motion-reduce:transition-none"
        >
          <Image
            src="/record-assets/pick-exercises.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 60vw, 360px"
            className="object-cover object-[center_42%] transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-bg via-bg/90 to-bg/10"
          />
          <span className="relative z-10 flex min-w-0 max-w-[68%] flex-1 flex-col items-start">
            <span className="block text-lg font-black leading-6 text-text">
              운동 직접 고르기
            </span>
            <span className="mt-1.5 block text-xs leading-5 text-muted">
              검색·상황·부위별로 오늘 운동을 추가해요
            </span>
            <span className="mt-auto pt-3 text-[11px] font-extrabold text-accent">
              검색 · 상황별 · 부위별
            </span>
          </span>
        </button>

      </div>

      {hasQuickStart && (
        <section className="mt-4" aria-labelledby="quick-start-title">
          <h4
            id="quick-start-title"
            className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-muted"
          >
            빠른 시작
          </h4>
          {(hasPast || routineCount > 0) && (
            <div
              data-testid="quick-reuse-grid"
              className={`grid gap-2 ${
                hasPast && routineCount > 0 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {hasPast && (
                <button
                  type="button"
                  onClick={onPast}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold text-text"
                >
                  <UiIcon name="hub-past" size={26} />
                  지난 운동
                </button>
              )}
              {routineCount > 0 && (
                <button
                  type="button"
                  onClick={onRoutine}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold text-text"
                >
                  <UiIcon name="hub-routine" size={26} />
                  내 루틴
                </button>
              )}
            </div>
          )}

        </section>
      )}
    </div>
  );
}
