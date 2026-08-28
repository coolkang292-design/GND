"use client";

import { useState } from "react";
import {
  defaultSetupPlan,
  isTimeMeasured,
  summarizePlan,
  type SetupItem,
  type SetupPlan,
} from "@/lib/domain/recommended-sets";
import type { CatalogExercise } from "@/lib/types";

/**
 * 종목 타입을 열어 둔다 (2026-08-28).
 *
 * 추천 경로는 `CatalogExercise`를 그대로 넘기고, 예정표 편집은 계획에 적힌
 * 이름·유형만으로 만든 `SetupItem`을 넘긴다. 이 화면이 실제로 읽는 것은
 * `id`·`name`·`exercise_type`·`measure` 넷뿐이라 둘 다 그린다.
 */
export type SetupEntry<T extends SetupItem = SetupItem> = {
  item: T;
  plan: SetupPlan;
};

/** 고른 종목들로 초기 설정값을 만든다 (기본 3세트 · 10회 · 무게 운동 중 입력) */
export function initialSetupEntries(
  items: readonly CatalogExercise[],
): SetupEntry<CatalogExercise>[] {
  return items.map((item) => ({
    item,
    plan: defaultSetupPlan(item.exercise_type, item.measure),
  }));
}

/**
 * 고른 N개의 세트·목표·무게를 한 화면에서 정한다 (설계 2026-08-06 결정 ⑤).
 *
 * **종목마다 시트를 열지 않는다.** 화면이 "처음엔 3개만 골라도 충분해요"라고
 * 권하는데 3개를 담으려고 시트를 세 번 열고 세 번 닫게 하면 화면이 스스로와
 * 모순된다. 기본값이 이미 3세트·10회·운동 중 입력이므로 대부분은 이 화면을
 * **읽고 지나간다** — 조절은 예외 경로다.
 */
export function ExerciseSetupSheet({
  entries,
  onChange,
  onBack,
  onConfirm,
  busy = false,
  title = "세트와 횟수 설정",
  subtitle = "그대로 두고 바로 추가해도 괜찮아요",
  backLabel = "추천 운동으로 돌아가기",
  confirmLabel,
  busyLabel = "추가하는 중…",
  onRemove,
  onAdd,
  addLabel = "＋ 종목 추가",
  maxSets = 10,
}: {
  entries: readonly SetupEntry[];
  onChange: (index: number, plan: SetupPlan) => void;
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
  /*
    ── 아래는 전부 선택이다. 하나도 안 넘기면 추천 경로의 화면 그대로다. ──
    예정표 편집(2026-08-28)이 이 화면을 빌려 쓰려고 연 자리다. 편집기를 따로
    만들면 무게의 「운동 중 입력」 같은 규칙이 두 벌로 갈라진다.
  */
  title?: string;
  subtitle?: string;
  backLabel?: string;
  /** 기본은 "운동 N개 추가하기" */
  confirmLabel?: string;
  busyLabel?: string;
  /** 넘기면 줄마다 빼기(×)가 나온다 */
  onRemove?: (index: number) => void;
  /** 넘기면 목록 아래에 종목 추가 버튼이 나온다 */
  onAdd?: () => void;
  addLabel?: string;
  /**
   * 세트 상한. 추천 경로는 10이면 충분하지만 예정표에는 그보다 많은 세트가
   * 이미 들어 있을 수 있다(지난 기록 복사·루틴). 그때 10으로 묶으면 `＋`를
   * 눌렀는데 12세트가 10세트로 **줄어든다**.
   */
  maxSets?: number;
}) {
  // 펼쳐서 조절 중인 행 — 기본은 전부 접혀 있다(값이 이미 맞으면 안 눌러도 된다)
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{title}</p>
          <p className="text-[11.5px] text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry, index) => {
          const { item, plan } = entry;
          const timed = isTimeMeasured(item.exercise_type, item.measure);
          const isCardio = item.exercise_type === "cardio";
          const isWeight = item.exercise_type === "weight";
          const open = openIndex === index;
          const patch = (next: Partial<SetupPlan>) =>
            onChange(index, { ...plan, ...next });

          return (
            <div
              key={item.id}
              className="mb-2 rounded-card border border-line bg-surface-2 p-3"
            >
              {/*
                빼기(×)는 토글 버튼의 **형제**다. 안에 넣으면 버튼 안의 버튼이
                되어 눌리는 곳이 겹친다 (달력 요약 줄과 같은 규칙).
              */}
              <div className="flex w-full items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : index)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {summarizePlan(item.exercise_type, item.measure, plan)}
                    </span>
                  </span>
                  <span className="flex-none text-xs font-bold text-accent">
                    {open ? "접기" : "조절"}
                  </span>
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      // 지운 줄보다 뒤가 당겨지므로 펼침 상태를 접는다 — 안
                      // 접으면 엉뚱한 종목의 조절이 열린 채로 남는다
                      setOpenIndex(null);
                      onRemove(index);
                    }}
                    aria-label={`${item.name} 빼기`}
                    className="h-8 w-8 flex-none rounded-full border border-line bg-surface text-sm font-bold text-muted"
                  >
                    ×
                  </button>
                )}
              </div>

              {open && (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  <Stepper
                    label="세트"
                    value={plan.sets}
                    suffix="세트"
                    onStep={(d) =>
                      patch({
                        sets: Math.min(
                          // 이미 상한을 넘겨 담긴 계획을 ＋ 한 번에 깎지 않는다
                          Math.max(maxSets, plan.sets),
                          Math.max(1, plan.sets + d),
                        ),
                      })
                    }
                  />
                  {!isCardio && (
                    <Stepper
                      label={timed ? "목표 시간" : "목표 횟수"}
                      value={plan.amount}
                      suffix={timed ? "분" : "회"}
                      onStep={(d) =>
                        patch({
                          amount: Math.min(
                            Math.max(timed ? 60 : 100, plan.amount),
                            Math.max(1, plan.amount + d),
                          ),
                        })
                      }
                    />
                  )}
                  {isWeight && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-muted">무게</span>
                      {plan.weightKg > 0 ? (
                        <span className="flex items-center gap-2">
                          <StepButton
                            label="무게 5kg 줄이기"
                            onClick={() =>
                              patch({ weightKg: Math.max(0, plan.weightKg - 5) })
                            }
                          >
                            –
                          </StepButton>
                          <span className="w-16 text-center font-mono text-sm font-extrabold">
                            {plan.weightKg}kg
                          </span>
                          <StepButton
                            label="무게 5kg 늘리기"
                            onClick={() =>
                              patch({
                                weightKg: Math.min(
                                  Math.max(300, plan.weightKg),
                                  plan.weightKg + 5,
                                ),
                              })
                            }
                          >
                            ＋
                          </StepButton>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => patch({ weightKg: 20 })}
                          className="rounded-card-sm border border-line bg-surface px-3 py-1.5 text-xs font-bold text-accent"
                        >
                          운동 중 입력 · 지금 정하기
                        </button>
                      )}
                    </div>
                  )}
                  {isWeight && plan.weightKg > 0 && (
                    <button
                      type="button"
                      onClick={() => patch({ weightKg: 0 })}
                      className="self-end text-[11px] font-bold text-muted underline"
                    >
                      운동 중에 입력할래요
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className="mt-2 h-11 w-full flex-none rounded-card-sm border border-accent bg-surface text-sm font-extrabold text-accent disabled:opacity-40"
        >
          {addLabel}
        </button>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || entries.length === 0}
        className="mt-2 h-12 w-full flex-none rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
      >
        {busy
          ? busyLabel
          : (confirmLabel ?? `운동 ${entries.length}개 추가하기`)}
      </button>
    </div>
  );
}

function Stepper({
  label,
  value,
  suffix,
  onStep,
}: {
  label: string;
  value: number;
  suffix: string;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <StepButton label={`${label} 줄이기`} onClick={() => onStep(-1)}>
          –
        </StepButton>
        <span className="w-16 text-center font-mono text-sm font-extrabold">
          {value}
          {suffix}
        </span>
        <StepButton label={`${label} 늘리기`} onClick={() => onStep(1)}>
          ＋
        </StepButton>
      </span>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-9 w-9 flex-none rounded-full border border-line bg-surface text-lg font-bold"
    >
      {children}
    </button>
  );
}
