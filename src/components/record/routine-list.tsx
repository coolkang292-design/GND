"use client";

import { useState } from "react";
import type { WorkoutRoutine } from "@/lib/routines";

/**
 * 운동 추가 시트의 '내 루틴' 탭 내용 (2026-08-02).
 *
 * 피커 본체에 인라인으로 넣으면 exercise-picker.tsx가 한 화면에 안 들어온다.
 * 목록·이름 변경·삭제만 담당하고, 저장은 기록 탭의 저장 시트가 한다.
 */
export function RoutineList({
  routines,
  loading,
  busyId,
  onPick,
  onRename,
  onDelete,
}: {
  routines: WorkoutRoutine[];
  loading: boolean;
  busyId: string | null;
  onPick: (routine: WorkoutRoutine) => void;
  onRename: (routineId: string, name: string) => Promise<boolean>;
  onDelete: (routine: WorkoutRoutine) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  async function commitRename(routineId: string) {
    const name = draftName.trim();
    if (!name) return;
    if (await onRename(routineId, name)) setEditingId(null);
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted">루틴을 불러오는 중…</p>
    );
  }

  if (routines.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-bold">아직 저장한 루틴이 없어요</p>
        <p className="mt-1 text-xs text-muted">
          운동을 담은 뒤 기록 화면에서 <b>💾 루틴으로 저장</b>을 누르면 여기에
          모여요.
        </p>
      </div>
    );
  }

  return (
    <>
      {routines.map((routine) => {
        const busy = busyId !== null;
        const editing = editingId === routine.id;
        return (
          <div
            key={routine.id}
            className="border-b border-line py-3 last:border-b-0"
          >
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={40}
                  aria-label="루틴 이름"
                  className="h-10 min-w-0 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  disabled={busy || draftName.trim().length === 0}
                  onClick={() => void commitRename(routine.id)}
                  className="h-10 flex-none rounded-card-sm bg-accent px-3 text-xs font-extrabold text-accent-ink disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="h-10 flex-none px-1 text-xs font-bold text-faint"
                >
                  취소
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPick(routine)}
                  className="min-w-0 flex-1 text-left disabled:opacity-60"
                >
                  <span className="block text-sm font-extrabold">
                    {routine.name}
                    <span className="ml-2 text-xs font-bold text-muted">
                      {routine.exercises.length}종목
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">
                    {routine.exercises.map((e) => e.name).join(" · ")}
                  </span>
                </button>
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${routine.name} 이름 변경`}
                    onClick={() => {
                      setEditingId(routine.id);
                      setDraftName(routine.name);
                    }}
                    className="text-xs font-bold text-muted"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    aria-label={`${routine.name} 삭제`}
                    disabled={busy}
                    onClick={() => onDelete(routine)}
                    className="text-xs font-bold text-warn disabled:opacity-50"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(routine)}
                    className="text-xs font-extrabold text-accent disabled:opacity-50"
                  >
                    {busyId === routine.id ? "불러오는 중…" : "불러오기"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
