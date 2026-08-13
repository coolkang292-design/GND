"use client";

import { useState } from "react";
import { NumberField } from "@/components/challenge/number-field";
import {
  perDayFromTotal,
  roundTarget,
  totalDaysFromPerWeek,
  totalFromPerDay,
} from "@/lib/domain/challenge-goal-calc";
import type { GoalType } from "@/lib/domain/goal-score";
import { GOAL_TYPE_META, goalLabel, type GoalCategory } from "@/lib/challenge";

const CATEGORIES: { key: GoalCategory; label: string }[] = [
  { key: "weight", label: "웨이트" },
  { key: "cardio", label: "유산소" },
  { key: "bodyweight", label: "맨몸" },
];

/** 카테고리별 선택 가능한 지표 (레거시 volume 제외) */
export const CATEGORY_TYPES: Record<GoalCategory, GoalType[]> = {
  weight: ["weight_reps", "weight_days"],
  cardio: ["cardio_distance", "cardio_time"],
  bodyweight: ["bodyweight_reps", "bodyweight_time", "bodyweight_days", "tabata_count"],
};

/** 지표 짧은 라벨 (카테고리 우선 UI용) */
const METRIC_LABEL: Record<GoalType, string> = {
  weight_reps: "횟수",
  weight_days: "운동일(종목)",
  cardio_distance: "거리",
  cardio_time: "시간",
  bodyweight_reps: "횟수",
  bodyweight_time: "시간",
  bodyweight_days: "운동일(종목)",
  tabata_count: "전신 인터벌",
  volume: "총볼륨",
};

const DAYS_TYPES: GoalType[] = ["weight_days", "bodyweight_days"];
export const isDaysType = (t: GoalType) => DAYS_TYPES.includes(t);

/**
 * 목표 카드 한 장 — **달성률(종합 80%) 재료만** 담는다.
 *
 * ⚠️⚠️ `calcDaysPerWeek`는 "이 종목을 주 며칠 할 것인가"이고 **참여율 분모가
 * 아니다.** 참여율은 시트의 `② 참여 계획` 하나에서만 온다. 2026-08-14 이전에는
 * 둘이 한 화면에 섞여 있어서 사람도 코드도 헷갈렸다(설계 §1).
 */
export type GoalRow = {
  category: GoalCategory;
  type: GoalType;
  /** 기간 총 목표 — DB에 저장되는 값 */
  total: number;
  /**
   * 하루 목표 — **기준점**이다. 일수형이면 0.
   *
   * ⚠️ 파생값으로 만들지 마라 (2026-08-14 신고로 되돌린 설계). 처음에는
   * `total`만 들고 `perDay`를 매번 역산했는데, 그러면 **기간을 바꿨을 때
   * 총 목표를 그대로 두고 하루 목표를 조용히 깎게 된다.** 사용자가 직접 정한
   * 것은 하루 기준이므로 그쪽이 남고 총 목표가 따라와야 한다.
   */
  perDay: number;
  /** 계산기 전용. 저장되지 않는다 */
  calcDaysPerWeek: number;
  /** 일수형: 하루 최소 종목 수. 아니면 0 */
  qualifier: number;
};

/** 기간이 바뀌었을 때 그 행의 총 목표를 다시 계산한다 (하루 기준·주 며칠은 유지) */
export function recalcTotal(row: GoalRow, periodDays: number): number {
  return isDaysType(row.type)
    ? totalDaysFromPerWeek(row.calcDaysPerWeek, periodDays)
    : roundTarget(
        totalFromPerDay(row.perDay, row.calcDaysPerWeek, periodDays),
        GOAL_TYPE_META[row.type].unit,
      );
}

/** 지표를 갈아탈 때의 기본값 한 벌 — 카테고리 버튼과 select가 같이 쓴다 */
export function rowDefaultsFor(
  type: GoalType,
  calcDaysPerWeek: number,
  periodDays: number,
  keepQualifier = 0,
): Pick<GoalRow, "type" | "total" | "perDay" | "qualifier"> {
  const total = GOAL_TYPE_META[type].defaultTarget;
  return {
    type,
    total,
    perDay: isDaysType(type)
      ? 0
      : perDayFromTotal(total, calcDaysPerWeek, periodDays),
    qualifier: isDaysType(type) ? keepQualifier || 3 : 0,
  };
}

export function GoalCard({
  index,
  row,
  periodDays,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  row: GoalRow;
  periodDays: number;
  canRemove: boolean;
  onChange: (patch: Partial<GoalRow>) => void;
  onRemove: () => void;
}) {
  /**
   * 기본 **펼침**이다 (2026-08-14 사용자 지시 — *"목표를 설정할 때 하루 기준으로
   * 설정하고 자동 계산이 되게"*). 총량(300회·20km)은 감이 잘 안 오지만
   * "하루 30회 · 주 3일"은 바로 정할 수 있다. 접는 버튼은 남겨 둔다.
   */
  const [calcOpen, setCalcOpen] = useState(true);
  const meta = GOAL_TYPE_META[row.type];
  const days = isDaysType(row.type);
  const weeks = periodDays / 7;
  const perDay = row.perDay;

  const metricOptions = CATEGORY_TYPES[row.category].includes(row.type)
    ? CATEGORY_TYPES[row.category]
    : [...CATEGORY_TYPES[row.category], row.type];

  function changeDaysPerWeek(next: number) {
    const dpw = Math.min(7, Math.max(1, next));
    onChange({
      calcDaysPerWeek: dpw,
      total: days
        ? totalDaysFromPerWeek(dpw, periodDays)
        : roundTarget(totalFromPerDay(perDay, dpw, periodDays), meta.unit),
    });
  }

  return (
    <div className="mt-2 rounded-card-sm border border-line bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-muted">목표 {index + 1}</label>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`목표 ${index + 1} 삭제`}
          className="grid h-7 w-7 place-items-center rounded-card-sm border border-line bg-surface text-xs disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      {/* 카테고리 3버튼 — 시안의 아이콘 자산이 아직 없어 글자만 (설계 §8) */}
      <div className="mt-1 flex gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() =>
              onChange({
                category: c.key,
                ...rowDefaultsFor(
                  CATEGORY_TYPES[c.key][0],
                  row.calcDaysPerWeek,
                  periodDays,
                ),
              })
            }
            className={`h-9 flex-1 rounded-[8px] text-[12.5px] font-bold ${
              row.category === c.key ? "bg-accent-weak text-accent" : "text-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <select
        value={row.type}
        aria-label={`목표 ${index + 1} 지표`}
        onChange={(e) =>
          onChange(
            rowDefaultsFor(
              e.target.value as GoalType,
              row.calcDaysPerWeek,
              periodDays,
              row.qualifier,
            ),
          )
        }
        className="mt-2 h-11 w-full rounded-card-sm border border-line bg-surface px-2 text-sm font-bold"
      >
        {metricOptions.map((t) => (
          <option key={t} value={t}>
            {METRIC_LABEL[t]}
          </option>
        ))}
      </select>

      <label className="mt-2 block text-[12px] font-bold text-muted">
        기간 총 목표 ({meta.unit})
      </label>
      {/* 총 목표를 직접 고치면 하루 기준을 역산해 둔다 — 그래야 다음에 기간이
          바뀌었을 때 방금 정한 강도가 유지된다 */}
      <NumberField
        ariaLabel={`기간 총 목표 (${meta.unit})`}
        value={row.total}
        onValue={(v) =>
          onChange({
            total: v,
            perDay: days ? 0 : perDayFromTotal(v, row.calcDaysPerWeek, periodDays),
          })
        }
        className="mt-1"
      />
      <p className="mt-1 text-right text-[12px] font-bold text-accent">
        → 기간 목표{" "}
        <span className="font-mono">
          {row.total.toLocaleString()}
          {meta.unit}
        </span>
      </p>

      {/* 접히는 계산기 — 총 목표를 정하는 감이 필요할 때만 편다 (설계 §4.2) */}
      {/* ⚠️ `aria-label`을 지우지 마라. 화살표와 문구가 별개 텍스트 노드라
          `getByText("하루 기준으로 계산하기")`로는 안 잡힌다 — 테스트가 이걸로 연다 */}
      <button
        aria-label="하루 기준으로 계산하기"
        onClick={() => setCalcOpen((v) => !v)}
        className="mt-1.5 text-[12px] font-bold text-muted"
      >
        {calcOpen ? "▾" : "▸"} 하루 기준으로 계산하기
      </button>

      {calcOpen && (
        <div className="mt-1.5 rounded-card-sm border border-line bg-surface-2 p-2">
          <div className="flex items-end gap-2">
            {!days && (
              <div className="flex-1">
                <label className="text-[12px] font-bold text-muted">
                  하루 목표 ({meta.unit})
                </label>
                <NumberField
                  ariaLabel={`하루 목표 (${meta.unit})`}
                  value={perDay}
                  onValue={(v) =>
                    onChange({
                      perDay: v,
                      total: roundTarget(
                        totalFromPerDay(v, row.calcDaysPerWeek, periodDays),
                        meta.unit,
                      ),
                    })
                  }
                  className="mt-1 bg-surface"
                />
              </div>
            )}
            <div className="flex-1">
              <label className="text-[12px] font-bold text-muted">주 며칠</label>
              <div className="mt-1 flex h-11 items-center justify-between rounded-card-sm border border-line bg-surface px-1.5">
                <button
                  aria-label="주 며칠 줄이기"
                  onClick={() => changeDaysPerWeek(row.calcDaysPerWeek - 1)}
                  className="h-8 w-8 rounded-full text-base font-bold"
                >
                  –
                </button>
                <span className="font-mono text-sm font-extrabold">
                  {row.calcDaysPerWeek}일
                </span>
                <button
                  aria-label="주 며칠 늘리기"
                  onClick={() => changeDaysPerWeek(row.calcDaysPerWeek + 1)}
                  className="h-8 w-8 rounded-full text-base font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {days
              ? `주 ${row.calcDaysPerWeek}일 × ${weeks.toFixed(1)}주 = ${row.total}일`
              : `${perDay}${meta.unit} × 주 ${row.calcDaysPerWeek}일 × ${weeks.toFixed(1)}주`}
            {" · "}이 값은 총 목표를 정하는 데만 써요 (참여율과 무관)
          </p>
        </div>
      )}

      {days && (
        <div className="mt-2 rounded-card-sm border border-line bg-surface-2 p-2">
          <label className="text-[12px] font-bold text-muted">
            하루 최소 종목 수 — 이만큼 완료한 날만 인정
          </label>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[12.5px] font-bold">
              {goalLabel(row.type, row.qualifier)}
            </span>
            <div className="flex items-center gap-2">
              <button
                aria-label="하루 최소 종목 수 줄이기"
                onClick={() => onChange({ qualifier: Math.max(1, row.qualifier - 1) })}
                className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
              >
                –
              </button>
              <span className="w-14 text-center font-mono text-sm font-extrabold">
                {row.qualifier}종목+
              </span>
              <button
                aria-label="하루 최소 종목 수 늘리기"
                onClick={() => onChange({ qualifier: Math.min(7, row.qualifier + 1) })}
                className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
