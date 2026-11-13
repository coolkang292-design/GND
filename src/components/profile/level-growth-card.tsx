"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  CONFIRM_DAYS,
  MIN_CONFIRMED_EXERCISES,
  type DaySample,
  type ExerciseLevelGrowth,
  type MetricKind,
} from "@/lib/domain/level-growth";
import {
  exerciseLine,
  fmtGrowthPct,
  fmtSample,
  statusLabel,
} from "@/lib/domain/level-growth-copy";
import { getMyLevelGrowth, type LevelGrowthResult } from "@/lib/level-growth";

/** `2026-10-16` → `10/16` */
function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function SampleList({
  label,
  kind,
  samples,
  emptyText,
}: {
  label: string;
  kind: MetricKind;
  samples: DaySample[];
  emptyText: string;
}) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold text-muted">{label}</p>
      {samples.length === 0 ? (
        <p className="text-[12px] text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {samples.map((s) => (
            <li key={s.day} className="flex justify-between text-[12px] tabular-nums">
              <span className="text-muted">{shortDay(s.day)}</span>
              <span className="font-bold">{fmtSample(kind, s.best)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExerciseRow({ e, level }: { e: ExerciseLevelGrowth; level: number }) {
  return (
    <li className="rounded-2xl border border-line bg-surface-2/50 p-3" data-testid="growth-exercise">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{e.exerciseKey}</p>
        <span
          className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
            e.status === "confirmed" ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
          }`}
        >
          {statusLabel(e.status)}
        </span>
        <span className="flex-none text-[13px] font-black tabular-nums">
          {e.growthPct === null ? "—" : fmtGrowthPct(e.growthPct)}
        </span>
      </div>
      <SampleList
        label={`Lv.${level} 진입 전 기준 기록`} kind={e.kind} samples={e.baselineSamples}
        emptyText="기준 기록을 찾지 못했어요"
      />
      <SampleList
        label={`Lv.${level}에서 한 기록`}
        kind={e.kind}
        samples={e.currentSamples}
        emptyText="아직 기록이 없어요"
      />
      <p className="mt-2 text-[11.5px] leading-snug text-muted">{exerciseLine(e)}</p>
    </li>
  );
}

/** 표시 전용 (데이터는 부모가 준다) */
export function LevelGrowthView({
  result,
  defaultOpen = false,
}: {
  result: LevelGrowthResult;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const level = result.level;

  if (result.state === "no_entry") {
    return (
      <section aria-label="내 성장" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
        <p className="mt-2 text-[18px] font-black text-muted">측정 준비 중</p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          레벨이 오르면 그때의 운동 기록을 기준으로 삼아, 얼마나 좋아졌는지 알려 드려요.
        </p>
      </section>
    );
  }

  const s = result.summary;
  // 측정된 종목 먼저, 그 안에서는 확정 먼저
  const order = { confirmed: 0, provisional: 1, waiting: 2 } as const;
  const rows = [...s.exercises].sort((a, b) => order[a.status] - order[b.status]);
  const detailCount = rows.length + s.unmatched.length;

  return (
    <section aria-label="내 성장" className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        이전 레벨업 때보다 운동 능력이 얼마나 좋아졌을까요?
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold text-muted">운동 수행능력</span>
        {s.value !== null ? (
          <span className="text-[22px] font-black tabular-nums text-accent" data-testid="growth-value">
            {fmtGrowthPct(s.value)}
          </span>
        ) : (
          <span className="text-[18px] font-black text-muted" data-testid="growth-preparing">
            측정 준비 중
          </span>
        )}
      </div>

      {s.value === null && s.provisionalValue !== null && (
        <p className="mt-1 text-right text-[11.5px] text-muted" data-testid="growth-provisional">
          참고: 지금까지 기록으로는 {fmtGrowthPct(s.provisionalValue)} ({s.provisionalCount}종목 · 아직 확정 전)
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        기준: Lv.{level} 진입 전 운동 기록
        {s.value !== null && <> · 비교한 운동: {s.confirmedCount}종목</>}
      </p>
      {s.value === null && (
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          같은 운동을 이 레벨에서 {CONFIRM_DAYS}일 기록한 종목이 {MIN_CONFIRMED_EXERCISES}개 이상이면 수치가
          확정돼요.
        </p>
      )}

      {detailCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="growth-toggle"
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong text-[13px] font-extrabold"
        >
          <Icon name="ranking" size={16} />
          {open ? "운동별 성장 기록 접기" : "운동별 성장 기록 보기"}
        </button>
      )}

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((e) => (
            <ExerciseRow key={`${e.exerciseKey}::${e.kind}`} e={e} level={level} />
          ))}
          {s.unmatched.map((u) => (
            <li
              key={`${u.exerciseKey}::${u.kind}`}
              className="rounded-2xl border border-line bg-surface-2/50 p-3"
              data-testid="growth-unmatched"
            >
              <p className="text-[13px] font-extrabold">{u.exerciseKey}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                아직 비교할 기준 기록이 없어요. 다음 레벨부터 비교해 드려요.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 성장 허브용 — 본인 기록을 읽어 현재 레벨의 성장을 그린다 */
export function LevelGrowthCard({ userId, level }: { userId: string; level: number }) {
  // 결과·실패에 어느 (userId, level) 것인지 키를 붙인다. 키가 현재와 다르면 옛 값이므로 무시한다 —
  // effect 안에서 setState로 초기화하지 않아도 사용자·레벨이 바뀔 때 옛 결과/실패가 남지 않는다.
  const key = `${userId}:${level}`;
  const [state, setState] = useState<
    { key: string; result: LevelGrowthResult } | { key: string; failed: true } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getMyLevelGrowth({ userId, level })
      .then((result) => {
        if (!cancelled) setState({ key, result });
      })
      .catch(() => {
        if (!cancelled) setState({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, level, key]);

  const current = state && state.key === key ? state : null;

  if (current && "failed" in current) {
    return (
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">내 성장 · Lv.{level}</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          내 성장을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. 운동 기록은 그대로 안전해요.
        </p>
      </section>
    );
  }
  if (!current) {
    return (
      <section
        aria-busy="true"
        className="h-36 animate-pulse rounded-card border border-line bg-surface shadow-card"
      />
    );
  }
  return <LevelGrowthView result={current.result} />;
}
