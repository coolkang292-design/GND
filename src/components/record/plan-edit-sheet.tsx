"use client";

import {
  MAX_PLAN_SETS,
  setupEntriesFromRows,
  type PlanEditRow,
} from "@/lib/domain/plan-edit";
import type { SetupPlan } from "@/lib/domain/recommended-sets";
import { ExerciseSetupSheet } from "./exercise-setup-sheet";

/**
 * 예정표 고치기 (사용자 지시 2026-08-28).
 *
 * **편집 UI를 새로 만들지 않는다.** 종목 줄·요약·세트/횟수/무게 조절은
 * `ExerciseSetupSheet`가 이미 하는 일이고, 그 화면이 아는 무게 규칙
 * (「운동 중 입력」 ↔ 숫자)까지 그대로 따라온다. 여기는 시트 껍데기와
 * 취소·저장만 얹는다 — 편집기를 두 벌로 만들면 규칙이 갈라진다.
 *
 * ⚠️ 줄 목록(`rows`)은 **달력이 들고 있다.** '＋ 종목 추가'가 여는
 *    `ExercisePicker`가 달력에 있어서, 여기에 상태를 두면 시트를 닫았다 여는
 *    동안 추가한 종목이 사라진다.
 */
export function PlanEditSheet({
  open,
  dateLabel,
  rows,
  busy = false,
  onChangeRow,
  onRemoveRow,
  onAdd,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** "8월 30일" */
  dateLabel: string;
  rows: readonly PlanEditRow[];
  busy?: boolean;
  onChangeRow: (index: number, plan: SetupPlan) => void;
  onRemoveRow: (index: number) => void;
  onAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // 닫을 때 언마운트 — 조절 펼침 상태가 다음에 열 때 남지 않는다 (피커와 같은 규약)
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onCancel}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <ExerciseSetupSheet
          entries={setupEntriesFromRows(rows)}
          onChange={onChangeRow}
          onRemove={onRemoveRow}
          onAdd={onAdd}
          onBack={onCancel}
          onConfirm={onSave}
          busy={busy}
          title={`${dateLabel} 예정표 고치기`}
          subtitle="종목을 빼거나 더하고, 세트와 횟수를 바꿀 수 있어요"
          backLabel="고치기 취소"
          confirmLabel="이대로 저장하기"
          busyLabel="저장 중…"
          maxSets={MAX_PLAN_SETS}
        />
        {rows.length === 0 && (
          <p className="mt-2 flex-none text-center text-[11.5px] text-muted">
            운동이 하나는 있어야 해요. 통째로 없애려면 예정표의 삭제를 눌러 주세요
          </p>
        )}
      </div>
    </>
  );
}
