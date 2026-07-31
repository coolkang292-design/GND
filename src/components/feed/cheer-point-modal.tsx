"use client";

import { useEffect, useRef } from "react";

/**
 * 응원 포인트 획득 팝업.
 *
 * 토스트만으로는 "받았는지" 확인이 안 된다는 사용자 피드백에서 나왔다. 운동
 * 완료의 XpResultModal과 같은 자리·같은 모양이라 익숙하게 읽힌다.
 *
 * **지급됐을 때만 띄운다.** 하루 1회 상한에 걸린 0P 응원은 지금처럼 작은
 * 토스트로 지나간다 — 같은 사람에게 여러 번 응원할 때마다 팝업이 뜨면
 * 거슬린다.
 */
export function CheerPointModal({
  points,
  nickname,
  onClose,
}: {
  points: number;
  nickname: string;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheer-point-title"
        className="fixed inset-x-8 top-1/2 z-50 -translate-y-1/2 rounded-card border border-line bg-surface p-6 text-center shadow-card"
      >
        <div className="text-4xl">📣</div>

        <h2 id="cheer-point-title" className="mt-2 text-base font-extrabold">
          응원을 보냈어요!
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">
          {nickname}님이 힘을 얻었어요
        </p>

        <p className="mt-4 font-mono text-[32px] leading-none font-extrabold text-accent">
          +{points} P
        </p>
        <p className="mt-1.5 text-[11px] text-faint">
          같은 크루원에게는 하루 한 번만 받아요
        </p>

        <button
          ref={buttonRef}
          type="button"
          onClick={onClose}
          className="mt-5 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          확인
        </button>
      </div>
    </>
  );
}
