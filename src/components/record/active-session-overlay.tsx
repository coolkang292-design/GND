"use client";

import {
  REST_PRESET_SECONDS,
  adjustAmount,
  type AmountField,
  type AmountFieldKey,
} from "@/lib/domain/set-input";

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

          <h2 className="mt-3 text-[26px] leading-tight font-extrabold">
            {exerciseName ?? "운동"}
            {resting && " 완료"}
          </h2>

          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[11.5px] font-bold text-muted">
            🕐 운동 시간 <span className="font-mono text-text">{elapsedLabel}</span>
          </p>

          <div className="my-4 border-t border-line" />

          {resting ? (
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
              ) : (
                <>
                  {/*
                    담은 세트를 전부 끝냈다 (2026-08-04, 사용자 요청).
                    자동으로 종료하지는 않는다 — 종료는 XP·기록을 확정하는
                    되돌리기 어려운 동작이라 **주 버튼만 종료로 바꿔** 자연스럽게
                    흐르게 하고, 누르는 건 사용자가 한다.
                  */}
                  <div className="mt-5 rounded-card border border-good/40 bg-good-weak px-4 py-4">
                    <p className="text-[15px] font-extrabold text-good">
                      {completionMessage.headline}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-5 font-bold text-muted">
                      {completionMessage.cheer}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={busy}
                    className="mt-4 h-13 w-full rounded-card bg-good py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    {busy ? "처리 중…" : "운동 종료하고 결과 보기 →"}
                  </button>
                </>
              )}
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
                <p className="mt-2 inline-block rounded-full bg-good-weak px-3 py-1 text-[11.5px] font-extrabold text-good">
                  🏁 마지막 세트예요 — 이것만 하면 오늘 몫 끝!
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
