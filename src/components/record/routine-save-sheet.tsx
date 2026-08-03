"use client";

import { useState } from "react";

/** 덮어쓸 후보로 보여줄 최소 정보 — 이름과 지금 들어 있는 종목 */
export type RoutineChoice = {
  id: string;
  name: string;
  exerciseNames: string[];
};

/**
 * 준비 목록을 루틴으로 저장하거나, 기존 루틴의 종목을 갈아 끼우는 시트
 * (0056, 2026-08-02 · 덮어쓰기 2026-08-04).
 *
 * 한도에 걸렸을 때 "저장 안 됨"만 알리지 않는다 — 왜 안 되는지, 언제 풀리는지
 * 같이 보여준다. 슬롯 수는 레벨 보상(0022)이 정하고 그 계산은
 * `domain/routines.ts`의 순수 함수가 한다.
 *
 * **덮어쓰기가 있는 이유** (신고 6d6bffac, 2026-08-03): 루틴은 이름만 바꿀 수
 * 있고 종목 구성은 못 고쳤다. 잘못된 종목(웨이트 스쿼트)이 든 루틴 3개로
 * 한도를 채운 사용자는 새로 만들 수도, 고칠 수도 없이 갇혔다. 덮어쓰기는
 * UPDATE라 0056의 slot 트리거(`before insert`)에 걸리지 않으므로 **꽉 찬
 * 상태에서도 열려 있어야 한다** — 유일한 탈출구다.
 */
export function RoutineSaveSheet({
  open,
  ...props
}: {
  open: boolean;
  exerciseNames: string[];
  savedCount: number;
  slotLimit: number;
  nextSlotLevel: number | null;
  routines: RoutineChoice[];
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
  onOverwrite: (routineId: string) => Promise<boolean>;
}) {
  // 열 때마다 언마운트→마운트로 입력값을 비운다 (피커와 같은 방식)
  if (!open) return null;
  return <SaveSheet {...props} />;
}

function SaveSheet({
  exerciseNames,
  savedCount,
  slotLimit,
  nextSlotLevel,
  routines,
  onClose,
  onSave,
  onOverwrite,
}: {
  exerciseNames: string[];
  savedCount: number;
  slotLimit: number;
  nextSlotLevel: number | null;
  routines: RoutineChoice[];
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
  onOverwrite: (routineId: string) => Promise<boolean>;
}) {
  const full = savedCount >= slotLimit;
  const canOverwrite = routines.length > 0;
  // 꽉 찼으면 새로 저장은 어차피 막히므로 처음부터 덮어쓰기 쪽을 연다.
  const [mode, setMode] = useState<"new" | "overwrite">(
    full && canOverwrite ? "overwrite" : "new",
  );
  const [name, setName] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSave = !busy && !full && name.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      if (await onSave(name.trim())) onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleOverwrite() {
    if (busy || targetId === null) return;
    setBusy(true);
    try {
      if (await onOverwrite(targetId)) onClose();
    } finally {
      setBusy(false);
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
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <div className="flex flex-none items-baseline justify-between gap-2">
          <h3 className="text-base font-extrabold">루틴으로 저장</h3>
          <span className="flex-none font-mono text-xs font-bold text-muted">
            {savedCount} / {slotLimit}
          </span>
        </div>
        <p className="mt-1 flex-none break-words text-xs text-muted">
          {exerciseNames.join(" · ")}
        </p>

        {canOverwrite && (
          <div className="mt-3 flex flex-none gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
            {(
              [
                ["new", "새 루틴"],
                ["overwrite", "기존 루틴 수정"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`h-9 flex-1 rounded-[7px] text-sm font-bold ${
                  mode === value
                    ? "bg-surface text-accent shadow-card"
                    : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "overwrite" ? (
          <>
            <p className="mt-3 flex-none text-[11px] text-muted">
              고른 루틴의 종목이 <b>지금 담은 목록</b>으로 바뀌어요. 이름과 슬롯
              수는 그대로예요.
            </p>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {routines.map((routine) => {
                const picked = targetId === routine.id;
                return (
                  <button
                    key={routine.id}
                    type="button"
                    aria-label={`'${routine.name}' 루틴 고르기`}
                    aria-pressed={picked}
                    onClick={() => setTargetId(routine.id)}
                    className={`flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-b-0 ${
                      picked ? "bg-accent-weak/40" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold">
                        {routine.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {routine.exerciseNames.join(" · ")}
                      </span>
                    </span>
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-sm font-bold ${
                        picked
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line text-accent"
                      }`}
                    >
                      {picked ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => void handleOverwrite()}
              disabled={busy || targetId === null}
              className="mt-4 h-11 w-full flex-none rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy ? "저장 중…" : "선택한 루틴 덮어쓰기"}
            </button>
          </>
        ) : (
          <>
            {full ? (
              <p className="mt-4 flex-none rounded-card-sm border border-warn/40 bg-surface-2 p-3 text-[12.5px] font-bold text-warn">
                {`루틴 슬롯 ${slotLimit}개를 모두 썼어요. ${
                  nextSlotLevel !== null
                    ? `Lv.${nextSlotLevel}을 달성하면 슬롯이 하나 늘어나요.`
                    : "기존 루틴을 지우면 새로 저장할 수 있어요."
                }${
                  canOverwrite
                    ? " 위 '기존 루틴 수정'에서 지금 목록으로 바꿔 넣을 수도 있어요."
                    : ""
                }`}
              </p>
            ) : (
              <>
                <label
                  htmlFor="routine-name"
                  className="mt-4 block flex-none text-[11px] font-bold text-muted"
                >
                  루틴 이름
                </label>
                <input
                  id="routine-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="예: 가슴·삼두 날"
                  maxLength={40}
                  className="mt-1 h-11 w-full flex-none rounded-card-sm border border-line bg-surface-2 px-3 text-sm font-bold outline-none focus:border-accent"
                />
                {nextSlotLevel !== null && (
                  <p className="mt-2 flex-none text-[11px] text-faint">
                    Lv.{nextSlotLevel}을 달성하면 슬롯이 하나 더 늘어나요.
                  </p>
                )}
              </>
            )}

            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="mt-4 h-11 w-full flex-none rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
