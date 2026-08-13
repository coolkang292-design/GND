"use client";

import { useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import {
  CATEGORY_TYPES,
  GoalCard,
  isDaysType,
  type GoalRow,
} from "@/components/challenge/goal-card";
import {
  perDayFromTotal,
  perWeekFromTotalDays,
} from "@/lib/domain/challenge-goal-calc";
import { plannedDaysForPeriod } from "@/lib/domain/goal-score";
import { CATEGORY_LABEL, GOAL_TYPE_META, type GoalDraft } from "@/lib/challenge";

/** 완료 보너스가 최대 3개라(`COMPLETED_GOAL_BONUS_MAX`) 화면도 3개에서 멈춘다 */
export const MAX_GOALS = 3;

export type SetupSubmit = {
  name: string;
  startDate: string;
  endDate: string;
  goals: GoalDraft[];
  plannedDays: number;
};

function periodDaysOf(startDate: string, endDate: string): number {
  const toUtc = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  const diff = Math.round((toUtc(endDate) - toUtc(startDate)) / 86_400_000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 28;
}

/**
 * 저장된 목표(총량) → 카드 상태.
 *
 * ⚠️ `fallbackDays`(= ②의 주 N일)는 계산기의 **첫 표시값**일 뿐이다. 이후로 두
 * 값은 서로를 안 건드린다. 여기를 "연동"으로 고치지 마라 — 그게 이 개편이
 * 없앤 혼동이다(설계 §1).
 */
function rowFromGoal(
  g: GoalDraft,
  periodDays: number,
  fallbackDays: number,
): GoalRow {
  return {
    category: GOAL_TYPE_META[g.type].category,
    type: g.type,
    total: g.target,
    calcDaysPerWeek: isDaysType(g.type)
      ? perWeekFromTotalDays(g.target, periodDays)
      : Math.min(7, Math.max(1, fallbackDays)),
    qualifier: isDaysType(g.type) ? (g.qualifier ?? 3) : 0,
  };
}

/**
 * 챌린지 목표 세팅 시트 (2026-08-14 개편).
 *
 * ⚠️⚠️ **① 내 운동 목표에는 달성률 재료만, ② 참여 계획에는 참여율 재료만 넣는다.**
 * 이 경계가 이 화면의 전부다. 개편 전에는 `주 N일`이 두 종류(목표 카드의
 * 총량 계산용 / 참여율 분모용) 한 화면에 섞여 있어서, 사람도 코드도 둘을 같은
 * 것으로 읽었다. 다시 섞으면 **참여율이 조용히 틀린 값을 쓴다** — 화면만 봐서는
 * 안 잡히는 종류다. `setup-sheet.test.tsx`의
 * `달성 세팅과 참여 세팅은 서로를 안 건드린다`가 그 회귀선이다.
 */
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
  const [notice, setNotice] = useState<string | null>(null);

  const periodDays =
    mode === "create"
      ? periodDaysOf(startDate, endDate)
      : (periodDaysFixed ?? periodDaysOf(startDate, endDate));
  const weeks = periodDays / 7;

  const [rows, setRows] = useState<GoalRow[]>(() =>
    defaults.goals
      .slice(0, MAX_GOALS)
      .map((g) => rowFromGoal(g, periodDays, defaults.plannedDays)),
  );

  const atMax = rows.length >= MAX_GOALS;

  function updateRow(i: number, patch: Partial<GoalRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  /**
   * ⚠️ **새 목표는 안 쓴 분류부터 고른다.** 예전처럼 무조건 `웨이트 횟수`를 넣으면
   * `+ 목표 추가`를 누르는 순간 같은 지표가 두 개가 되고, 제출이
   * "같은 지표의 목표가 두 개 있어요"로 막힌다. 목표 3개 제한이 생기면서 이게
   * 더 자주 보인다(세 번 누르면 웨이트 횟수 3개). 시안도 목표2를 유산소로 그렸다.
   */
  function addRow() {
    if (atMax) return;
    setRows((rs) => {
      const used = new Set(rs.map((r) => r.category));
      const category =
        (["weight", "cardio", "bodyweight"] as const).find((c) => !used.has(c)) ??
        "weight";
      const type = CATEGORY_TYPES[category][0];
      return [
        ...rs,
        {
          category,
          type,
          total: GOAL_TYPE_META[type].defaultTarget,
          calcDaysPerWeek: Math.min(7, Math.max(1, plannedDays)),
          qualifier: isDaysType(type) ? 3 : 0,
        },
      ];
    });
  }

  function removeRow(i: number) {
    if (rows.length > 1) setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function loadPrev() {
    if (!prevGoals || prevGoals.length === 0) return;
    setRows(
      prevGoals.slice(0, MAX_GOALS).map((g) => rowFromGoal(g, periodDays, plannedDays)),
    );
    setNotice(
      prevGoals.length > MAX_GOALS
        ? `지난 목표 중 ${MAX_GOALS}개만 불러왔어요 ↺`
        : "지난 챌린지 목표를 불러왔어요 · 숫자만 수정하세요 ↺",
    );
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
      target: r.total,
      qualifier: isDaysType(r.type) ? r.qualifier : undefined,
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

        <div className="flex items-start justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-base font-extrabold">
            {mode === "create" ? (
              "새 챌린지 만들기"
            ) : (
              <>
                <UiIcon name="goal" size={20} />내 운동 목표 설정
              </>
            )}
          </h3>
          <span className="flex-none rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[12px] font-bold text-muted">
            기간 {periodDays}일 ({weeks.toFixed(1)}주)
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          운동 목표를 여러 개 추가하고, 내 목표 대비 달성률로 자동 점수화해요
        </p>

        <div className="mt-3 flex-1 overflow-y-auto">
          {mode === "create" && (
            <div className="rounded-card border border-line bg-surface-2 p-3">
              <label className="text-[12px] font-bold text-muted">챌린지 이름</label>
              <input
                autoFocus
                placeholder="챌린지 이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm font-bold"
              />
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="text-[12px] font-bold text-muted">시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[12px] font-bold text-muted">종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 h-11 w-full rounded-card-sm border border-line bg-surface px-3 text-sm"
                  />
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 rounded-card-sm bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent">
                <UiIcon name="camera" size={15} />이 챌린지는 사진 인증한 운동만
                집계돼요
              </p>
            </div>
          )}

          {/* ── ① 달성률 재료만 ───────────────────────────── */}
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[14px] font-extrabold">
                <UiIcon name="goal" size={18} />내 운동 목표
              </p>
              <div className="flex gap-1.5">
                {prevGoals && prevGoals.length > 0 && (
                  <button
                    onClick={loadPrev}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold"
                  >
                    ↺ 지난 목표
                  </button>
                )}
                <button
                  onClick={addRow}
                  disabled={atMax}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-bold text-accent disabled:opacity-40"
                >
                  + 목표 추가
                </button>
              </div>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              무엇을 얼마나 할 것인가 · 종합점수의 80%
            </p>

            {rows.map((row, i) => (
              <GoalCard
                key={i}
                index={i}
                row={row}
                periodDays={periodDays}
                canRemove={rows.length > 1}
                onChange={(patch) => updateRow(i, patch)}
                onRemove={() => removeRow(i)}
              />
            ))}

            <button
              onClick={addRow}
              disabled={atMax}
              className="mt-2 w-full rounded-card-sm border border-dashed border-line py-3 text-[13px] font-bold text-accent disabled:opacity-40"
            >
              + 목표 추가하기
            </button>
            <p className="mt-1 text-center text-[12px] text-muted">
              {atMax
                ? `최대 ${MAX_GOALS}개까지 추가할 수 있어요`
                : `최대 ${MAX_GOALS}개까지 · 목표를 여러 개 달성하면 보너스`}
            </p>
          </div>

          {/* ── ② 참여율 재료만 ───────────────────────────── */}
          <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
            <p className="text-[14px] font-extrabold">📅 참여 계획</p>
            <p className="mt-1 text-[12px] text-muted">
              얼마나 자주 나올 것인가 · 종합점수의 20%
            </p>
            <p className="mt-2 text-[13px] font-bold">
              일주일에 며칠 운동할 계획인가요?
            </p>
            <div className="mt-1.5 flex items-center justify-center gap-3">
              <button
                aria-label="계획 운동일 줄이기"
                onClick={() => setPlannedDays((d) => Math.max(1, d - 1))}
                className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
              >
                –
              </button>
              <span className="w-20 text-center font-mono text-[17px] font-extrabold">
                주 {plannedDays}일
              </span>
              <button
                aria-label="계획 운동일 늘리기"
                onClick={() => setPlannedDays((d) => Math.min(7, d + 1))}
                className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              종목과 상관없이 &lsquo;운동한 날&rsquo;을 셉니다 · → 이 기간{" "}
              {periodDays}일 중 {plannedDaysForPeriod(plannedDays, periodDays)}일
            </p>
          </div>

          {/* ── ③ 요약 ───────────────────────────────────── */}
          <section
            aria-label="현재 설정 요약"
            className="mt-3 rounded-card border border-accent/40 bg-accent/5 p-3"
          >
            <p className="text-[13px] font-extrabold">📋 현재 설정 요약</p>
            {/* 하루 기준을 같이 적는다 (2026-08-14 사용자 지시). 총량만 있으면
                "300회"가 많은 건지 적은 건지 알 수 없다 — 하루로 쪼개야 감이 온다.
                ⚠️ 여기 주 N일은 **카드 계산기의 값**이다. 아래 줄의 `주 N일 계획`
                (참여율)과 다른 값이며, 그래서 문구도 다르게 적는다. */}
            <div className="mt-2 flex flex-col gap-1.5">
              {rows.map((r, i) => {
                const unit = GOAL_TYPE_META[r.type].unit;
                const perDay = perDayFromTotal(
                  r.total,
                  r.calcDaysPerWeek,
                  periodDays,
                );
                return (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-2 rounded-card-sm border border-line bg-surface px-3 py-2"
                  >
                    <span className="flex-none text-[13px] font-extrabold">
                      {CATEGORY_LABEL[r.category]}{" "}
                      <span className="font-mono">
                        {r.total.toLocaleString()}
                        {unit}
                      </span>
                    </span>
                    <span className="min-w-0 truncate text-[11.5px] text-muted">
                      {isDaysType(r.type)
                        ? `주 ${r.calcDaysPerWeek}일씩`
                        : `하루 ${perDay}${unit} × 주 ${r.calcDaysPerWeek}일`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] font-bold text-muted">
              목표 {rows.length}개 · 참여 계획 주 {plannedDays}일
            </p>
          </section>

          {notice && (
            <p className="mt-2 text-center text-[12.5px] font-bold text-warn">
              {notice}
            </p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          /* 2026-08-14 사용자 지시 — ① "버튼도 좀 키워주고" ② "챌린지 추가하기
             버튼과 동일한 디자인으로". 그래서 금색 채움이 아니라 **테두리형**이다
             (`challenge/page.tsx`의 `＋ 챌린지 추가하기`와 같은 조합:
             `border-accent/40` + `bg-accent-weak` + `text-accent`).
             ⚠️ 두 버튼은 같은 흐름의 시작과 끝이라 생김새가 갈리면 안 된다 —
             한쪽 클래스를 고치면 다른 쪽도 같이 고쳐라. */
          /* ⚠️ `shrink-0`이 없으면 `h-14`가 안 먹는다. 시트가 `flex flex-col`이라
             내용이 길어지면 이 버튼이 flex 축소 대상이 되어 26px까지 눌린다
             (2026-08-14 실측 — 높이를 키웠는데 화면에서 거의 안 달라져서 잡았다). */
          className="mt-3 h-14 w-full shrink-0 rounded-card border border-accent/40 bg-accent-weak text-[17px] font-extrabold text-accent disabled:opacity-60"
        >
          {busy
            ? "저장 중…"
            : mode === "create"
              ? `챌린지 만들기 (목표 ${rows.length}개 포함)`
              : `내 목표 저장 (${rows.length}개)`}
        </button>
      </div>
    </>
  );
}
