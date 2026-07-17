"use client";

import { useState } from "react";
import type { GoalType } from "@/lib/domain/goal-score";
import { GOAL_TYPE_META, type GoalDraft } from "@/lib/challenge";

const GOAL_TYPES = Object.keys(GOAL_TYPE_META) as GoalType[];

/** 하루 기준 입력의 기본값 (유형별) */
const PER_DAY_DEFAULT: Record<GoalType, number> = {
  frequency: 0, // 사용 안 함 (주 N일 자체가 목표)
  distance: 5,
  duration: 30,
  volume: 2000,
  reps: 100,
};

export type SetupSubmit = {
  name: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
  plannedDays: number;
};

type GoalRow = {
  type: GoalType;
  daysPerWeek: number; // 주 N일 (하루 기준 계산용)
  perDay: number; // 하루 목표량
  directTarget: number; // 총량 직접 입력값
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
): GoalRow {
  const daysPerWeek = Math.min(
    7,
    Math.max(
      1,
      type === "frequency"
        ? Math.round((target * 7) / periodDays) || plannedDays
        : plannedDays,
    ),
  );
  return {
    type,
    daysPerWeek,
    perDay:
      type === "frequency"
        ? 0
        : round1((target * 7) / (daysPerWeek * periodDays)) ||
          PER_DAY_DEFAULT[type],
    directTarget: target,
  };
}

/** 새 챌린지 만들기(create) / 내 KPI 설정(goals) 공용 시트 (§5·§6, 목업 setupSheet) */
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
  /** 지난 챌린지 KPI (없으면 버튼 숨김) */
  prevGoals: GoalDraft[] | null;
  /** goals 모드: 이미 정해진 챌린지 기간 일수 */
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
      rowFromTarget(g.type, g.target, defaults.plannedDays, periodDays),
    ),
  );

  const weeks = periodDays / 7;

  /** 행의 기간 총 목표 (점수 산식이 쓰는 값) */
  function totalOf(row: GoalRow): number {
    if (inputMode === "direct") return row.directTarget;
    if (row.type === "frequency") {
      return Math.max(1, Math.round(row.daysPerWeek * weeks));
    }
    return round1(row.perDay * row.daysPerWeek * weeks);
  }

  function updateRow(i: number, patch: Partial<GoalRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function changeType(i: number, type: GoalType) {
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i
          ? {
              type,
              daysPerWeek: r.daysPerWeek || plannedDays,
              perDay: PER_DAY_DEFAULT[type],
              directTarget: GOAL_TYPE_META[type].defaultTarget,
            }
          : r,
      ),
    );
  }

  function addRow() {
    const unused = GOAL_TYPES.find((t) => !rows.some((r) => r.type === t));
    const type = unused ?? "frequency";
    setRows((rs) => [
      ...rs,
      {
        type,
        daysPerWeek: plannedDays,
        perDay: PER_DAY_DEFAULT[type],
        directTarget: GOAL_TYPE_META[type].defaultTarget,
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
        rowFromTarget(g.type, g.target, plannedDays, periodDays),
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
      setNotice("같은 유형의 목표가 두 개 있어요 — 하나로 합쳐주세요");
      return;
    }
    const goals = rows.map((r) => ({ type: r.type, target: totalOf(r) }));
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
        <h3 className="text-base font-extrabold">
          {mode === "create" ? "새 챌린지 만들기" : "🎯 내 목표 (KPI) 설정"}
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          종류가 달라도 각 목표를 &lsquo;내 목표 대비 %&rsquo;로 환산해
          공평하게 점수화해요.
        </p>

        <div className="mt-3 flex-1 overflow-y-auto">
          {mode === "create" && (
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <label className="text-[11px] font-bold text-muted">
                챌린지 이름
              </label>
              <input
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
            </div>
          )}

          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-extrabold">🎯 내 목표 (KPI)</p>
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

            {/* 입력 방식: 하루 기준 자동계산(기본) / 총량 직접 입력 */}
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
                    inputMode === m
                      ? "bg-accent-weak text-accent"
                      : "text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {rows.map((row, i) => {
              const meta = GOAL_TYPE_META[row.type];
              const total = totalOf(row);
              return (
                <div
                  key={i}
                  className="mt-2 rounded-card-sm border border-line bg-surface p-2.5"
                >
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-muted">
                        목표 {i + 1}
                      </label>
                      <select
                        value={row.type}
                        onChange={(e) =>
                          changeType(i, e.target.value as GoalType)
                        }
                        className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-2 text-sm font-bold"
                      >
                        {GOAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {GOAL_TYPE_META[t].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      aria-label={`목표 ${i + 1} 삭제`}
                      className="grid h-11 w-9 place-items-center rounded-card-sm border border-line bg-surface text-xs disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>

                  {inputMode === "auto" ? (
                    <div className="mt-2 flex items-end gap-2">
                      {row.type !== "frequency" && (
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

                  <p className="mt-1.5 text-right text-[11.5px] font-bold text-accent">
                    → 기간 목표{" "}
                    <span className="font-mono">
                      {total.toLocaleString()}
                      {meta.unit}
                    </span>
                    {inputMode === "auto" && (
                      <span className="font-normal text-muted">
                        {" "}
                        {row.type === "frequency"
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
