"use client";

import { useEffect, useRef } from "react";
import type { EffortFeedback } from "@/lib/domain/program-load";

/**
 * 세트 노력 피드백 (계획 2026-08-12).
 *
 * 첫 세트와 마지막 세트에만 뜬다(`shouldAskEffort`). 첫 세트 답은 오늘 남은
 * 세트의 무게를, 마지막 세트 답은 **다음 회차 추천**을 움직인다.
 *
 * ⚠️ **닫기는 "모름"이지 "적당함"이 아니다.** 닫았을 때 임의로 값을 넣으면
 *    다음 회차 무게가 사용자가 말한 적 없는 근거로 올라간다.
 *
 * ⚠️ **통증은 체감이 아니다.** `too_heavy`로 저장하면 "무게를 조금 낮추면 되는
 *    일"로 기록에 남는다. 통증은 멈출 신호라 별도 경로로 보낸다.
 */
const CHOICES: readonly { value: EffortFeedback; label: string }[] = [
  { value: "too_light", label: "너무 가벼움" },
  { value: "on_target", label: "적당함 · 1~2회 여유" },
  { value: "too_heavy", label: "너무 무거움 · 자세 무너짐" },
];

export function EffortFeedbackSheet({
  exerciseName,
  isLastSet,
  onAnswer,
  onClose,
  onPain,
}: {
  exerciseName: string;
  /** 오늘 이 종목의 마지막 세트였는가 — 안내 문구가 달라진다 */
  isLastSet: boolean;
  onAnswer: (feedback: EffortFeedback) => void;
  onClose: () => void;
  /** 통증 신고 — 부모가 운동 중단 안내를 연다 */
  onPain: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="effort-feedback-title"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <h3
          id="effort-feedback-title"
          className="text-center text-base font-extrabold"
        >
          {exerciseName}, 방금 세트 어땠나요?
        </h3>
        <p className="mt-1 text-center text-[11.5px] text-muted">
          {isLastSet
            ? "다음 회차 권장 무게에 반영돼요."
            : "오늘 남은 세트 무게를 맞추는 데 써요."}
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {CHOICES.map((choice, index) => (
            <button
              key={choice.value}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onAnswer(choice.value)}
              className="h-12 rounded-card border border-line bg-surface-2 text-sm font-extrabold"
            >
              {choice.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onPain}
          className="mt-3 h-11 rounded-card border border-warn/40 text-[12.5px] font-bold text-warn"
        >
          통증이 있어요
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="체감을 남기지 않고 닫기"
          className="mt-2 h-10 text-[11.5px] font-bold text-faint"
        >
          건너뛰기
        </button>
      </div>
    </>
  );
}
