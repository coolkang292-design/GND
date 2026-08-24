"use client";

import { UiIcon } from "@/components/ui-icon";
import { guideForExercise } from "@/lib/domain/exercise-guides";
import { repRangeLabel, restClock } from "@/lib/domain/program-load";
import type { ExercisePrescription } from "@/lib/domain/workout-plan";
import {
  REST_PRESET_SECONDS,
  adjustAmount,
  type AmountField,
  type AmountFieldKey,
} from "@/lib/domain/set-input";
import type { SpreadOffer } from "@/lib/domain/set-spread";
import type { PreviousHint } from "@/lib/domain/previous-set";
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
 * ⚠️ **위쪽 여백은 `env(safe-area-inset-top)`이다** (2026-08-09 사용자 신고
 * "실 서버에 접어 두기 기능 작동 안함"). `layout.tsx`가 `viewportFit: "cover"`,
 * 매니페스트가 `display: standalone`이라 **설치형 앱에서는 페이지가 상태바 밑까지
 * 그려진다.** 예전엔 `pt-3`(12px)뿐이라 첫 줄인 `▾ 최소화`·`취소`(h-8=32px)가
 * 통째로 상태바 아래 깔려 **탭이 시스템 UI로 갔다.** PC 개발 서버는 inset이 0이라
 * 멀쩡히 눌린다 — 폰에서만 나는 증상이었다. 되돌리면 오버레이가 다시 감옥이 된다.
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

/**
 * 지난 기록 한 줄 + `한 번 더` (설계 2026-08-24 §3.5).
 *
 * ⚠️ **문구를 여기서 짓지 마라.** `hint.amountLabel`·`hint.cheer`·`hint.message`는
 * `previousHintFor()`가 이미 지었다. 입력 화면과 휴식 화면이 같이 쓰므로 화면에
 * 문자열을 박으면 두 화면이 갈라진다.
 *
 * ⚠️ `challengeReps`가 없으면 **누를 수 없게** 문단으로 그린다. 무게를 올린 날에
 * 횟수 도전을 걸지 않기로 한 결정이라(§3.3), 눌러도 아무 일 없는 버튼을 그리면
 * 화면이 거짓말을 한다.
 */
function PreviousLine({
  hint,
  setNumber,
  onChallenge,
}: {
  hint: PreviousHint;
  setNumber: number;
  onChallenge: (reps: number) => void;
}) {
  if (hint.kind === "first") {
    return (
      <p className="mt-2 text-[11.5px] font-bold text-faint">{hint.message}</p>
    );
  }
  return (
    <div className="mt-2">
      <p className="text-[11.5px] font-bold text-muted">
        지난번 {setNumber}세트 ·{" "}
        <span className="font-extrabold text-fg">{hint.amountLabel}</span>
      </p>
      {hint.cheer &&
        (hint.challengeReps !== null ? (
          <button
            type="button"
            onClick={() => onChallenge(hint.challengeReps!)}
            className="mt-1.5 h-8 rounded-card-sm border border-accent bg-accent-weak px-3 text-[11.5px] font-extrabold text-accent"
          >
            {hint.cheer}
          </button>
        ) : (
          <p className="mt-1 text-[11.5px] font-bold text-muted">{hint.cheer}</p>
        ))}
    </div>
  );
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
  lastSetMessage,
  completionMessage,
  paused,
  busy,
  canReplaceExercise,
  previousHint,
  onChallengeReps,
  nextUpHint,
  onNextUpChallengeReps,
  spreadOffer,
  onApplySpread,
  onDismissSpread,
  onChangeAmount,
  onCompleteSet,
  onReplaceExercise,
  onSkipExercise,
  onAdjustRest,
  onPickRestPreset,
  onStartNext,
  onMinimize,
  onCancel,
  onFinish,
  onOpenGuide,
  prescription,
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
  /**
   * 마지막 세트를 **하기 직전**에 띄울 응원 (`lastSetCheer`).
   *
   * ⚠️ `completionMessage.cheer`와 **다른 것**이다. 저건 다 끝낸 뒤의 과거형이고,
   * 이건 아직 안 한 세트 앞에 두는 현재형이다. 하나로 합치지 마라.
   */
  lastSetMessage: string;
  /** 다 끝냈을 때 보여줄 안내 + 응원 (`workoutCompletionMessage`) */
  completionMessage: { headline: string; cheer: string };
  paused: boolean;
  busy: boolean;
  /**
   * 지금 종목을 **다른 종목으로** 바꿀 수 있는가 (`canReplaceExercise`).
   *
   * 완료한 세트가 하나라도 있으면 `false`다 — 기록이 다른 운동 것으로 둔갑한다.
   * 그때는 `바꾸기`를 그리지 않고 `건너뛰기`만 남긴다. 누를 수 없는 버튼을
   * 그려 놓고 토스트로 알리는 것은 화면이 거짓말을 하는 것이다(이 저장소 규약).
   */
  canReplaceExercise: boolean;
  /**
   * 방금 끝낸 세트에서 바꾼 값을 **남은 세트에도 쓸지** 묻는 제안
   * (설계 2026-08-24 §2). 없으면 `null` — 배너를 그리지 않는다.
   *
   * ⚠️ 판정은 `buildSpreadOffer()`가 이미 끝냈다. 여기서 "값이 다른가"를
   * 다시 보지 마라 — 담기 단계에서 일부러 다르게 짠 피라미드 세트를 붙잡는다.
   */
  /**
   * 지금 세트의 **지난번 같은 번호 세트** (설계 2026-08-24 §3).
   *
   * ⚠️ 아직 못 받았을 때도 `null`이다 — 화면은 "없으면 안 그린다"만 하면 된다.
   * 판정·문구·표기는 전부 `previousHintFor()`가 끝냈다. 여기서 짓지 마라.
   */
  previousHint: PreviousHint | null;
  /** `한 번 더` — 지금 세트의 횟수를 지난번+1로 바꾼다 */
  onChallengeReps: (reps: number) => void;
  /** 휴식 화면이 보여줄 **다음 세트**의 지난 기록 */
  nextUpHint: PreviousHint | null;
  /** 휴식 화면의 `한 번 더` — **다음 세트**의 횟수를 바꾼다 */
  onNextUpChallengeReps: (reps: number) => void;
  spreadOffer: SpreadOffer | null;
  onApplySpread: () => void;
  onDismissSpread: () => void;
  onChangeAmount: (key: AmountFieldKey, value: number) => void;
  onCompleteSet: () => void;
  /*
    ⚠️ **`onLoadLast`를 되살리지 마라** (2026-08-24 제거).

    여기 `이전 기록 불러오기` 버튼이 있었는데 **눌러도 아무 일도 일어나지 않았다.**
    부모의 `loadLastExercise()`가 `if (active) return;`으로 시작하는데 이 오버레이는
    `overlayOpen = active && ...`, 즉 **항상 `active`**였다. 토스트조차 없었다.

    운동 중에 이걸 살리는 것도 답이 아니다 — 지금 세트 값을 통째로 덮어써서 이미
    정한 무게가 날아간다. 대신 세트마다 지난 기록을 보여준다(`previousHint`).
    `ExerciseCard`(담기 단계)의 같은 버튼은 `active`가 아니라 정상 동작하므로 그대로 둔다.
  */
  /** 종목 바꾸기 — 부모가 운동 피커를 연다 */
  onReplaceExercise: () => void;
  /** 종목 건너뛰기 — 남은 세트만 지운다(완료분은 남는다) */
  onSkipExercise: () => void;
  onAdjustRest: (deltaSeconds: number) => void;
  onPickRestPreset: (seconds: number) => void;
  onStartNext: () => void;
  onMinimize: () => void;
  onCancel: () => void;
  onFinish: () => void;
  /**
   * 자세 안내 열기 (계획 2026-08-12). 넘기지 않으면 버튼이 안 나온다.
   * 자세가 헷갈리는 순간은 세트 사이라, 준비 화면과 **같은 안내**를 여기서도 연다.
   */
  onOpenGuide?: (name: string) => void;
  /**
   * 지금 종목의 공식 프로그램 처방 (계획 2026-08-12). 일반 운동은 없다.
   * 준비 카드에만 두면 운동을 시작한 뒤에는 목표 범위를 볼 수 없다.
   */
  prescription?: ExercisePrescription;
}) {
  if (!open) return null;

  const resting = mode === "rest";
  // 안내가 있는 종목에만 낸다 — 없는데 내면 눌러도 아무 일 없는 죽은 버튼이다
  const guideName =
    onOpenGuide && exerciseName && guideForExercise(exerciseName) !== null
      ? exerciseName
      : null;
  /** 쉬는 중인데 다음이 없다 = 담은 세트를 전부 끝냈다 */
  const allDone = resting && nextUp === null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex flex-col overflow-y-auto bg-bg/95 px-3 backdrop-blur"
      style={{
        bottom: 0,
        // ⚠️ Tailwind `pt-3`으로 되돌리지 마라 — 설치형 앱에서 첫 줄이 상태바
        //    밑에 깔린다(컴포넌트 주석 참조). 12px는 옛 `pt-3`과 같은 값이다.
        paddingTop: "calc(env(safe-area-inset-top) + 12px)",
      }}
    >
      <div className="mx-auto w-full max-w-[460px] pb-6">
        {/* 최소화·취소는 카드 밖 — 목업의 흐릿한 윗줄 자리.

            ⚠️ **높이 44px(`h-11`)를 줄이지 마라.** 이 둘이 운동 중 오버레이를
            빠져나가는 **유일한 두 문**이고, 화면 맨 위라 상태바에 가장 가깝다.
            32px(`h-8`)이던 것을 2026-08-09에 iOS HIG 최소 터치 타깃인 44px로
            키웠다 — 안전 영역 여백과 같은 신고에서 나왔다. */}
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onMinimize}
            className="h-11 flex-1 rounded-full border border-line bg-surface-2 text-[11px] font-bold text-muted"
          >
            ▾ 최소화
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 flex-none rounded-full px-4 text-[11px] font-bold text-faint disabled:opacity-50"
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
          {!resting && guideName && (
            <button
              type="button"
              onClick={() => onOpenGuide?.(guideName)}
              aria-label={`${guideName} 자세 안내`}
              className="mt-1 text-[11.5px] font-bold text-accent"
            >
              📖 자세 안내
            </button>
          )}

          {/*
            공식 프로그램 목표 (계획 2026-08-12) — 입력·휴식 **양쪽**에 둔다.
            준비 카드에만 있으면 운동을 시작한 뒤로는 목표 회수를 볼 수 없다.
            문구는 `program-load.ts`가 유일한 출처다.
          */}
          {prescription && (
            <p className="mt-2 text-[11.5px] font-extrabold text-accent">
              목표 {repRangeLabel(prescription)} · 휴식{" "}
              {restClock(prescription.restSeconds)}
            </p>
          )}

          {/*
            운동 시간 — 예전 11.5px 알약보다 크게 (사용자 지시 ②).

            ⚠️ **26px을 키우지 마라.** 휴식 화면에서 제일 큰 숫자는 **휴식 타이머와
            남은 세트(둘 다 34px)**이고, 경과 시간이 그만큼 커지면 시선을 뺏는다.

            2026-08-07에는 "제일 큰 숫자는 휴식 시간 하나"였으나, 2026-08-24
            사용자 지시로 **남은 세트를 휴식 타이머와 같은 34px로** 올려 둘이
            동급이 됐다. 셋 중 하나를 바꾸면 나머지도 같이 봐야 한다.
          */}
          <p className="mt-3 text-[11.5px] font-bold text-muted">⏱ 운동 시간</p>
          <p className="font-mono text-[26px] leading-none font-extrabold tracking-tight">
            {elapsedLabel}
          </p>

          {/*
            휴식 중에도 이 종목이 몇 세트 남았는지 말한다 (사용자 지시 ③).
            휴식 화면에서 종목명이 헤드라인에서 빠졌으므로 여기가 그 자리다.

            ⚠️ **`N 세트 남음`이 34px다** (사용자 지시 2026-08-24). 예전에는
            11.5px 보조 문구였고 `1세트 / 3세트`가 강조 자리였다 — 쉬는 동안 제일
            알고 싶은 것은 "앞으로 몇 번 더냐"라는 지시였다. 둘의 크기를 도로
            맞바꾸지 마라. 위 경과 시간 주석도 같이 봐야 한다.

            ⚠️ **다 했을 때는 큰 숫자를 안 낸다.** `0 세트 남음`을 34px로 띄우면
            남은 게 있다는 뜻으로 읽힌다.
          */}
          {resting && !allDone && exerciseName && (
            <div className="mt-3 rounded-card border border-line bg-surface-2 px-4 py-3 text-left">
              <p className="text-[13px] font-extrabold">{exerciseName}</p>
              {setProgress.remaining > 0 ? (
                <p className="mt-1 font-extrabold text-accent">
                  <span className="font-mono text-[34px] leading-none">
                    {setProgress.remaining}
                  </span>
                  <span className="ml-1.5 text-[13px]">세트 남음</span>
                </p>
              ) : (
                <p className="mt-1 text-[15px] font-extrabold text-good">
                  이 종목은 다 했어요
                </p>
              )}
              <p className="mt-1 text-[11.5px] font-bold text-muted">
                {setProgress.done}세트 / {setProgress.total}세트 완료
              </p>
              {guideName && (
                <button
                  type="button"
                  onClick={() => onOpenGuide?.(guideName)}
                  aria-label={`${guideName} 자세 안내`}
                  className="mt-1.5 text-[11.5px] font-bold text-accent"
                >
                  📖 자세 안내
                </button>
              )}
            </div>
          )}

          {/*
            "남은 세트도 이렇게 할까요?" (설계 2026-08-24 §2).

            2026-08-09~2026-08-24 사이에는 스테퍼를 누르는 **즉시** 뒤 세트가
            바뀌고 토스트가 떴다. 사용자 지시로 **묻고 나서** 적용한다.

            ⚠️ **자리를 옮기지 마라.** 종목 블록 바로 아래·구분선 위다. 방금 끝낸
            세트 이야기라 종목 블록과 붙어 있어야 문맥이 맞고, 휴식 타이머 아래로
            내리면 폰 화면에서 `▶ 다음 운동 시작`이 스크롤 밖으로 밀린다.

            ⚠️ **`fields`에 있는 것만 말한다.** `buildSpreadOffer()`가 사용자가
            실제로 건드린 칸만 실어 보낸다 — 무게만 바꿨는데 "12.5kg 10회로
            했어요"라고 하면 `적용하기`가 횟수도 바꿀 것처럼 읽힌다.
          */}
          {resting && !allDone && spreadOffer && (
            <div className="mt-3 rounded-card border border-accent/50 bg-accent-weak px-4 py-3 text-left">
              <p className="text-[12.5px] font-bold text-muted">
                이번 세트는{" "}
                <span className="font-extrabold text-accent">
                  {spreadOffer.fields
                    .map((field) => `${field.value}${field.unit}`)
                    .join(" ")}
                </span>
                로 했어요
              </p>
              <p className="mt-0.5 text-[13px] font-extrabold">
                남은 {spreadOffer.targetCount}세트도 이렇게 할까요?
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={onApplySpread}
                  className="h-10 flex-1 rounded-card-sm bg-accent text-[12.5px] font-extrabold text-accent-ink"
                >
                  적용하기
                </button>
                <button
                  type="button"
                  onClick={onDismissSpread}
                  className="h-10 flex-1 rounded-card-sm border border-line bg-surface text-[12.5px] font-bold text-muted"
                >
                  이번만
                </button>
              </div>
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
                  {/*
                    지난번 ↔ 오늘 (설계 2026-08-24 §3.4, 사용자 목업).

                    ⚠️ **`오늘` 칩은 다음 세트에 실제로 담긴 값이다.** 도전 횟수를
                    미리 채워 넣지 마라 — 칩이 실제 값과 다른 말을 하게 된다.
                    바꾸는 것은 아래 `한 번 더`를 눌렀을 때뿐이다.

                    ⚠️ 지난 기록이 없으면 칩을 **하나만** 그린다. 라벨 없이 —
                    비교 대상이 없는데 `오늘`이라고 쓰면 짝이 없는 이름이 된다.
                  */}
                  {nextUpHint?.kind === "set" ? (
                    <div className="mt-2 flex items-stretch justify-center gap-2">
                      <div className="flex-1 rounded-card border border-line bg-surface-2 px-3 py-2">
                        <p className="text-[11px] font-bold text-muted">
                          지난번
                        </p>
                        <p className="mt-0.5 font-mono text-[15px] font-extrabold text-muted">
                          {nextUpHint.amountLabel}
                        </p>
                      </div>
                      <div className="flex-1 rounded-card border border-accent bg-accent-weak px-3 py-2">
                        <p className="text-[11px] font-bold text-accent">오늘</p>
                        <p className="mt-0.5 font-mono text-[15px] font-extrabold text-accent">
                          {nextUp.amount}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 inline-block rounded-card border border-line bg-surface-2 px-4 py-2 font-mono text-base font-extrabold">
                      {nextUp.amount}
                    </p>
                  )}
                  {nextUpHint?.kind === "set" &&
                    nextUpHint.cheer &&
                    (nextUpHint.challengeReps !== null ? (
                      <button
                        type="button"
                        onClick={() =>
                          onNextUpChallengeReps(nextUpHint.challengeReps!)
                        }
                        className="mt-2.5 h-10 w-full rounded-card-sm border border-accent bg-accent-weak text-[12.5px] font-extrabold text-accent"
                      >
                        {nextUpHint.cheer}
                      </button>
                    ) : (
                      <p className="mt-2 text-[11.5px] font-bold text-muted">
                        {nextUpHint.cheer}
                      </p>
                    ))}
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
              {/*
                마지막 세트 안내 + 응원 (2026-08-09 사용자 지시
                "치얼업 메시지 운동중 세션 마지막 세트에 나타나게").

                ⚠️ **알약과 응원은 둘 다 필요하다.** 알약은 사실("마지막이다"),
                응원은 감정이다. 응원이 알약을 대체하면 몇 세트 남았는지가 사라지고,
                알약만 두면 정작 제일 힘든 순간에 응원이 없다 — 2026-08-04부터
                2026-08-09까지 그 상태였다(응원이 완료 화면에만 있었다).
              */}
              {isLastPendingSet && (
                <div className="mt-2">
                  <p className="inline-flex items-center gap-1 rounded-full bg-good-weak px-3 py-1 text-[11.5px] font-extrabold text-good">
                    {/* 옛 표기는 `🏁`였다 (2026-08-07 2차 시안으로 교체) */}
                    <UiIcon name="finish" size={14} />
                    마지막 세트예요 — 이것만 하면 오늘 몫 끝!
                  </p>
                  <p className="mt-2 text-[12.5px] leading-5 font-bold text-muted">
                    {lastSetMessage}
                  </p>
                </div>
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

              {/*
                지난번 기록 (설계 2026-08-24 §3.5).

                ⚠️ **휴식 화면에만 두지 마라.** 종목의 **첫 세트 앞에는 휴식
                화면이 없다** — 무게를 정하는 가장 중요한 순간이 빈다.
                여기는 이미 붐비므로 한 줄로만 낸다.
              */}
              {previousHint && (
                <PreviousLine
                  hint={previousHint}
                  setNumber={setPosition.index + 1}
                  onChallenge={onChallengeReps}
                />
              )}

              <button
                type="button"
                onClick={onCompleteSet}
                disabled={busy}
                className="mt-5 h-13 w-full rounded-card border-2 border-accent bg-transparent py-3.5 text-sm font-extrabold text-accent disabled:opacity-60"
              >
                ✓ 운동 완료
              </button>

              {/*
                운동 중 종목 손보기 (2026-08-09 사용자 지시 "운동 중 운동 교체 혹은
                취소 하기").

                ⚠️ **이 줄을 빼지 마라.** 오버레이가 열려 있으면 `ExerciseCard`가
                렌더되지 않아(`record/page.tsx`의 `{!overlayOpen && exerciseCards}`)
                종목을 손댈 다른 경로가 **하나도 없다.** 접기까지 상태바에 가려
                안 눌리던 탓에 운동 중에는 아무것도 못 바꾸는 상태였다.

                ⚠️ `바꾸기`는 완료한 세트가 없을 때만 그린다(`canReplaceExercise`).
                기록이 있는 종목을 바꾸면 그 기록이 다른 운동 것으로 둔갑한다 —
                그 경우엔 `건너뛰기`가 답이다(완료분을 보존한다).
              */}
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                {canReplaceExercise && (
                  <button
                    type="button"
                    onClick={onReplaceExercise}
                    disabled={busy}
                    className="h-11 flex-1 rounded-card-sm border border-line bg-surface-2 text-[12px] font-bold text-muted disabled:opacity-50"
                  >
                    ⇄ 운동 바꾸기
                  </button>
                )}
                {/* ⚠️ 문구를 '건너뛰기'로만 줄이지 마라. 이 버튼은 종목을 **오늘
                    기록에서 통째로 뺀다**(사용자 결정 2026-08-09) — 완료한 세트도
                    같이 사라진다. 무엇이 없어지는지 버튼이 말해야 한다.
                    완료분이 있으면 `handleSkipExercise`가 한 번 더 묻는다. */}
                <button
                  type="button"
                  onClick={onSkipExercise}
                  disabled={busy}
                  className="h-11 flex-1 rounded-card-sm border border-line bg-surface-2 text-[12px] font-bold text-muted disabled:opacity-50"
                >
                  ↷ 이 종목 빼기
                </button>
              </div>
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
