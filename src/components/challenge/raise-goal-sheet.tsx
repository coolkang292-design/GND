"use client";

import { useEffect, useState } from "react";

import { raiseMyGoal } from "@/lib/challenge";
import {
  goalRaiseMessage,
  goalRaiseServerMessage,
  validateGoalRaise,
} from "@/lib/domain/goal-raise";

export type RaisableGoal = {
  id: string;
  label: string;
  unit: string;
  target: number;
};

/**
 * 진행 중 챌린지에서 목표 올리기 (0090, 사용자 결정 2026-08-31).
 *
 * ⚠️ **낮추는 길은 만들지 않는다.** 입력칸의 `min`이 지금 목표이고, 화면 규칙과
 *    서버 트리거가 같은 판정을 한다. 화면 규칙은 눌러 보고 알게 하지 않으려는
 *    것이지 안전장치가 아니다 — 진짜 관문은 0090의
 *    `enforce_goal_raise_only`다.
 *
 * ⚠️ 목표 **종류**는 안 바꾼다. 어려운 종목에서 쉬운 종목으로 갈아타면 그동안의
 *    실적이 새 잣대로 재채점된다. 서버도 `goal_type_locked`로 막는다.
 */
export function RaiseGoalSheet({
  goals,
  onClose,
  onRaised,
}: {
  goals: RaisableGoal[];
  onClose: () => void;
  /** 저장이 끝난 뒤 — 부모가 화면을 다시 읽어야 진행률 막대가 맞는다 */
  onRaised: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, String(g.target)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function save(goal: RaisableGoal) {
    if (busyId) return;
    const next = Number(drafts[goal.id]);
    const problem = validateGoalRaise({ current: goal.target, next });
    if (problem) {
      setMessage(goalRaiseMessage(problem));
      return;
    }
    setBusyId(goal.id);
    setMessage(null);
    try {
      await raiseMyGoal(goal.id, next);
      setSavedIds((prev) => new Set(prev).add(goal.id));
      setMessage(`${goal.label} 목표를 올렸어요`);
      onRaised();
    } catch (e) {
      setMessage(
        goalRaiseServerMessage(e instanceof Error ? e.message : "unknown"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raise-goal-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto my-3 h-1 w-10 flex-none rounded-full bg-line" />

        <div className="flex flex-col gap-3 p-5">
          <h3 id="raise-goal-title" className="text-base font-extrabold">
            목표 올리기
          </h3>
          {/* 규칙을 여기서 말한다. 입력하고 눌러 본 뒤에 알게 하면
              "왜 안 되지?"가 먼저 오고, 그건 버그로 읽힌다. */}
          <p className="text-[12.5px] leading-relaxed text-muted">
            시작한 뒤에는 <b className="text-text">올리는 것만</b> 할 수 있어요.
            낮추면 막판에 목표를 내려 100%를 만들 수 있어서, 달성률로 서는 순위가
            뜻을 잃어요.
          </p>

          <div className="flex flex-col gap-2.5">
            {goals.map((g) => {
              const saved = savedIds.has(g.id);
              return (
                <div
                  key={g.id}
                  className="rounded-card-sm border border-line bg-surface-2 p-3"
                >
                  <p className="text-[12.5px] font-bold">{g.label}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    지금 {g.target.toLocaleString()}
                    {g.unit}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={g.target}
                      step="any"
                      value={drafts[g.id] ?? ""}
                      aria-label={`${g.label} 새 목표`}
                      onChange={(e) => {
                        setDrafts((prev) => ({ ...prev, [g.id]: e.target.value }));
                        setMessage(null);
                      }}
                      className="h-10 min-w-0 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => void save(g)}
                      disabled={busyId !== null}
                      className="h-10 flex-none rounded-card-sm bg-accent px-3.5 text-[13px] font-extrabold text-accent-ink disabled:opacity-60"
                    >
                      {busyId === g.id ? "…" : saved ? "올림 ✓" : "올리기"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {message && (
            <p role="alert" className="text-[12px] font-bold text-accent">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-card border border-line bg-surface text-[13px] font-bold text-muted"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
