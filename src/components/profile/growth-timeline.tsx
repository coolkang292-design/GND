"use client";

import { useState } from "react";
import { LEVEL_DEFS } from "@/lib/domain/progression";

const WINDOW_BEFORE = 3;
const WINDOW_AFTER = 4;

/**
 * 성장 타임라인 — 달성 레벨(체크)·현재(강조)·잠금(자물쇠) 세로 목록.
 *
 * 레벨별 달성 **날짜는 저장하지 않는다**(0022에 레벨 이력 테이블이 없다).
 * 그래서 추정 날짜를 지어내지 않고 레벨·누적 XP·상태만 보여준다.
 */
export function GrowthTimeline({
  currentLevel,
  totalXp,
}: {
  currentLevel: number;
  totalXp: number;
}) {
  const [showAll, setShowAll] = useState(false);

  const from = Math.max(1, currentLevel - WINDOW_BEFORE);
  const to = Math.min(LEVEL_DEFS.length, currentLevel + WINDOW_AFTER);
  const visible = showAll
    ? LEVEL_DEFS
    : LEVEL_DEFS.filter((d) => d.level >= from && d.level <= to);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold">성장 타임라인</h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="flex-none text-[11px] font-bold text-accent"
        >
          {showAll ? "접기" : "35레벨 전체"}
        </button>
      </div>

      <ol className="mt-3 flex flex-col">
        {visible.map((d, i) => {
          const done = d.level < currentLevel;
          const current = d.level === currentLevel;
          const prev = visible[i - 1];
          const evolves = !prev || prev.stageIndex !== d.stageIndex;
          return (
            <li key={d.level} className="flex gap-3">
              {/* 좌측 마커 + 연결선 */}
              <div className="flex flex-none flex-col items-center">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                    current
                      ? "bg-accent text-accent-ink"
                      : done
                        ? "bg-good-weak text-good"
                        : "bg-surface-2 text-faint"
                  }`}
                >
                  {current ? "★" : done ? "✓" : "🔒"}
                </span>
                {i < visible.length - 1 && (
                  <span
                    aria-hidden
                    className={`w-px flex-1 ${done ? "bg-good-weak" : "bg-line"}`}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-3.5">
                <p
                  className={`text-[12.5px] font-bold ${
                    current ? "text-accent" : done ? "text-text" : "text-muted"
                  }`}
                >
                  Lv.{d.level}
                  {evolves && (
                    <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-extrabold text-muted">
                      {d.stageName} 진화
                    </span>
                  )}
                  {current && (
                    <span className="ml-1.5 text-[10.5px] font-extrabold">
                      현재
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[10.5px] text-faint">
                  누적 {d.requiredTotalXp.toLocaleString()} XP
                  {!done && !current &&
                    ` · ${Math.max(0, d.requiredTotalXp - totalXp).toLocaleString()} XP 남음`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
