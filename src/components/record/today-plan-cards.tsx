"use client";

import { Icon } from "@/components/ui/icon";
import { isGeneralPlan } from "@/lib/domain/day-plan";
import { intervalPlanLine } from "@/lib/domain/tabata";
import type { WorkoutPlan } from "@/lib/workout-plan";

/**
 * 운동 탭의 오늘 인터벌·프로그램 회차 카드 (사용자 결정 2026-10-13).
 *
 * 일반 계획은 운동 목록 자체가 그 계획이라 카드를 그리지 않는다. 인터벌(4·8·16분
 * 코스)과 프로그램 회차(회차 진행률)는 구조가 달라 일반 계획에 합칠 수 없어서,
 * 달력과 **같은 단위로** 여기에 카드로 보인다. 예전엔 첫 인터벌 하나만 보였고
 * 프로그램 회차는 목록에 자동으로 담겼다.
 *
 * ⚠️ 누르면 인터벌은 시트를 연다(바로 시작 안 함, 2026-08-25). 프로그램은 달력의
 *    `운동 시작하기`와 같이 바로 시작한다 — 고르는 것은 부르는 쪽(`onStart`)이 한다.
 */
export function TodayPlanCards({
  plans,
  disabled,
  onStart,
}: {
  plans: WorkoutPlan[];
  disabled: boolean;
  onStart: (plan: WorkoutPlan) => void;
}) {
  const special = plans.filter((plan) => !isGeneralPlan(plan));
  if (special.length === 0) return null;
  return (
    <>
      {special.map((plan) => {
        const interval = Boolean(plan.tabataMinutes);
        const names = plan.exercises.map((item) => item.name);
        return (
          <button
            key={plan.id}
            type="button"
            data-testid={interval ? "today-interval-start" : "today-program-start"}
            disabled={disabled}
            onClick={() => onStart(plan)}
            className="mb-3 flex w-full items-center justify-between gap-3 rounded-card border border-accent/55 bg-surface px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-black text-text">
                {interval && <Icon name="interval" size={17} className="text-accent" />}
                {interval ? "오늘은 전신 인터벌이에요" : (plan.title ?? "오늘 프로그램 회차")}
              </span>
              {/* break-keep: 375px에서 단어 중간이 끊겼다 (2026-09-29) */}
              <span className="mt-0.5 block break-keep text-[11.5px] leading-4 text-muted">
                {interval ? intervalPlanLine(names) : names.join(" · ")}
              </span>
            </span>
            <span className="flex-none text-xs font-extrabold text-accent">
              시작하기
            </span>
          </button>
        );
      })}
    </>
  );
}
