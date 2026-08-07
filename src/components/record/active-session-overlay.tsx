"use client";

import { UiIcon } from "@/components/ui-icon";
import {
  REST_PRESET_SECONDS,
  adjustAmount,
  type AmountField,
  type AmountFieldKey,
} from "@/lib/domain/set-input";
import type {
  ExerciseSetProgress,
  WorkoutProgress,
} from "@/lib/domain/workout-progress";

/**
 * 운동 중 큰 팝업 (2026-08-04, 설계 ② · 사용자 목업).
 *
 * 두 상태가 **번갈아** 뜬다:
 * - `input` — `● 지금 운동 중`. **세트 하나**를 큰 숫자와 스테퍼로 입력한다
 * - `rest`  — `● 휴식 중`. 남은 시간·프리셋·다음 운동을 보여준다
 *
 * ⚠️ **탭바는 덮지 않는다** (사용자 결정). `inset-0`이 아니라 `inset-x-0`+`bottom`
 * 이라 달력·피드로 바로 갈 수 있다.
 *
 * ⚠️ **z-20에 머문다.** 운동 추가 시트(z-40/50)·무동작 정지 모달(z-50)이 이 위에
 * 떠야 한다. 값을 올리면 시트가 팝업 뒤로 숨는다.
 *
 * ⚠️ 어떤 칸을 그릴지는 `amountFields`가 정한다 — 여기서 유형을 분기하면 저장
 * 구조(`LocalSet`)와 어긋난다. 지시서: "입력 항목을 임의로 추가·삭제하지 마라".
 */
export type SetValues = Record<AmountFieldKey, number>;

function presetLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${min}분` : `${min}분 ${rest}초`;
}

function clock(seconds: number): string {
  const mm = String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0");
  const ss = String(Math.max(0, seconds) % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ActiveSessionOverlay({
  open,
  mode,
  elapsedLabel,
  exerciseName,
  progress,
  setProgress,
  setPosition,
  fields,
  values,
  restSeconds,
  restPresetSeconds,
  nextUp,
  isLastPendingSet,
  completionMessage,
  paused,
  busy,
  onChangeAmount,
  onCompleteSet,
  onLoadLast,
  onAdjustRest,
  onPickRestPreset,
  onStartNext,
  onMinimize,
  onCancel,
  onFinish,
}: {
  open: boolean;
  mode: "input" | "rest";
  elapsedLabel: string;
  exerciseName: string | null;
  /** 오늘 담은 세트 기준 전체 진행률 (`workoutProgress`) */
  progress: WorkoutProgress;
  /** 지금 종목의 세트 진행 — 휴식 화면의 `3세트 / 4세트` (`exerciseSetProgress`) */
  setProgress: ExerciseSetProgress;
  setPosition: { index: number; total: number };
  fields: AmountField[];
  values: SetValues;
  /** 휴식 남은 초 (rest 모드) */
  restSeconds: number;
  /** 지금 설정된 휴식 기본값 — 프리셋 칩 표시용 */
  restPresetSeconds: number;
  nextUp: { exerciseName: string; amount: string } | null;
  /** 지금 보여주는 세트가 오늘 남은 마지막 세트인가 — 입력 화면 안내용 */
  isLastPendingSet: boolean;
  /** 다 끝냈을 때 보여줄 안내 + 응원 (`workoutCompletionMessage`) */
  completionMessage: { headline: string; cheer: string };
  paused: boolean;
  busy: boolean;
  onChangeAmount: (key: AmountFieldKey, value: number) => void;
  onCompleteSet: () => void;
  onLoadLast: () => void;
  onAdjustRest: (deltaSeconds: number) => void;
  onPickRestPreset: (seconds: number) => void;
  onStartNext: () => void;
  onMinimize: () => void;
  onCancel: () => void;
  onFinish: () => void;
}) {
  if (!open) return null;

  const resting = mode === "rest";
  /** 쉬는 중인데 다음이 없다 = 담은 세트를 전부 끝냈다 */
  const allDone = resting && nextUp === null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex flex-col overflow-y-auto bg-bg/95 px-3 pt-3 backdrop-blur"
      style={{ bottom: 0 }}
    >
      <div className="mx-auto w-full max-w-[460px] pb-6">
        {/* 최소화·취소는 카드 밖 — 목업의 흐릿한 윗줄 자리 */}
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onMinimize}
            className="h-8 flex-1 rounded-full border border-line bg-surface-2 text-[11px] font-bold text-muted"
          >
            ▾ 최소화
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-8 flex-none rounded-full px-3 text-[11px] font-bold text-faint disabled:opacity-50"
          >
            취소
          </button>
        </div>

        <section className="rounded-[20px] border border-line bg-surface p-5 text-center shadow-card">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-extrabold ${
              paused
                ? "bg-warn/15 text-warn"
                : resting
                  ? "bg-accent-weak text-accent"
                  : "bg-accent-weak text-accent"
            }`}
          >
            ● {paused ? "정지됨 — 무동작" : resting ? "휴식 중" : "지금 운동 중"}
          </span>

          {/*
            전체 진행률 (2026-08-07, 사용자 목업).

            휴식 화면에서는 여기가 예전에 `{종목명} 완료` 헤드라인이던 자리다.
            방금 끝낸 것만 말할 뿐 **오늘 얼마나 남았는지**는 어디에도 없었다 —
            사용자가 그 자리에 진행률을 넣으라고 지시했다.

            입력 화면에서는 종목명을 지우지 않는다. 지금 뭘 하는지가 제일
            중요하고, 진행률은 그 위에 얇게 얹는다.
          */}
          <div className="mt-3">
            <div className="flex items-end justify-between gap-2">
              <span className="text-[11.5px] font-bold text-muted">
                전체 운동 진행률
              </span>
              <span className="text-[11.5px] font-extrabold text-muted">
                {progress.completed} / {progress.total} 완료
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="전체 운동 진행률"
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2"
            >
              {/*
                ⚠️ **`transition-[width]`를 붙이지 마라.** 붙이면 인라인
                `width: 16%`가 있는데도 계산 폭이 **0px에 머물러 막대가 아예
                안 보인다**(2026-08-07 개발 서버에서 확인 — 클래스를 떼는
                순간 49.4px로 정상 렌더). 단위 테스트는 `aria-valuenow`만
                보므로 이건 화면을 봐야 잡힌다. 진행률 막대에 애니메이션이
                꼭 필요하지도 않다.
              */}
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-1 text-right text-[11px] font-bold text-accent">
              {progress.percent}%
            </p>
          </div>

          {!resting && (
            <h2 className="mt-3 text-[26px] leading-tight font-extrabold">
              {exerciseName ?? "운동"}
            </h2>
          )}

          {/*
            운동 시간 — 예전 11.5px 알약보다 크게 (사용자 지시 ②).

            ⚠️ **휴식 타이머(34px)보다는 작게 유지한다** (사용자 지시 2026-08-07).
            휴식 화면에서 제일 큰 숫자는 지금 세고 있는 휴식 시간이어야 하고,
            경과 시간이 그보다 크면 시선을 뺏는다. 휴식 쪽 크기를 바꾸면 이쪽도
            같이 봐야 한다.
          */}
          <p className="mt-3 text-[11.5px] font-bold text-muted">⏱ 운동 시간</p>
          <p className="font-mono text-[26px] leading-none font-extrabold tracking-tight">
            {elapsedLabel}
          </p>

          {/*
            휴식 중에도 이 종목이 몇 세트 남았는지 말한다 (사용자 지시 ③).
            휴식 화면에서 종목명이 헤드라인에서 빠졌으므로 여기가 그 자리다.
          */}
          {resting && !allDone && exerciseName && (
            <div className="mt-3 rounded-card border border-line bg-surface-2 px-4 py-3 text-left">
              <p className="text-[13px] font-extrabold">{exerciseName}</p>
              <p className="mt-0.5 text-[12.5px] font-extrabold text-accent">
                {setProgress.done}세트 / {setProgress.total}세트
              </p>
              <p className="mt-0.5 text-[11.5px] font-bold text-muted">
                {setProgress.remaining > 0
                  ? `${setProgress.remaining}세트 남음`
                  : "이 종목은 다 했어요"}
              </p>
            </div>
          )}

          <div className="my-4 border-t border-line" />

          {allDone ? (
            <>
              {/*
                B안 (2026-08-04, 사용자 결정) — 마지막 세트에는 휴식을 걸지 않는다.
                돌지도 않는 타이머와 프리셋을 그리면 거짓말이 된다.
                3초 뒤 결과 화면으로 넘어가고, 기다리기 싫으면 바로 누를 수 있다.
              */}
              <div className="rounded-card border border-good/40 bg-good-weak px-4 py-4">
                <p className="text-[15px] font-extrabold text-good">
                  {completionMessage.headline}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-5 font-bold text-muted">
                  {completionMessage.cheer}
                </p>
              </div>
              <p className="mt-4 text-[12px] font-bold text-muted">
                잠시 후 결과 화면으로 넘어가요…
              </p>
              <button
                type="button"
                onClick={onFinish}
                disabled={busy}
                className="mt-2 text-[12px] font-bold text-accent underline underline-offset-4 disabled:opacity-60"
              >
                {busy ? "처리 중…" : "지금 바로 보기"}
              </button>
            </>
          ) : resting ? (
            <>
              <p className="text-[12.5px] font-bold text-accent">휴식 시간</p>
              <div className="mt-2 flex items-center justify-center gap-4 rounded-card border border-line bg-surface-2 py-3">
                <button
                  type="button"
                  onClick={() => onAdjustRest(-10)}
                  aria-label="휴식 10초 줄이기"
                  className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-xl font-bold"
                >
                  –
                </button>
                <span className="font-mono text-[34px] leading-none font-extrabold">
                  {clock(restSeconds)}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjustRest(10)}
                  aria-label="휴식 10초 늘리기"
                  className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-xl font-bold"
                >
                  +
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {REST_PRESET_SECONDS.map((seconds) => {
                  const active = restPresetSeconds === seconds;
                  return (
                    <button
                      key={seconds}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onPickRestPreset(seconds)}
                      className={`h-8 rounded-card-sm border px-2.5 text-[11.5px] font-bold ${
                        active
                          ? "border-accent bg-accent-weak text-accent"
                          : "border-line bg-surface-2 text-muted"
                      }`}
                    >
                      {presetLabel(seconds)}
                    </button>
                  );
                })}
              </div>

              {nextUp ? (
                <>
                  <p className="mt-5 text-[12.5px] font-bold text-muted">
                    다음 운동
                  </p>
                  <p className="mt-1 text-[22px] leading-tight font-extrabold">
                    {nextUp.exerciseName}
                  </p>
                  <p className="mt-2 inline-block rounded-card border border-line bg-surface-2 px-4 py-2 font-mono text-base font-extrabold">
                    {nextUp.amount}
                  </p>
                  <button
                    type="button"
                    onClick={onStartNext}
                    className="mt-5 h-13 w-full rounded-card bg-accent py-3.5 text-sm font-extrabold text-accent-ink"
                  >
                    ▶ 다음 운동 시작
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[12.5px] font-bold text-muted">
                현재 세트{" "}
                <span className="font-mono text-accent">
                  {setPosition.index + 1} / {Math.max(1, setPosition.total)}
                </span>
              </p>
              {isLastPendingSet && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-good-weak px-3 py-1 text-[11.5px] font-extrabold text-good">
                  {/* 옛 표기는 `🏁`였다 (2026-08-07 2차 시안으로 교체) */}
                  <UiIcon name="finish" size={14} />
                  마지막 세트예요 — 이것만 하면 오늘 몫 끝!
                </p>
              )}

              <div className="mt-3 flex gap-2.5">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex-1 rounded-card border border-line bg-surface-2 p-3"
                  >
                    <p className="text-[11.5px] font-bold text-muted">
                      {field.label}
                    </p>
                    <p className="mt-1 font-mono text-[30px] leading-none font-extrabold">
                      {values[field.key]}
                      <span className="ml-1 text-[12px] font-bold text-muted">
                        {field.unit}
                      </span>
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        aria-label={`${field.label} 줄이기`}
                        onClick={() =>
                          onChangeAmount(
                            field.key,
                            adjustAmount(values[field.key], -field.step),
                          )
                        }
                        className="h-9 flex-1 rounded-card-sm border border-line bg-surface text-lg font-bold"
                      >
                        –
                      </button>
                      <button
                        type="button"
                        aria-label={`${field.label} 늘리기`}
                        onClick={() =>
                          onChangeAmount(
                            field.key,
                            adjustAmount(values[field.key], field.step),
                          )
                        }
                        className="h-9 flex-1 rounded-card-sm border border-line bg-surface text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {fields.flatMap((field) =>
                  field.quickSteps.map((delta) => (
                    <button
                      key={`${field.key}:${delta}`}
                      type="button"
                      aria-label={`${field.label} ${delta > 0 ? "+" : ""}${delta}`}
                      onClick={() =>
                        onChangeAmount(
                          field.key,
                          adjustAmount(values[field.key], delta),
                        )
                      }
                      className="h-8 rounded-card-sm border border-line bg-surface-2 px-2.5 font-mono text-[11.5px] font-bold text-muted"
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  )),
                )}
              </div>

              <button
                type="button"
                onClick={onCompleteSet}
                disabled={busy}
                className="mt-5 h-13 w-full rounded-card border-2 border-accent bg-transparent py-3.5 text-sm font-extrabold text-accent disabled:opacity-60"
              >
                ✓ 운동 완료
              </button>

              <button
                type="button"
                onClick={onLoadLast}
                className="mt-3 text-[12px] font-bold text-muted underline underline-offset-4"
              >
                이전 기록 불러오기
              </button>
            </>
          )}
        </section>

        {/* 다 끝냈을 때는 카드 안의 주 버튼이 종료라 여기 두면 같은 게 둘이 된다 */}
        {!allDone && (
          <button
            type="button"
            onClick={onFinish}
            disabled={busy}
            className="mt-3 h-11 w-full rounded-card border border-line bg-surface text-[13px] font-bold text-muted disabled:opacity-60"
          >
            {busy ? "처리 중…" : "운동 종료"}
          </button>
        )}
      </div>
    </div>
  );
}
