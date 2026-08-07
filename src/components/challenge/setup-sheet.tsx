"use client";

import { useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import type { GoalType } from "@/lib/domain/goal-score";
import {
  GOAL_TYPE_META,
  goalLabel,
  type GoalCategory,
  type GoalDraft,
} from "@/lib/challenge";

const CATEGORIES: { key: GoalCategory; label: string }[] = [
  { key: "weight", label: "웨이트" },
  { key: "cardio", label: "유산소" },
  { key: "bodyweight", label: "맨몸" },
];

/** 카테고리별 선택 가능한 지표 (레거시 volume 제외) */
const CATEGORY_TYPES: Record<GoalCategory, GoalType[]> = {
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
  tabata_count: "타바타",
  volume: "총볼륨",
};

const DAYS_TYPES: GoalType[] = ["weight_days", "bodyweight_days"];
const isDays = (t: GoalType) => DAYS_TYPES.includes(t);

/** 하루 기준 입력 기본값 (일수형 제외) */
const PER_DAY_DEFAULT: Partial<Record<GoalType, number>> = {
  weight_reps: 30,
  cardio_distance: 5,
  cardio_time: 30,
  bodyweight_reps: 30,
  bodyweight_time: 10,
  tabata_count: 1,
};

export type SetupSubmit = {
  name: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
  plannedDays: number;
};

type GoalRow = {
  category: GoalCategory;
  type: GoalType;
  daysPerWeek: number;
  perDay: number;
  directTarget: number;
  qualifier: number; // 일수형: 하루 최소 종목 수
};

function periodDaysOf(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  const diff = Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 28;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 총량 → 하루 기준 역산 (모드 전환 시 값 보존) */
function rowFromTarget(
  type: GoalType,
  target: number,
  plannedDays: number,
  periodDays: number,
  qualifier?: number | null,
): GoalRow {
  const daysPerWeek = Math.min(
    7,
    Math.max(
      1,
      isDays(type)
        ? Math.round((target * 7) / periodDays) || plannedDays
        : plannedDays,
    ),
  );
  return {
    category: GOAL_TYPE_META[type].category,
    type,
    daysPerWeek,
    perDay: isDays(type)
      ? 0
      : round1((target * 7) / (daysPerWeek * periodDays)) ||
        PER_DAY_DEFAULT[type] ||
        1,
    directTarget: target,
    qualifier: isDays(type) ? (qualifier ?? 3) : 0,
  };
}

export function ChallengeSetupSheet({
  mode,
  defaults,
  prevGoals,
  periodDaysFixed,
  busy,
  onSubmit,
  onClose,
}: {
  mode: "create" | "goals";
  defaults: SetupSubmit;
  prevGoals: GoalDraft[] | null;
  periodDaysFixed?: number;
  busy: boolean;
  onSubmit: (value: SetupSubmit) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [plannedDays, setPlannedDays] = useState(defaults.plannedDays);
  const [inputMode, setInputMode] = useState<"auto" | "direct">("auto");
  const [notice, setNotice] = useState<string | null>(null);

  const periodDays =
    mode === "create"
      ? periodDaysOf(startDate, endDate)
      : (periodDaysFixed ?? periodDaysOf(startDate, endDate));

  const [rows, setRows] = useState<GoalRow[]>(() =>
    defaults.goals.map((g) =>
      rowFromTarget(g.type, g.target, defaults.plannedDays, periodDays, g.qualifier),
    ),
  );

  const weeks = periodDays / 7;

  function totalOf(row: GoalRow): number {
    if (inputMode === "direct") return row.directTarget;
    if (isDays(row.type)) {
      return Math.max(1, Math.round(row.daysPerWeek * weeks));
    }
    return round1(row.perDay * row.daysPerWeek * weeks);
  }

  function updateRow(i: number, patch: Partial<GoalRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function changeCategory(i: number, category: GoalCategory) {
    const type = CATEGORY_TYPES[category][0];
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              category,
              type,
              daysPerWeek: r.daysPerWeek || plannedDays,
              perDay: PER_DAY_DEFAULT[type] ?? 0,
              directTarget: GOAL_TYPE_META[type].defaultTarget,
              qualifier: isDays(type) ? 3 : 0,
            }
          : r,
      ),
    );
  }

  function changeMetric(i: number, type: GoalType) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              ...r,
              type,
              perDay: PER_DAY_DEFAULT[type] ?? r.perDay,
              directTarget: GOAL_TYPE_META[type].defaultTarget,
              qualifier: isDays(type) ? r.qualifier || 3 : 0,
            }
          : r,
      ),
    );
  }

  function addRow() {
    const type: GoalType = "weight_reps";
    setRows((rs) => [
      ...rs,
      {
        category: "weight",
        type,
        daysPerWeek: plannedDays,
        perDay: PER_DAY_DEFAULT[type] ?? 0,
        directTarget: GOAL_TYPE_META[type].defaultTarget,
        qualifier: 0,
      },
    ]);
  }

  function removeRow(i: number) {
    if (rows.length > 1) setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function loadPrev() {
    if (!prevGoals || prevGoals.length === 0) return;
    setRows(
      prevGoals.map((g) =>
        rowFromTarget(g.type, g.target, plannedDays, periodDays, g.qualifier),
      ),
    );
    setNotice("지난 챌린지 KPI를 불러왔어요 · 숫자만 수정하세요 ↺");
  }

  function submit() {
    if (mode === "create") {
      if (!name.trim()) {
        setNotice("챌린지 이름을 입력하세요");
        return;
      }
      if (!startDate || !endDate || startDate > endDate) {
        setNotice("기간을 확인하세요 (시작일 ≤ 종료일)");
        return;
      }
    }
    const types = rows.map((r) => r.type);
    if (new Set(types).size !== types.length) {
      setNotice("같은 지표의 목표가 두 개 있어요 — 하나로 합쳐주세요");
      return;
    }
    const goals: GoalDraft[] = rows.map((r) => ({
      type: r.type,
      target: totalOf(r),
      qualifier: isDays(r.type) ? r.qualifier : undefined,
    }));
    if (goals.some((g) => !(g.target > 0))) {
      setNotice("목표값은 0보다 커야 해요");
      return;
    }
    onSubmit({ name: name.trim(), startDate, endDate, goals, plannedDays });
  }

  return (
    <>
      <button
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[20px] border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {/* 옛 표기는 `🎯`였다 (2026-08-07 2차 시안으로 교체) */}
        <h3 className="flex items-center gap-1.5 text-base font-extrabold">
          {mode === "create" ? (
            "새 챌린지 만들기"
          ) : (
            <>
              <UiIcon name="goal" size={20} />내 목표 (KPI) 설정
            </>
          )}
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          카테고리(웨이트·유산소·맨몸)를 고르고 지표를 정하면, 종류가 달라도
          &lsquo;내 목표 대비 %&rsquo;로 공평하게 점수화해요.
        </p>

        <div className="mt-3 flex-1 overflow-y-auto">
          {mode === "create" && (
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <label className="text-[11px] font-bold text-muted">
                챌린지 이름
              </label>
              <input
                autoFocus
                placeholder="챌린지 이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm font-bold"
              />
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-right text-[11px] text-muted">
                기간 {periodDays}일 ({weeks.toFixed(1)}주)
              </p>
              <p className="mt-2 flex items-center gap-1.5 rounded-card-sm bg-accent/10 px-3 py-2 text-[11.5px] font-bold text-accent">
                <UiIcon name="camera" size={15} />이 챌린지는 사진 인증한 운동만
                집계돼요
              </p>
            </div>
          )}

          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-extrabold">
                <UiIcon name="goal" size={17} />내 목표 (KPI)
              </p>
              <div className="flex gap-1.5">
                {prevGoals && prevGoals.length > 0 && (
                  <button
                    onClick={loadPrev}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold"
                  >
                    ↺ 지난 KPI
                  </button>
                )}
                <button
                  onClick={addRow}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-accent"
                >
                  + 목표
                </button>
              </div>
            </div>

            <p className="mt-1.5 text-[11px] text-muted">
              💡 목표를 여러 개 걸고 <b className="text-accent">달성</b>하면
              종합점수에 보너스가 붙어요 (완료 1개당 +3점, 최대 3개).
            </p>

            <div className="mt-2 flex gap-1 rounded-card-sm border border-line bg-surface p-1">
              {(
                [
                  ["auto", "하루 기준 계산"],
                  ["direct", "총량 직접 입력"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setInputMode(m)}
                  className={`h-8 flex-1 rounded-[8px] text-[11.5px] font-bold ${
                    inputMode === m ? "bg-accent-weak text-accent" : "text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {rows.map((row, i) => {
              const meta = GOAL_TYPE_META[row.type];
              const total = totalOf(row);
              const metricOptions = CATEGORY_TYPES[row.category].includes(row.type)
                ? CATEGORY_TYPES[row.category]
                : [...CATEGORY_TYPES[row.category], row.type];
              return (
                <div
                  key={i}
                  className="mt-2 rounded-card-sm border border-line bg-surface p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-muted">
                      목표 {i + 1}
                    </label>
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      aria-label={`목표 ${i + 1} 삭제`}
                      className="grid h-7 w-7 place-items-center rounded-card-sm border border-line bg-surface text-xs disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 카테고리 3버튼 */}
                  <div className="mt-1 flex gap-1 rounded-card-sm border border-line bg-surface-2 p-1">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => changeCategory(i, c.key)}
                        className={`h-8 flex-1 rounded-[8px] text-[11.5px] font-bold ${
                          row.category === c.key
                            ? "bg-accent-weak text-accent"
                            : "text-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* 지표 select */}
                  <select
                    value={row.type}
                    onChange={(e) => changeMetric(i, e.target.value as GoalType)}
                    className="mt-2 h-11 w-full rounded-card-sm border border-line bg-surface px-2 text-sm font-bold"
                  >
                    {metricOptions.map((t) => (
                      <option key={t} value={t}>
                        {METRIC_LABEL[t]}
                      </option>
                    ))}
                  </select>

                  {inputMode === "auto" ? (
                    <div className="mt-2 flex items-end gap-2">
                      {!isDays(row.type) && (
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-muted">
                            하루 목표 ({meta.unit})
                          </label>
                          <input
                            inputMode="decimal"
                            key={`pd-${i}-${row.type}`}
                            defaultValue={row.perDay}
                            onChange={(e) =>
                              updateRow(i, {
                                perDay: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-muted">
                          주 며칠
                        </label>
                        <div className="mt-1 flex h-11 items-center justify-between rounded-card-sm border border-line bg-surface-2 px-1.5">
                          <button
                            onClick={() =>
                              updateRow(i, {
                                daysPerWeek: Math.max(1, row.daysPerWeek - 1),
                              })
                            }
                            className="h-8 w-8 rounded-full text-base font-bold"
                          >
                            –
                          </button>
                          <span className="font-mono text-sm font-extrabold">
                            {row.daysPerWeek}일
                          </span>
                          <button
                            onClick={() =>
                              updateRow(i, {
                                daysPerWeek: Math.min(7, row.daysPerWeek + 1),
                              })
                            }
                            className="h-8 w-8 rounded-full text-base font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <label className="text-[11px] font-bold text-muted">
                        기간 총 목표 ({meta.unit})
                      </label>
                      <input
                        inputMode="decimal"
                        key={`dt-${i}-${row.type}`}
                        defaultValue={row.directTarget}
                        onChange={(e) =>
                          updateRow(i, {
                            directTarget: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface-2 px-3 text-right font-mono text-sm font-bold"
                      />
                    </div>
                  )}

                  {isDays(row.type) && (
                    <div className="mt-2 rounded-card-sm border border-line bg-surface-2 p-2">
                      <label className="text-[11px] font-bold text-muted">
                        {row.type === "weight_days"
                          ? "하루 최소 종목 수 — 이만큼 웨이트를 완료한 날만 인정"
                          : "하루 최소 종목 수 — 이만큼 맨몸을 완료한 날만 인정"}
                      </label>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[12px] font-bold">
                          {goalLabel(row.type, row.qualifier)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              updateRow(i, {
                                qualifier: Math.max(1, row.qualifier - 1),
                              })
                            }
                            className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
                          >
                            –
                          </button>
                          <span className="w-14 text-center font-mono text-sm font-extrabold">
                            {row.qualifier}
                            종목+
                          </span>
                          <button
                            onClick={() =>
                              updateRow(i, {
                                qualifier: Math.min(7, row.qualifier + 1),
                              })
                            }
                            className="h-8 w-8 rounded-full border border-line bg-surface text-base font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="mt-1.5 text-right text-[11.5px] font-bold text-accent">
                    → 기간 목표{" "}
                    <span className="font-mono">
                      {total.toLocaleString()}
                      {meta.unit}
                    </span>
                    {inputMode === "auto" && (
                      <span className="font-normal text-muted">
                        {" "}
                        {isDays(row.type)
                          ? `(주 ${row.daysPerWeek}일 × ${weeks.toFixed(1)}주)`
                          : `(${row.perDay}${meta.unit} × 주 ${row.daysPerWeek}일 × ${weeks.toFixed(1)}주)`}
                      </span>
                    )}
                  </p>
                </div>
              );
            })}

            <label className="mt-3 block text-[11px] font-bold text-muted">
              계획 운동일 (주 N일) — 참여율 기준
            </label>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setPlannedDays((d) => Math.max(1, d - 1))}
                className="h-9 w-9 rounded-full border border-line bg-surface text-lg font-bold"
              >
                –
              </button>
              <span className="w-14 text-center font-mono text-sm font-extrabold">
                주 {plannedDays}일
              </span>
              <button
                onClick={() => setPlannedDays((d) => Math.min(7, d + 1))}
                className="h-9 w-9 rounded-full border border-line bg-surface text-lg font-bold"
              >
                +
              </button>
            </div>
          </div>

          {notice && (
            <p className="mt-2 text-center text-xs font-bold text-warn">
              {notice}
            </p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-3 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {busy
            ? "저장 중…"
            : mode === "create"
              ? "챌린지 만들기 (내 KPI 포함)"
              : "내 KPI 저장"}
        </button>
      </div>
    </>
  );
}
