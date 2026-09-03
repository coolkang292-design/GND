"use client";

import { useLongPress } from "@/hooks/use-long-press";
import { guideForExercise } from "@/lib/domain/exercise-guides";
import {
  programWeightGuide,
  repRangeLabel,
  restClock,
} from "@/lib/domain/program-load";
import { planFromSets, summarizePlan } from "@/lib/domain/recommended-sets";
import { durationSecondsOf } from "@/lib/domain/set-timer";
import { setVolumeKg } from "@/lib/domain/volume";
import type { LocalExercise, LocalSet } from "@/lib/workout";
import { TYPE_LABEL } from "./exercise-picker";

/** 세트 입력 카드 — 번호·중량·횟수·완료 체크, 유형별 입력 (§10) */
export function ExerciseCard({
  exercise,
  index,
  active,
  loadingLast,
  loadLastDisabled,
  onLoadLast,
  onUpdateSet,
  onToggleDone,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onLongPress,
  onOpenGuide,
  planning = false,
}: {
  exercise: LocalExercise;
  index: number;
  active: boolean;
  loadingLast: boolean;
  loadLastDisabled: boolean;
  onLoadLast: () => void;
  onUpdateSet: (setIndex: number, patch: Partial<LocalSet>) => void;
  /** 계획 모드에서는 완료 열이 없으므로 넘기지 않는다 */
  onToggleDone?: (setIndex: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onRemoveExercise: () => void;
  /** 순서 이동 시트를 여는 쪽에서만 넘긴다 */
  onLongPress?: () => void;
  /**
   * **계획을 짜는 중이다** (사용자 지시 2026-08-28).
   *
   * 달력의 「예정표 고치기」가 이 카드를 그대로 빌려 쓴다. 계획에는 완료라는
   * 개념이 없으므로 완료 열과 볼륨 줄만 접는다 — 세트별 kg·회 입력, ± 세트,
   * ✕, ↻ 불러오기는 계획에서도 그대로 필요한 것들이라 손대지 않는다.
   *
   * 편집 화면을 따로 만들지 않는 이유: 세트마다 다른 무게를 다루는 화면이
   * 이것뿐이라, 다른 화면을 쓰면 "대표값 하나"로 눌러 담았다가 되펴는
   * 보정 로직을 새로 써야 한다.
   */
  planning?: boolean;
  /**
   * 자세 안내 열기 (계획 2026-08-12). 넘기지 않으면 버튼 자체가 안 나온다 —
   * 안내 시트를 띄울 수 없는 화면(달력 예정표 미리보기 등)에서 죽은 버튼을
   * 만들지 않기 위해서다.
   */
  onOpenGuide?: (name: string) => void;
}) {
  // 제목 줄을 약 0.5초 길게 누르면 순서 이동 시트 (설계 2026-07-19).
  // 시트를 열 수 없는 화면에서는 넘기지 않으므로 아무 일도 하지 않는다.
  const longPressHandlers = useLongPress(onLongPress ?? (() => {}));
  // 안내가 **있는 종목에만** 버튼을 낸다. 없는데 내면 눌러도 아무 일 없는
  // 죽은 버튼이 된다 (커스텀 종목이 대부분 여기 해당).
  const hasGuide = onOpenGuide ? guideForExercise(exercise.name) !== null : false;
  const isWeight = exercise.exerciseType === "weight";
  const isCardio = exercise.exerciseType === "cardio";
  const isTimeBodyweight =
    exercise.exerciseType === "bodyweight" && exercise.measure === "time";

  const volumeKg = exercise.sets.reduce(
    (sum, s) =>
      sum +
      setVolumeKg({
        exerciseType: exercise.exerciseType,
        isCompleted: s.done,
        weightKg: s.weightKg,
        reps: s.reps,
      }),
    0,
  );

  const numInput = (
    value: number,
    onChange: (v: number) => void,
    mode: "decimal" | "numeric",
  ) => (
    <input
      defaultValue={value || ""}
      inputMode={mode}
      placeholder="0"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-9 w-full rounded-card-sm border border-line bg-bg px-2 text-center font-mono text-sm outline-none focus:border-accent"
    />
  );

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex select-none items-center gap-2" {...longPressHandlers}>
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-weak text-xs font-extrabold text-accent">
          {index + 1}
        </span>
        <span className="text-sm font-extrabold">{exercise.name}</span>
        {exercise.isCustom && (
          <span className="rounded bg-accent-weak px-1.5 py-0.5 text-[10px] font-bold text-accent">
            직접
          </span>
        )}
        <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
          {TYPE_LABEL[exercise.exerciseType]}
        </span>
        <button
          onClick={onRemoveExercise}
          aria-label={`${exercise.name} 삭제`}
          className="text-sm text-faint"
        >
          ✕
        </button>
      </div>

      {/*
        길게 누르기(순서 이동) 영역 **밖**에 둔다. 제목 줄 안에 넣으면
        pointerdown이 롱프레스 타이머를 같이 깨운다.
      */}
      {hasGuide && (
        <button
          type="button"
          onClick={() => onOpenGuide?.(exercise.name)}
          aria-label={`${exercise.name} 자세 안내`}
          className="mt-1.5 text-[11.5px] font-bold text-accent"
        >
          📖 자세 안내
        </button>
      )}

      {/*
        공식 프로그램 처방 (0066에서 계획에 실려 온다).

        ⚠️ 문구를 여기 박지 마라. 반복 범위·여유 횟수·휴식은 프로그램마다 다르고
           `programWeightGuide()`가 유일한 출처다 — 두 곳에 두면 갈라진다.
      */}
      {exercise.prescription && (
        <div className="mt-2 rounded-card-sm border border-line bg-surface-2 p-2.5">
          <p className="text-[11.5px] font-extrabold text-accent">
            목표 {repRangeLabel(exercise.prescription)} · 휴식{" "}
            {restClock(exercise.prescription.restSeconds)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed whitespace-pre-line text-muted">
            {programWeightGuide(exercise.prescription, exercise.exerciseType)}
          </p>
        </div>
      )}

      {/*
        시작 전에는 "무엇을 얼마나 할 예정인가"를 한 줄로 보여준다
        (사용자 지시 2026-08-06 — 세트 수·목표 횟수·무게 설정 상태).
        운동 중에는 안 띄운다: 그때는 아래 입력 행의 실제 값이 진실이고,
        예정값을 같이 두면 어느 쪽을 보는지 헷갈린다.
      */}
      {!active && (
        <p className="mt-1.5 text-xs font-bold text-accent">
          {summarizePlan(
            exercise.exerciseType,
            exercise.measure,
            planFromSets(exercise.sets, isTimeBodyweight),
          )}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        {/* 계획에는 완료가 없으므로 볼륨·집계 안내를 접는다 (2026-08-28) */}
        <p className="min-w-0 text-xs text-muted">
          {planning ? (
            "계획한 값이에요 · 그날 바꿔도 돼요"
          ) : isWeight ? (
            <>
              현재 완료 볼륨{" "}
              <span className="font-mono font-bold text-text">
                {volumeKg.toLocaleString()}kg
              </span>
            </>
          ) : isCardio ? (
            "유산소 · 완료 체크한 기록만 집계돼요"
          ) : isTimeBodyweight ? (
            "지속 시간 · 완료 체크한 기록만 집계돼요"
          ) : (
            "맨몸 운동 · 완료 세트 집계"
          )}
        </p>
        <button
          type="button"
          onClick={onLoadLast}
          disabled={active || loadLastDisabled}
          aria-label={`${exercise.name} 직전 기록 불러오기`}
          className="h-8 flex-none rounded-card-sm border border-line bg-surface-2 px-2.5 text-xs font-bold text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingLast ? "불러오는 중…" : "↻ 불러오기"}
        </button>
      </div>

      {isCardio ? (
        <div className="mt-3">
          {exercise.sets.map((s, si) => (
            <div key={s.key} className="flex items-end gap-2">
              <div className="flex-1">
                <div className="mb-1 text-[11px] text-faint">거리 (km)</div>
                {numInput(s.distanceKm, (v) => onUpdateSet(si, { distanceKm: v }), "decimal")}
              </div>
              <div className="flex-1">
              {/*
                화면은 **분**, 저장은 **초**다 (2026-08-28). 손으로 담을 땐 러닝이
                분 단위지만 세트 시계가 재면 `32분 40초`처럼 초가 남는다 —
                `durationSec`이 진실이라 여기서 60을 곱해 넣는다.
              */}
                <div className="mb-1 text-[11px] text-faint">시간 (분)</div>
                {numInput(
                  Math.round(durationSecondsOf(s) / 60),
                  (v) => onUpdateSet(si, { durationSec: Math.round(v * 60) }),
                  "numeric",
                )}
              </div>
              {!planning && (
                <button
                  onClick={() => onToggleDone?.(si)}
                  aria-label="완료 체크"
                  className={`h-9 w-11 flex-none rounded-card-sm border text-sm font-bold ${
                    s.done
                      ? "border-good bg-good text-white"
                      : "border-line bg-surface-2 text-faint"
                  }`}
                >
                  ✓
                </button>
              )}
            </div>
          ))}
        </div>
      ) : isTimeBodyweight ? (
        <div className="mt-3">
          {exercise.sets.map((s, si) => (
            <div key={s.key} className="mb-2 flex items-end gap-2">
              <div className="flex-1">
              {/*
                ⚠️ **초다.** `분`이던 시절엔 매달리기 37초를 넣을 방법이 아예
                없었다(정수 분 입력이라 0분 아니면 1분). 되돌리지 마라.
              */}
                <div className="mb-1 text-[11px] text-faint">시간 (초)</div>
                {numInput(
                  durationSecondsOf(s),
                  (v) => onUpdateSet(si, { durationSec: Math.round(v) }),
                  "numeric",
                )}
              </div>
              {!planning && (
                <button
                  onClick={() => onToggleDone?.(si)}
                  aria-label={`${si + 1}세트 완료`}
                  className={`h-9 w-11 flex-none rounded-card-sm border text-sm font-bold ${
                    s.done
                      ? "border-good bg-good text-white"
                      : "border-line bg-surface-2 text-faint"
                  } ${active ? "" : "opacity-60"}`}
                >
                  ✓
                </button>
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              onClick={onRemoveSet}
              className="h-9 flex-1 rounded-card-sm border border-line text-xs font-bold text-muted"
            >
              – 세트
            </button>
            <button
              onClick={onAddSet}
              className="h-9 flex-1 rounded-card-sm bg-surface-2 text-xs font-bold text-accent"
            >
              + 세트
            </button>
          </div>
        </div>
      ) : (
        <>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-[11px] text-faint">
                <th className="w-10 pb-1 font-bold">세트</th>
                {isWeight && <th className="pb-1 font-bold">kg</th>}
                <th className="pb-1 font-bold">회</th>
                {!planning && <th className="w-12 pb-1 font-bold">완료</th>}
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((s, si) => (
                <tr key={s.key}>
                  <td className="py-1 text-center font-mono text-sm text-muted">
                    {si + 1}
                  </td>
                  {isWeight && (
                    <td className="py-1 pr-2">
                      {numInput(s.weightKg, (v) => onUpdateSet(si, { weightKg: v }), "decimal")}
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    {numInput(s.reps, (v) => onUpdateSet(si, { reps: v }), "numeric")}
                  </td>
                  {!planning && (
                    <td className="py-1 text-center">
                      <button
                        onClick={() => onToggleDone?.(si)}
                        aria-label={`${si + 1}세트 완료`}
                        className={`h-9 w-10 rounded-card-sm border text-sm font-bold ${
                          s.done
                            ? "border-good bg-good text-white"
                            : "border-line bg-surface-2 text-faint"
                        } ${active ? "" : "opacity-60"}`}
                      >
                        ✓
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onRemoveSet}
              className="h-9 flex-1 rounded-card-sm border border-line text-xs font-bold text-muted"
            >
              – 세트
            </button>
            <button
              onClick={onAddSet}
              className="h-9 flex-1 rounded-card-sm bg-surface-2 text-xs font-bold text-accent"
            >
              + 세트
            </button>
          </div>
        </>
      )}
    </section>
  );
}
