"use client";

import type { LocalExercise, LocalSet } from "@/lib/workout";
import { ExerciseCard } from "./exercise-card";

/**
 * 예정표 고치기 (사용자 지시 2026-08-28).
 *
 * **편집 UI를 새로 만들지 않는다.** 기록 화면의 종목 카드가 이미 세트별
 * kg·회 입력, `+ 세트`/`– 세트`, `✕` 삭제, `↻ 불러오기`를 다 갖고 있다.
 * 계획도 결국 같은 `PlanExercise[]`라, 같은 카드를 `planning`으로 빌린다.
 *
 * ⚠️ 다른 화면(추천의 세트 설정)을 빌리면 **세트마다 다른 무게**(지난 기록을
 *    복사한 예정표는 60·65·70kg이다)를 대표값 하나로 눌러 담았다가 되펴야 해서,
 *    그 손실을 메우는 보정 로직을 새로 써야 한다. 이 카드는 세트별로 직접
 *    입력하므로 그 문제가 **생기지 않는다**.
 *
 * ⚠️ 목록은 **달력이 들고 있다.** '＋ 종목 추가'가 여는 `ExercisePicker`가
 *    달력에 있어서, 여기에 상태를 두면 주인이 갈라진다.
 */
export function PlanEditSheet({
  open,
  dateLabel,
  exercises,
  busy = false,
  loadingKey,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onLoadLast,
  onAdd,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** "8월 30일" */
  dateLabel: string;
  exercises: readonly LocalExercise[];
  busy?: boolean;
  /** 직전 기록을 불러오는 중인 종목 키 */
  loadingKey?: string | null;
  onUpdateSet: (exKey: string, setIndex: number, patch: Partial<LocalSet>) => void;
  onAddSet: (exKey: string) => void;
  onRemoveSet: (exKey: string) => void;
  onRemoveExercise: (exKey: string) => void;
  onLoadLast: (exercise: LocalExercise) => void;
  onAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // 닫을 때 언마운트 — 다음에 열면 초기 상태 (피커·인터벌 시트와 같은 규약)
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

        <div className="mb-2 flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="고치기 취소"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="text-sm font-extrabold">{dateLabel} 예정표 고치기</p>
            <p className="text-[11.5px] text-muted">
              종목을 빼거나 더하고, 세트와 무게를 바꿀 수 있어요
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {exercises.map((exercise, index) => (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              index={index}
              planning
              /* 계획에는 "운동 중"이 없다 — 요약 줄이 보이는 쪽이 맞다 */
              active={false}
              loadingLast={loadingKey === exercise.key}
              loadLastDisabled={busy || loadingKey !== null}
              onLoadLast={() => onLoadLast(exercise)}
              onUpdateSet={(setIndex, patch) =>
                onUpdateSet(exercise.key, setIndex, patch)
              }
              onAddSet={() => onAddSet(exercise.key)}
              onRemoveSet={() => onRemoveSet(exercise.key)}
              onRemoveExercise={() => onRemoveExercise(exercise.key)}
            />
          ))}
          {exercises.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-muted">
              운동이 하나는 있어야 해요.
              <br />
              통째로 없애려면 예정표의 삭제를 눌러 주세요.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className="mt-2 h-11 w-full flex-none rounded-card-sm border border-accent bg-surface text-sm font-extrabold text-accent disabled:opacity-40"
        >
          ＋ 종목 추가
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || exercises.length === 0}
          className="mt-2 h-12 w-full flex-none rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          {busy ? "저장 중…" : "이대로 저장하기"}
        </button>
      </div>
    </>
  );
}
