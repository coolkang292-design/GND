import { formatSetAmount } from "@/lib/domain/set-display";
import type { ExerciseType } from "@/lib/types";

/**
 * 종목·세트 표시 (2026-08-04) — 지난 기록 상세(④)와 계획 상세(⑥)가 공유한다.
 *
 * **완료 여부는 플래그가 아니라 데이터로 갈린다.** 세트에 `done`이 없으면 계획이라
 * 완료 표시를 그리지 않는다. `mode` 같은 인자를 두면 호출부가 데이터와 어긋나게
 * 넘길 수 있다.
 *
 * 수량 표기는 `formatSetAmount` 하나만 쓴다 — 공유 텍스트와 갈라지지 않게.
 */
export type BreakdownSet = {
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
  /** 기록이면 완료 여부, 계획이면 없음 */
  done?: boolean;
};

export type BreakdownExercise = {
  name: string;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: BreakdownSet[];
};

export function SetBreakdown({
  exercises,
}: {
  exercises: BreakdownExercise[];
}) {
  if (exercises.length === 0) {
    return (
      <p className="text-[12.5px] text-muted">저장된 세트 기록이 없어요.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {exercises.map((exercise, index) => (
        <section
          key={`${exercise.name}-${index}`}
          className="rounded-card-sm border border-line bg-surface-2 p-3"
        >
          <p className="text-[13px] font-extrabold">{exercise.name}</p>
          {exercise.sets.length === 0 ? (
            <p className="mt-1 text-[11.5px] text-faint">세트 없음</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {exercise.sets.map((set, setIndex) => {
                const number = setIndex + 1;
                return (
                  <li
                    key={setIndex}
                    className="flex items-center gap-2 text-[12.5px]"
                  >
                    <span className="w-4 flex-none text-center font-mono text-[11px] text-faint">
                      {number}
                    </span>
                    <span
                      className={`flex-1 font-mono ${
                        set.done === false ? "text-faint line-through" : ""
                      }`}
                    >
                      {formatSetAmount({
                        exerciseType: exercise.exerciseType,
                        measure: exercise.measure,
                        weightKg: set.weightKg,
                        reps: set.reps,
                        distanceKm: set.distanceKm,
                        durationMin: set.durationMin,
                      })}
                    </span>
                    {set.done !== undefined && (
                      <span
                        aria-label={`${number}세트 ${set.done ? "완료" : "미완료"}`}
                        className={`flex-none text-[11px] font-bold ${
                          set.done ? "text-good" : "text-faint"
                        }`}
                      >
                        {set.done ? "✓" : "—"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
