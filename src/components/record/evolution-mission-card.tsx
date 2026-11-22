"use client";

import { Icon } from "@/components/ui/icon";
import type { EvolutionMission } from "@/lib/domain/evolution-mission";

/**
 * 진화 미션 카드 — 챌린지가 없는 날 기록 화면에서 "다음 진화까지 무엇을 얼마나 해야 하는지"를
 * 보여 준다 (사용자 지시 2026-11-22).
 *
 * 판정은 서버 값이다. 여기서는 (1) 못 채운 조건과 쉬운 말 힌트, (2) 오늘 넘을 종목별 목표를
 * 그리고, 종목이 있으면 `이 운동으로 담기`로 목표 세트까지 목록에 담는다.
 * 글자를 줄이려고 조건은 **못 채운 것만** 보인다(채운 건 개수로만).
 */
export function EvolutionMissionCard({
  mission,
  onAdd,
  busy = false,
  testId = "evolution-mission-card",
}: {
  mission: EvolutionMission;
  /** 오늘 제안 종목을 목표 세트까지 담는다. 없으면 버튼을 안 낸다 */
  onAdd?: () => void;
  busy?: boolean;
  testId?: string;
}) {
  const { exercises, rows } = mission;
  return (
    <section
      data-testid={testId}
      aria-label="진화 미션"
      className="rounded-card border border-accent/45 bg-surface p-4 shadow-card"
    >
      <p className="flex items-center gap-1.5 text-[14px] font-extrabold text-accent">
        <Icon name="trophy" size={16} />
        진화 미션
      </p>
      <h3 className="mt-1 text-[18px] font-black leading-snug break-keep" data-testid="evolution-mission-headline">
        {mission.headline}
      </h3>

      {mission.ready ? (
        <p className="mt-2 text-[14px] text-muted break-keep">운동을 마치면 진화해요.</p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" data-testid="evolution-mission-rows">
              {rows.map((row) => (
                <li key={row.key} className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14.5px] font-bold">{row.label}</span>
                    <span className="text-[13.5px] font-bold text-muted">{row.known ? row.valueText : "확인 중"}</span>
                  </div>
                  {row.known && (
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                      role="progressbar"
                      aria-valuenow={row.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={row.label}
                    >
                      <div className="h-full rounded-full bg-accent" style={{ width: `${row.percent}%` }} />
                    </div>
                  )}
                  {row.hint && <p className="mt-1 text-[13px] text-muted break-keep">{row.hint}</p>}
                </li>
              ))}
            </ul>
          )}

          {exercises.length > 0 && (
            <div className="mt-4" data-testid="evolution-mission-today">
              <p className="text-[15px] font-black">
                오늘 이 운동으로 성장해요
                {mission.growthRequired !== null && mission.goalPct !== null && (
                  <span className="ml-1 text-[13px] font-bold text-muted">
                    (종목 {mission.growthRequired}개에서 평균 +{mission.goalPct}%)
                  </span>
                )}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {exercises.map((e) => (
                  <li
                    key={`${e.exerciseKey}-${e.kind}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2"
                  >
                    <span className="text-[14.5px] font-bold break-keep">{e.exerciseKey}</span>
                    <span className="text-right text-[13.5px] leading-snug">
                      <span className="text-muted">{e.fromText}</span>
                      <span className="mx-1 text-muted">→</span>
                      <span className="font-black text-accent">{e.toText}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {onAdd && (
                <button
                  type="button"
                  data-testid="evolution-mission-add"
                  disabled={busy}
                  onClick={onAdd}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-accent text-[16px] font-black text-accent active:bg-accent/10 disabled:opacity-60"
                >
                  {busy ? "담는 중…" : "이 목표로 목록 담기"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
