"use client";

import { useRef, useState } from "react";
import type { LocalExercise } from "@/lib/workout";

const ROW_HEIGHT_PX = 52;

/** 운동 순서 이동 바텀시트 — 드래그 핸들로 재배열, 🗑 삭제 (설계 2026-07-19) */
export function ExerciseReorderSheet({
  exercises,
  onMove,
  onRemove,
  onClose,
}: {
  exercises: LocalExercise[];
  onMove: (from: number, to: number) => void;
  onRemove: (exKey: string) => void;
  onClose: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartYRef = useRef(0);
  const dragIndexRef = useRef<number | null>(null);

  function onHandleDown(index: number, event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartYRef.current = event.clientY;
    dragIndexRef.current = index;
    setDragIndex(index);
    setDragOffset(0);
  }

  function onHandleMove(event: React.PointerEvent<HTMLElement>) {
    const from = dragIndexRef.current;
    if (from === null) return;

    const dy = event.clientY - dragStartYRef.current;
    const slots = Math.round(dy / ROW_HEIGHT_PX);
    const to = Math.min(Math.max(from + slots, 0), exercises.length - 1);

    if (to !== from) {
      onMove(from, to);
      dragStartYRef.current += (to - from) * ROW_HEIGHT_PX;
      dragIndexRef.current = to;
      setDragIndex(to);
      setDragOffset(event.clientY - dragStartYRef.current);
      return;
    }
    setDragOffset(dy);
  }

  function onHandleEnd() {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOffset(0);
  }

  function remove(exercise: LocalExercise) {
    const doneCount = exercise.sets.filter((s) => s.done).length;
    if (
      doneCount > 0 &&
      !window.confirm(
        `${exercise.name}에 완료한 세트 ${doneCount}개가 있어요. 삭제할까요?`,
      )
    ) {
      return;
    }
    onRemove(exercise.key);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h3 className="mb-2.5 text-center text-base font-extrabold">
          운동 순서 이동
        </h3>

        <div className="overflow-y-auto">
          {exercises.map((exercise, index) => (
            <div
              key={exercise.key}
              style={{
                height: ROW_HEIGHT_PX,
                transform:
                  dragIndex === index
                    ? `translateY(${dragOffset}px)`
                    : undefined,
                transition: dragIndex === index ? "none" : "transform 0.15s",
              }}
              className={`flex items-center gap-2 border-t border-line first:border-t-0 ${
                dragIndex === index
                  ? "relative z-10 rounded-card-sm bg-surface-2 shadow-card"
                  : ""
              }`}
            >
              <p className="min-w-0 flex-1 truncate text-sm font-bold">
                <span className="text-muted">{exercise.bodyPart} | </span>
                {exercise.name}
              </p>
              <button
                type="button"
                onClick={() => remove(exercise)}
                aria-label={`${exercise.name} 삭제`}
                className="flex h-10 w-10 flex-none items-center justify-center text-base text-muted"
              >
                🗑
              </button>
              <button
                type="button"
                aria-label={`${exercise.name} 순서 이동`}
                onPointerDown={(e) => onHandleDown(index, e)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleEnd}
                onPointerCancel={onHandleEnd}
                style={{ touchAction: "none" }}
                className="flex h-10 w-10 flex-none cursor-grab items-center justify-center text-lg text-muted active:cursor-grabbing"
              >
                ≡
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-12 flex-none rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          완료
        </button>
      </div>
    </>
  );
}
