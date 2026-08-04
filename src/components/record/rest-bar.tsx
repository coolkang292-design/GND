"use client";

/**
 * 세트 완료 시 뜨는 휴식 카운트다운 바 (§10).
 *
 * **±10초는 돌고 있는 휴식을 그 자리에서 옮긴다** (2026-08-04, 사용자 결정).
 * 설정값만 바꾸고 진행 중인 휴식을 그대로 두면 "10초 줄였다"가 두 가지 뜻이 된다.
 * 기존 `+30초`·`건너뛰기`는 그대로 둔다 — 쓰던 기능을 요구 없이 빼지 않는다.
 */
export function RestBar({
  remainingSeconds,
  nextUp,
  onAdjust,
  onExtend,
  onSkip,
}: {
  remainingSeconds: number;
  /**
   * 쉬는 동안 미리 보여줄 다음 진행 항목 (2026-08-04, 설계 ②).
   * `null`이면 남은 세트가 없다는 뜻 — 무엇이 다음인지는 `nextUpSet`이 정한다.
   */
  nextUp?: { exerciseName: string; setNumber: number; amount: string } | null;
  /** ±초 — 남은 시간과 설정값이 함께 움직인다 */
  onAdjust: (deltaSeconds: number) => void;
  onExtend: () => void;
  onSkip: () => void;
}) {
  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-x-3 z-30 rounded-card border border-accent bg-surface p-3 shadow-card"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
      role="timer"
      aria-label="세트 사이 휴식"
    >
      {nextUp !== undefined && (
        <p className="mb-2 truncate text-[11.5px] font-bold text-muted">
          {nextUp ? (
            <>
              다음 <span className="text-text">{nextUp.exerciseName}</span>{" "}
              {nextUp.setNumber}세트 ·{" "}
              <span className="font-mono text-accent">{nextUp.amount}</span>
            </>
          ) : (
            "마지막 세트예요 — 쉬고 나서 운동을 마무리하세요 💪"
          )}
        </p>
      )}
      <div className="flex items-center gap-2">
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-muted">세트 사이 휴식</div>
        <div className="font-mono text-xl font-extrabold text-accent">
          {mm}:{ss}
        </div>
      </div>
      <button
        onClick={() => onAdjust(-10)}
        aria-label="휴식 10초 줄이기"
        className="h-10 w-9 flex-none rounded-card-sm border border-line bg-surface-2 text-lg font-bold"
      >
        –
      </button>
      <button
        onClick={() => onAdjust(10)}
        aria-label="휴식 10초 늘리기"
        className="h-10 w-9 flex-none rounded-card-sm border border-line bg-surface-2 text-lg font-bold"
      >
        +
      </button>
      <button
        onClick={onExtend}
        className="ml-auto h-10 flex-none rounded-card-sm border border-line bg-surface-2 px-2.5 text-xs font-bold"
      >
        +30초
      </button>
      <button
        onClick={onSkip}
        className="h-10 flex-none rounded-card-sm bg-accent px-2.5 text-xs font-extrabold text-accent-ink"
      >
        건너뛰기
      </button>
      </div>
    </div>
  );
}
