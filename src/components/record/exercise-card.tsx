"use client";

import { useLongPress } from "@/hooks/use-long-press";
import { guideForExercise } from "@/lib/domain/exercise-guides";
import {
  programWeightGuide,
  repRangeLabel,
  restClock,
} from "@/lib/domain/program-load";
import { planFromSets, summarizePlan } from "@/lib/domain/recommended-sets";
import { imageIdForAddedExercise } from "@/lib/domain/exercise-images";
import { durationSecondsOf } from "@/lib/domain/set-timer";
import { setVolumeKg } from "@/lib/domain/volume";
import type { LocalExercise, LocalSet } from "@/lib/workout";
import { TYPE_LABEL } from "./exercise-picker";
import { ExerciseThumbTile } from "./exercise-thumb";
import { Icon } from "@/components/ui/icon";

/*
  2026-10-05 Performance Social 기록 시안(① 운동 준비)의 운동 카드 톤.
  썸네일 · 이름 · `부위 · 종류` · 이전 기록 불러오기 · 라임 목표 줄 · SET/KG/REPS/완료 표 ·
  완료는 라임 체크 원. **기능은 하나도 바꾸지 않았다** — 입력·완료 체크·세트 ±·삭제·
  롱프레스 순서 이동·자세 안내·처방·불러오기·계획 모드 전부 그대로다.
  ⚠️ 시안의 `이전` 열(세트별 지난 기록)은 넣지 않았다 — 카드에 그 데이터가 없고, 새 조회는
     이번 범위가 아니다. 지난 기록은 `불러오기`가 채운다.
*/

/** 완료 체크 버튼 — 세 가지 입력 모양(표·유산소·시간)이 같은 모양을 쓴다 */
const doneClass = (done: boolean) =>
  `flex items-center justify-center rounded-full border transition-colors ${
    done ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-transparent text-faint"
  }`;

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
  imageId,
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
  /**
   * 부모가 찾은 그림 ID (기록 화면은 본인 카탈로그로 직접 만든 운동까지 찾는다).
   * 넘기지 않으면 기본 운동 이름으로만 찾는다(계획 편집 시트 등).
   */
  imageId?: string;
}) {
  // 제목 줄을 약 0.5초 길게 누르면 순서 이동 시트 (설계 2026-07-19).
  // 시트를 열 수 없는 화면에서는 넘기지 않으므로 아무 일도 하지 않는다.
  const longPressHandlers = useLongPress(onLongPress ?? (() => {}));
  // 안내가 **있는 종목에만** 버튼을 낸다. 없는데 내면 눌러도 아무 일 없는
  // 죽은 버튼이 된다 (커스텀 종목이 대부분 여기 해당).
  const hasGuide = onOpenGuide ? guideForExercise(exercise.name) !== null : false;
  const thumbId = imageId ?? imageIdForAddedExercise(exercise);
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
      className="h-10 w-full rounded-[10px] border border-line bg-surface-2 px-2 text-center text-[15px] font-bold tabular-nums outline-none focus:border-accent"
    />
  );

  return (
    <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <div className="flex select-none items-center gap-2.5" {...longPressHandlers}>
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-surface-3 text-[11px] font-extrabold text-muted">
          {index + 1}
        </span>
        {/* 운동을 담은 뒤의 카드에도 그림을 보인다(사용자 지시 2026-10-05).
            카드는 서로 떨어져 있어 줄 맞춤용 빈 칸이 필요 없다 — 그림이 있을 때만 그린다.
            직접 만든 운동은 기본 운동과 이름이 같아도 그림을 붙이지 않는다 */}
        {thumbId && (
          <ExerciseThumbTile
            id={thumbId}
            name={exercise.name}
            bodyPart={exercise.bodyPart}
            size={48}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15.5px] font-extrabold">{exercise.name}</span>
            {exercise.isCustom && (
              <span className="flex-none rounded-full border border-accent/50 px-1.5 text-[10px] font-bold text-accent">
                직접
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted">
            {/* 부위가 종류와 같으면(유산소·유산소) 한 번만 적는다 */}
            {exercise.bodyPart && exercise.bodyPart !== TYPE_LABEL[exercise.exerciseType]
              ? `${exercise.bodyPart} · `
              : ""}
            {TYPE_LABEL[exercise.exerciseType]}
          </span>
        </span>
        <button
          onClick={onRemoveExercise}
          aria-label={`${exercise.name} 삭제`}
          className="grid h-8 w-8 flex-none place-items-center rounded-full text-faint"
        >
          <Icon name="close" size={16} />
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
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-accent"
        >
          <Icon name="book" size={14} />
          자세 안내
        </button>
      )}

      {/*
        공식 프로그램 처방 (0066에서 계획에 실려 온다).

        ⚠️ 문구를 여기 박지 마라. 반복 범위·여유 횟수·휴식은 프로그램마다 다르고
           `programWeightGuide()`가 유일한 출처다 — 두 곳에 두면 갈라진다.
      */}
      {exercise.prescription && (
        <div className="mt-2 rounded-card-sm border border-line bg-surface-2/60 p-2.5">
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
        <p className="mt-2 text-[12.5px] font-extrabold text-accent">
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
          className="inline-flex h-8 flex-none items-center gap-1 rounded-full border border-accent/50 px-3 text-xs font-bold text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!loadingLast && <Icon name="repeat" size={13} />}
          {loadingLast ? "불러오는 중…" : "이전 기록"}
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
                  className={`h-10 w-10 flex-none ${doneClass(s.done)}`}
                >
                  <Icon name="check" size={16} strokeWidth={2.6} />
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
                  className={`h-10 w-10 flex-none ${doneClass(s.done)} ${active ? "" : "opacity-60"}`}
                >
                  <Icon name="check" size={16} strokeWidth={2.6} />
                </button>
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            {/* ⚠️ 접근 이름 `– 세트`·`+ 세트`를 바꾸지 마라 — 달력 예정표 테스트가 이 이름으로 찾는다 */}
            <button
              onClick={onRemoveSet}
              aria-label="– 세트"
              className="flex h-10 w-12 flex-none items-center justify-center rounded-[10px] border border-line text-muted"
            >
              <Icon name="minus" size={16} />
            </button>
            <button
              onClick={onAddSet}
              aria-label="+ 세트"
              className="flex h-10 flex-1 items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong text-[12.5px] font-bold text-text"
            >
              <Icon name="plus" size={15} />
              세트 추가
            </button>
          </div>
        </div>
      ) : (
        <>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-[10.5px] tracking-wider text-faint">
                <th className="w-10 pb-1 font-bold">SET</th>
                {isWeight && <th className="pb-1 font-bold">KG</th>}
                <th className="pb-1 font-bold">REPS</th>
                {!planning && <th className="w-12 pb-1 font-bold">완료</th>}
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((s, si) => (
                <tr key={s.key}>
                  <td className="py-1 text-center text-[13px] font-extrabold text-muted tabular-nums">
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
                        className={`mx-auto h-9 w-9 ${doneClass(s.done)} ${active ? "" : "opacity-60"}`}
                      >
                        <Icon name="check" size={15} strokeWidth={2.6} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-2">
            {/* ⚠️ 접근 이름 `– 세트`·`+ 세트`를 바꾸지 마라 — 달력 예정표 테스트가 이 이름으로 찾는다 */}
            <button
              onClick={onRemoveSet}
              aria-label="– 세트"
              className="flex h-10 w-12 flex-none items-center justify-center rounded-[10px] border border-line text-muted"
            >
              <Icon name="minus" size={16} />
            </button>
            <button
              onClick={onAddSet}
              aria-label="+ 세트"
              className="flex h-10 flex-1 items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong text-[12.5px] font-bold text-text"
            >
              <Icon name="plus" size={15} />
              세트 추가
            </button>
          </div>
        </>
      )}
    </section>
  );
}
