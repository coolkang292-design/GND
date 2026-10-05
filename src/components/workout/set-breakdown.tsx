import { Icon } from "@/components/ui/icon";
import { cardioPaceLabel } from "@/lib/domain/cardio-pace";
import { formatSetAmount } from "@/lib/domain/set-display";
import { durationSecondsOf } from "@/lib/domain/set-timer";
import type { ExercisePrescription } from "@/lib/domain/workout-plan";
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
  durationSec?: number;
  /** 기록이면 완료 여부, 계획이면 없음 */
  done?: boolean;
};

export type BreakdownExercise = {
  name: string;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: BreakdownSet[];
  /**
   * 프로그램 계획의 처방 (2026-08-12 사용자 지적).
   *
   * 근력 프로그램 계획은 세트 수치가 **0으로 저장된다** — 반복은 범위(8~10회)이고
   * 무게는 시작할 때 최근 기록으로 채워지기 때문이다. 그런데 화면이 저장된 값을
   * 그대로 그려서 `0kg 0회`가 떴다. 할 일이 없는 것처럼 읽힌다.
   *
   * ⚠️ 계획에 단일 숫자를 저장하는 것으로 고치지 않는다. 범위를 한 값으로 굳히면
   *    거짓이 되고, 무게 추천(0067)이 시작할 때 정하는 것과도 어긋난다.
   *    **저장은 그대로 두고 화면이 처방을 보여 준다.**
   */
  prescription?: ExercisePrescription;
};

/** 세트에 저장된 수치가 하나도 없는가 — 그러면 처방을 대신 보여 준다 */
function isEmptySet(set: BreakdownSet): boolean {
  return (
    set.weightKg === 0 &&
    set.reps === 0 &&
    set.distanceKm === 0 &&
    // 초가 진실이다 (2026-08-28) — `durationMin`만 보면 37초 매달리기가
    // `빈 세트`로 판정돼 기록 대신 `목표 30초`가 그려진다
    durationSecondsOf(set) === 0
  );
}

function targetLabel(prescription: ExercisePrescription): string {
  return prescription.repsMin === prescription.repsMax
    ? `${prescription.repsMin}회 목표`
    : `${prescription.repsMin}–${prescription.repsMax}회 목표`;
}

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
    /* 2026-10-05 Performance Social 톤 (사용자 지시 "상세 UI도 새 톤앤매너로").
       피드 카드의 숫자 줄·운동 목록과 같은 상자 — 어두운 바탕 + 얇은 회색 테두리.
       세트 번호는 운동 목록의 번호 칸과 같은 모양, 완료는 라임 체크 원. 숫자는
       고정폭 글꼴(`font-mono`) 대신 앱 글꼴의 고른 숫자(`tabular-nums`)로 맞춘다. */
    <div className="flex flex-col gap-2">
      {exercises.map((exercise, index) => {
        const doneCount = exercise.sets.filter((s) => s.done === true).length;
        const isRecord = exercise.sets.some((s) => s.done !== undefined);
        return (
        <section
          key={`${exercise.name}-${index}`}
          className="overflow-hidden rounded-card-sm border border-line bg-surface-2/60"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="min-w-0 truncate text-[13.5px] font-extrabold">{exercise.name}</p>
            {exercise.sets.length > 0 && (
              <span className="flex-none text-[11px] font-bold text-muted">
                {isRecord
                  ? `${doneCount} / ${exercise.sets.length}세트`
                  : `${exercise.sets.length}세트`}
              </span>
            )}
          </div>
          {exercise.sets.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-faint">세트 없음</p>
          ) : (
            <ul className="divide-y divide-line/60 px-3">
              {exercise.sets.map((set, setIndex) => {
                const number = setIndex + 1;
                // 러닝 페이스 (2026-09-23) — **완료한 기록에만.** 계획의 페이스는
                // 아직 뛴 것이 아니고, 못 한 세트의 페이스는 뜻이 없다.
                const pace =
                  set.done === true
                    ? cardioPaceLabel({
                        name: exercise.name,
                        exerciseType: exercise.exerciseType,
                        durationSec: durationSecondsOf(set),
                        distanceKm: set.distanceKm,
                      })
                    : null;
                return (
                  <li
                    key={setIndex}
                    className="flex min-h-[34px] items-center gap-2.5 text-[13px]"
                  >
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-surface-3 text-[11px] font-extrabold text-muted tabular-nums">
                      {number}
                    </span>
                    <span
                      className={`flex-1 font-bold tabular-nums ${
                        set.done === false ? "text-faint line-through" : ""
                      }`}
                    >
                      {exercise.prescription && isEmptySet(set) ? (
                        <span
                          data-testid="set-target"
                          className="font-sans font-bold text-muted"
                        >
                          {targetLabel(exercise.prescription)}
                        </span>
                      ) : (
                        formatSetAmount({
                          exerciseType: exercise.exerciseType,
                          measure: exercise.measure,
                          weightKg: set.weightKg,
                          reps: set.reps,
                          distanceKm: set.distanceKm,
                          durationMin: set.durationMin,
                          durationSec: set.durationSec,
                        })
                      )}
                      {pace && (
                        <span className="ml-1.5 font-bold text-accent">
                          · {pace}
                        </span>
                      )}
                    </span>
                    {set.done !== undefined && (
                      <span
                        aria-label={`${number}세트 ${set.done ? "완료" : "미완료"}`}
                        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                          set.done
                            ? "bg-accent text-accent-ink"
                            : "border border-line-strong text-faint"
                        }`}
                      >
                        <Icon name={set.done ? "check" : "minus"} size={12} strokeWidth={2.6} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {exercise.prescription &&
            exercise.exerciseType === "weight" &&
            exercise.sets.every(isEmptySet) && (
              <p className="px-3 pb-2 text-[11px] text-faint">
                무게는 시작할 때 최근 기록으로 채워져요
              </p>
            )}
        </section>
        );
      })}
    </div>
  );
}
