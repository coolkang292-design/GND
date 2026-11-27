"use client";

import { useEffect, useRef, useState } from "react";
import { FULL_SCREEN_BACK_EVENT } from "./full-screen-flow";

/**
 * 루틴 불러오기 — 교체할지 추가할지 묻는 시트 (2026-11-27, 작업지시서 TASK 05).
 *
 * 묻는 때는 `decideRoutineLoad`가 정한다(`ask`) — 사용자가 직접 담은 목록·달력 계획에 묶인
 * 목록이 있을 때만이다. 빈 목록·퀘스트 제안뿐이면 묻지 않고 바로 교체한다.
 *
 * 기본 선택은 **그대로 불러오기**다. 루틴을 부르는 사람이 바라는 것은 "그 설계도대로"이고,
 * 추가는 예전 동작(이름이 겹치면 지금 목록 값이 남는다)이라 안내를 붙인다.
 */
export type RoutineLoadChoice = "replace" | "add";

export function RoutineLoadSheet({
  routineName,
  onConfirm,
  onCancel,
}: {
  /** null이면 안 뜬다 */
  routineName: string | null;
  onConfirm: (choice: RoutineLoadChoice) => void;
  onCancel: () => void;
}) {
  if (routineName === null) return null;
  // 닫히면 몸체가 내려가므로 열릴 때마다 선택이 기본값('그대로')부터 시작한다
  return <SheetBody routineName={routineName} onConfirm={onConfirm} onCancel={onCancel} />;
}

function SheetBody({
  routineName,
  onConfirm,
  onCancel,
}: {
  routineName: string;
  onConfirm: (choice: RoutineLoadChoice) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<RoutineLoadChoice>("replace");
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus({ preventScroll: true });
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancel();
      } else if (event.key === "Tab" && dialog) {
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keyDown);
    window.addEventListener(FULL_SCREEN_BACK_EVENT, onCancel);
    return () => {
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener(FULL_SCREEN_BACK_EVENT, onCancel);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onCancel]);

  const options: { value: RoutineLoadChoice; title: string; body: string }[] = [
    {
      value: "replace",
      title: "저장된 루틴 그대로 불러오기",
      body: "현재 준비 목록을 선택한 루틴으로 교체해요.",
    },
    {
      value: "add",
      title: "현재 목록에 추가하기",
      body: "기존 운동을 유지하고 새로운 운동만 추가해요.",
    },
  ];

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onCancel}
        className="fixed inset-0 z-[60] bg-black/40"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="루틴 불러오기"
        className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 className="text-base font-extrabold">루틴 불러오기</h3>
        <p className="mt-1 text-[12.5px] text-muted">&lsquo;{routineName}&rsquo;</p>

        <div role="radiogroup" className="mt-3 flex flex-col gap-2">
          {options.map((option) => {
            const selected = choice === option.value;
            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(option.value)}
                className={`flex items-start gap-3 rounded-card border p-3 text-left ${
                  selected ? "border-accent bg-accent/10" : "border-line"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                    selected ? "border-accent bg-accent" : "border-line"
                  }`}
                />
                <span>
                  <span className="block text-sm font-extrabold">{option.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{option.body}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          오늘 운동을 수정해도 저장된 루틴은 변경되지 않아요.
        </p>

        <button
          onClick={() => onConfirm(choice)}
          className="mt-4 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          불러오기
        </button>
        <button
          onClick={onCancel}
          className="mt-2 h-11 w-full rounded-card border border-line bg-surface text-sm font-bold text-muted"
        >
          취소
        </button>
      </div>
    </>
  );
}
