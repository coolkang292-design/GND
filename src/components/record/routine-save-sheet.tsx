"use client";

import { useState } from "react";

/**
 * 준비 목록을 이름 붙여 루틴으로 저장하는 시트 (0056, 2026-08-02).
 *
 * 한도에 걸렸을 때 "저장 안 됨"만 알리지 않는다 — 왜 안 되는지, 언제 풀리는지
 * 같이 보여준다. 슬롯 수는 레벨 보상(0022)이 정하고 그 계산은
 * `domain/routines.ts`의 순수 함수가 한다.
 */
export function RoutineSaveSheet({
  open,
  exerciseNames,
  savedCount,
  slotLimit,
  nextSlotLevel,
  onClose,
  onSave,
}: {
  open: boolean;
  exerciseNames: string[];
  savedCount: number;
  slotLimit: number;
  nextSlotLevel: number | null;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  // 열 때마다 언마운트→마운트로 입력값을 비운다 (피커와 같은 방식)
  if (!open) return null;
  return (
    <SaveSheet
      exerciseNames={exerciseNames}
      savedCount={savedCount}
      slotLimit={slotLimit}
      nextSlotLevel={nextSlotLevel}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function SaveSheet({
  exerciseNames,
  savedCount,
  slotLimit,
  nextSlotLevel,
  onClose,
  onSave,
}: {
  exerciseNames: string[];
  savedCount: number;
  slotLimit: number;
  nextSlotLevel: number | null;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const full = savedCount >= slotLimit;
  const canSave = !saving && !full && name.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (await onSave(name.trim())) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-extrabold">루틴으로 저장</h3>
          <span className="flex-none font-mono text-xs font-bold text-muted">
            {savedCount} / {slotLimit}
          </span>
        </div>
        <p className="mt-1 break-words text-xs text-muted">
          {exerciseNames.join(" · ")}
        </p>

        {full ? (
          <p className="mt-4 rounded-card-sm border border-warn/40 bg-surface-2 p-3 text-[12.5px] font-bold text-warn">
            {`루틴 슬롯 ${slotLimit}개를 모두 썼어요. ${
              nextSlotLevel !== null
                ? `Lv.${nextSlotLevel}을 달성하면 슬롯이 하나 늘어나요.`
                : "기존 루틴을 지우면 새로 저장할 수 있어요."
            }`}
          </p>
        ) : (
          <>
            <label
              htmlFor="routine-name"
              className="mt-4 block text-[11px] font-bold text-muted"
            >
              루틴 이름
            </label>
            <input
              id="routine-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 가슴·삼두 날"
              maxLength={40}
              className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold outline-none focus:border-accent"
            />
            {nextSlotLevel !== null && (
              <p className="mt-2 text-[11px] text-faint">
                Lv.{nextSlotLevel}을 달성하면 슬롯이 하나 더 늘어나요.
              </p>
            )}
          </>
        )}

        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="mt-4 h-11 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </>
  );
}
