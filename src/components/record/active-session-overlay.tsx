"use client";

import type { ReactNode } from "react";

/**
 * 운동 중 큰 팝업 (2026-08-04, 설계 ② · 사용자 승인).
 *
 * 운동을 시작하면 풀스크린으로 전환해 **지금 하는 세션에만 집중**하게 한다.
 *
 * ⚠️ **닫기는 종료가 아니라 최소화다.** 달력을 보거나 종목을 추가하려면 나갈 수
 * 있어야 하는데, 닫기를 종료로 만들면 오조작 한 번이 세션을 날린다. 종료는
 * 별도 버튼이고 기존 `handleFinish`(미완료 세트 확인 포함)를 그대로 탄다.
 *
 * ⚠️ **z-20에 머문다.** 휴식 바(z-30)·운동 추가 시트(z-40/50)·무동작 정지
 * 모달(z-50)이 이 위에 떠야 한다. 값을 올리면 카운트다운이 팝업 뒤로 숨는다.
 *
 * ⚠️ **열림 여부는 부모가 `active`에서 파생한다.** 여기에 상태를 두거나
 * localStorage에 저장하지 않는다 — draft 버전을 올리지 않고도 새로고침 복구가
 * 지금 그대로 동작해야 한다.
 */
export function ActiveSessionOverlay({
  open,
  elapsedLabel,
  volumeKg,
  completedSetCount,
  paused,
  busy,
  position,
  currentName,
  onPrev,
  onNext,
  onMinimize,
  onFinish,
  onCancel,
  children,
}: {
  open: boolean;
  elapsedLabel: string;
  volumeKg: number;
  completedSetCount: number;
  paused: boolean;
  busy: boolean;
  /** 지금 몇 번째 종목인가 — 한 종목만 보이므로 위치를 알려 줘야 한다 */
  position: { index: number; total: number };
  currentName: string | null;
  onPrev: () => void;
  onNext: () => void;
  onMinimize: () => void;
  onFinish: () => void;
  onCancel: () => void;
  /** **지금 종목의 입력 카드 하나** — `ExerciseCard`를 그대로 재사용한다 */
  children: ReactNode;
}) {
  if (!open) return null;

  const showNav = position.total > 1;

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-bg">
      <header className="mx-auto w-full max-w-[520px] flex-none border-b border-line bg-surface px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`text-[11px] font-extrabold ${
                paused ? "text-warn" : "text-accent"
              }`}
            >
              {paused ? "⏸ 정지됨 — 무동작" : "운동 중"}
            </p>
            <p
              className={`mt-0.5 font-mono text-3xl leading-none font-extrabold ${
                paused ? "text-muted" : ""
              }`}
            >
              {elapsedLabel}
            </p>
          </div>
          <div className="flex-none text-right">
            <p className="text-[11px] text-muted">완료 볼륨</p>
            <p className="font-mono text-2xl leading-tight font-extrabold">
              {volumeKg.toLocaleString()}
              <span className="text-[13px]">kg</span>
            </p>
            <p className="text-[11px] text-muted">완료 {completedSetCount}세트</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onMinimize}
            aria-label="운동 화면 최소화"
            className="h-9 flex-1 rounded-card-sm border border-line bg-surface-2 text-xs font-bold text-muted"
          >
            ▾ 최소화
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 flex-none rounded-card-sm px-3 text-xs font-bold text-faint disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </header>

      {/*
        한 종목만 보여주므로 **나머지로 갈 길**이 반드시 있어야 한다
        (2026-08-04 사용자 지적). 없으면 담아 둔 2·3번 종목에 영영 못 간다.
      */}
      {currentName !== null && (
        <div className="mx-auto flex w-full max-w-[520px] flex-none items-center gap-2 border-b border-line bg-surface px-4 py-2">
          {showNav && (
            <button
              type="button"
              onClick={onPrev}
              disabled={position.index === 0}
              aria-label="이전 종목"
              className="grid h-9 w-9 flex-none place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold disabled:opacity-30"
            >
              ‹
            </button>
          )}
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-extrabold">{currentName}</p>
            {showNav && (
              <p className="font-mono text-[11px] text-muted">
                {position.index + 1} / {position.total}
              </p>
            )}
          </div>
          {showNav && (
            <button
              type="button"
              onClick={onNext}
              disabled={position.index >= position.total - 1}
              aria-label="다음 종목"
              className="grid h-9 w-9 flex-none place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold disabled:opacity-30"
            >
              ›
            </button>
          )}
        </div>
      )}

      <div className="mx-auto min-h-0 w-full max-w-[520px] flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3 pb-40">{children}</div>
      </div>

      <div
        className="mx-auto w-full max-w-[520px] flex-none border-t border-line bg-surface px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <button
          type="button"
          onClick={onFinish}
          disabled={busy}
          className="h-12 w-full rounded-card bg-good text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "처리 중…" : "운동 종료"}
        </button>
      </div>
    </div>
  );
}
