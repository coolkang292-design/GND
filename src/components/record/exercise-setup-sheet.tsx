"use client";

import { useState } from "react";
import {
  defaultSetupPlan,
  isTimeMeasured,
  summarizePlan,
  type SetupPlan,
} from "@/lib/domain/recommended-sets";
import type { CatalogExercise } from "@/lib/types";

export type SetupEntry = { item: CatalogExercise; plan: SetupPlan };

/** 고른 종목들로 초기 설정값을 만든다 (기본 3세트 · 10회 · 무게 운동 중 입력) */
export function initialSetupEntries(
  items: readonly CatalogExercise[],
): SetupEntry[] {
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
}: {
  entries: SetupEntry[];
  onChange: (index: number, plan: SetupPlan) => void;
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  // 펼쳐서 조절 중인 행 — 기본은 전부 접혀 있다(값이 이미 맞으면 안 눌러도 된다)
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="추천 운동으로 돌아가기"
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">세트와 횟수 설정</p>
          <p className="text-[11.5px] text-muted">
            그대로 두고 바로 추가해도 괜찮아요
          </p>
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
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-2 text-left"
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

              {open && (
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  <Stepper
                    label="세트"
                    value={plan.sets}
                    suffix="세트"
                    onStep={(d) =>
                      patch({ sets: Math.min(10, Math.max(1, plan.sets + d)) })
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
                            timed ? 60 : 100,
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
                                weightKg: Math.min(300, plan.weightKg + 5),
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

      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || entries.length === 0}
        className="mt-2 h-12 w-full flex-none rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
      >
        {busy ? "추가하는 중…" : `운동 ${entries.length}개 추가하기`}
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
