"use client";

/** 세트 완료 시 뜨는 휴식 카운트다운 바 — +30초 · 건너뛰기 (§10) */
export function RestBar({
  remainingSeconds,
  onExtend,
  onSkip,
}: {
  remainingSeconds: number;
  onExtend: () => void;
  onSkip: () => void;
}) {
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-x-3 z-30 flex items-center gap-3 rounded-card border border-accent bg-surface p-3 shadow-card"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
      role="timer"
      aria-label="세트 사이 휴식"
    >
      <div className="flex-1">
        <div className="text-[11px] font-bold text-muted">세트 사이 휴식</div>
        <div className="font-mono text-xl font-extrabold text-accent">
          {mm}:{ss}
        </div>
      </div>
      <button
        onClick={onExtend}
        className="h-10 rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold"
      >
        +30초
      </button>
      <button
        onClick={onSkip}
        className="h-10 rounded-card-sm bg-accent px-3 text-sm font-extrabold text-accent-ink"
      >
        건너뛰기
      </button>
    </div>
  );
}
