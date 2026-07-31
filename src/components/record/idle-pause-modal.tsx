"use client";

import { useEffect, useRef } from "react";

import { IDLE_LIMIT_SECONDS } from "@/lib/domain/idle-guard";

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * 무동작 정지 알림 (설계 2026-08-01).
 *
 * 배경을 눌러도, Esc를 눌러도 닫히지 않는다. 그냥 닫을 수 있으면 정지 자체가
 * 무의미해진다 — 반드시 [이어서 운동]이나 [운동 종료] 중 하나를 골라야 한다.
 */
export function IdlePauseModal({
  pausedSeconds,
  busy,
  onResume,
  onFinish,
}: {
  /** 지금까지 멈춰 있던 시간(초) */
  pausedSeconds: number;
  busy: boolean;
  onResume: () => void;
  onFinish: () => void;
}) {
  const resumeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-pause-title"
        aria-describedby="idle-pause-body"
        className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-card border border-warn bg-surface p-5 text-center shadow-card"
      >
        <div className="text-4xl">⏸️</div>
        <h2 id="idle-pause-title" className="mt-2 text-lg font-extrabold">
          운동 시간을 멈췄어요
        </h2>
        <p id="idle-pause-body" className="mt-1.5 text-[12.5px] leading-5 text-muted">
          {Math.round(IDLE_LIMIT_SECONDS / 60)}분 동안 아무 기록이 없어서 시간
          카운팅을 정지했어요. 멈춘 시간은 오늘 운동 시간에 포함되지 않아요.
        </p>
        <p className="mt-3 font-mono text-3xl font-extrabold text-warn">
          {formatDuration(pausedSeconds)}
        </p>
        <p className="mt-0.5 text-[11px] text-faint">멈춰 있는 시간</p>

        <button
          ref={resumeRef}
          type="button"
          onClick={onResume}
          disabled={busy}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          ▶ 이어서 운동
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={busy}
          className="mt-2 h-12 w-full rounded-card border border-line bg-surface-2 text-sm font-bold disabled:opacity-60"
        >
          {busy ? "처리 중…" : "운동 종료하고 기록"}
        </button>
      </div>
    </>
  );
}
