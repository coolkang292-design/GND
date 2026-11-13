import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { getStageGroups } from "@/lib/domain/progression";
import type { StageGateStatus } from "@/lib/domain/evolution-gate";
import { buildEvolutionCardModel, type Tone } from "@/lib/domain/evolution-card-model";

/** 달성 타일 색: met = 단순 달성, over = 초과, big = 2배 이상 크게 초과 */
const TILE: Record<Tone, string> = {
  met: "border-line bg-surface-2",
  over: "border-good bg-good-weak",
  big: "border-accent bg-accent-weak",
};
const VALUE: Record<Tone, string> = { met: "text-text", over: "text-good", big: "text-accent" };
const BADGE: Record<Tone, string> = { met: "", over: "bg-good text-accent-ink", big: "bg-accent text-accent-ink" };

/**
 * 서버 진화 카드. 판정(met·state)은 서버 값만 쓴다 — 화면은 표시용 배수·배지·문구만 만든다.
 * 규칙: lib/domain/evolution-card-model.ts · 설계: docs/superpowers/specs/2026-11-13-evolution-card-b-design.md
 */
export function StageEvolutionStatusView({ status }: { status: StageGateStatus }) {
  if (status.nextStage === null) return <section className="rounded-card border border-line bg-surface p-4 shadow-card">
    <h2 className="text-[15px] font-extrabold">최종 단계에 도달했어요</h2>
    <p className="mt-2 text-sm text-muted">전설의 기록을 계속 쌓아 보세요.</p>
  </section>;

  const target = getStageGroups()[status.nextStage - 1];
  const m = buildEvolutionCardModel(status);
  return <section className="break-keep rounded-card border border-line bg-surface p-4 shadow-card" data-testid="server-evolution-status">
    <h2 className="text-[15px] font-extrabold">다음 진화 · {target.stageName}</h2>
    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-accent">
      {m.celebrate && <span className="evo-pop inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent text-accent-ink">
        <Icon name="check" size={13} strokeWidth={2.6} />
      </span>}
      {m.headline}
    </p>

    {m.segments.length > 1 && <div role="img" aria-label={`조건 ${m.total}개 중 ${m.metCount}개`} className="mt-2.5 flex gap-1">
      {m.segments.map((ok, i) => <span key={i} data-testid="evo-segment" className={`h-1.5 flex-1 rounded-full ${ok ? "bg-accent" : "bg-line"}`} />)}
    </div>}
    {m.bigNote && <p data-testid="evo-big-note" className="mt-2 flex items-center gap-1 text-[12px] font-bold text-good">
      <Icon name="flame" size={13} />{m.bigNote}
    </p>}
    <p className="mt-2 text-[11.5px] text-muted">{m.sub}</p>

    {m.tiles.length > 0 && <ul className="mt-4 grid grid-cols-2 gap-2.5">
      {m.tiles.map(t => <li key={t.key} data-tone={t.tone} className={`relative min-w-0 rounded-card-sm border p-3 ${TILE[t.tone]}`}>
        {t.badge && <span data-testid="evo-badge" className={`absolute -top-2 right-2.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ${BADGE[t.tone]}`}>{t.badge}</span>}
        <p className="text-[12px] text-muted">{t.label}</p>
        <p className={`mt-0.5 text-[22px] font-extrabold leading-tight ${VALUE[t.tone]}`}>{t.value}</p>
        {t.tone === "met"
          ? <p className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[12px] font-bold text-accent"><Icon name="check" size={12} strokeWidth={2.6} />목표 달성</p>
          : <p className="mt-0.5 text-[12px] text-muted">{t.target}</p>}
      </li>)}
    </ul>}

    {m.rows.length > 0 && <ul className="mt-3 flex flex-col gap-2.5">
      {m.rows.map(r => <li key={r.key} data-testid="evo-row" className="rounded-card-sm bg-surface-2 p-3">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-muted">{r.label}</span>
          <span className="font-extrabold">{r.valueText}</span>
        </div>
        {r.known && <div role="progressbar" aria-label={r.label} aria-valuenow={r.percent} aria-valuemin={0} aria-valuemax={100}
          className="mt-2 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent-press transition-[width] duration-300 ease-out" style={{ width: `${r.percent}%` }} />
        </div>}
        {r.hint && <p className="mt-1.5 text-[12px] text-warn">{r.hint}</p>}
      </li>)}
    </ul>}

    {m.alternate && <div data-testid="alternate-path" className="mt-3 rounded-card-sm border border-line p-3 text-[12px] text-muted">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1">
          {m.alternate.met && <Icon name="check" size={12} strokeWidth={2.6} />}
          {m.alternate.text}
        </span>
        <span className={m.alternate.met ? "font-extrabold text-good" : "font-bold text-text"}>{m.alternate.valueText}</span>
      </div>
      <div role="progressbar" aria-label={m.alternate.text} aria-valuenow={m.alternate.percent} aria-valuemin={0} aria-valuemax={100}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${m.alternate.met ? "bg-good" : "bg-accent-press"}`} style={{ width: `${m.alternate.percent}%` }} />
      </div>
      {m.alternate.note && <p className="mt-1.5">{m.alternate.note}</p>}
    </div>}
    {m.steadyNote && <p className="mt-2 text-[11px] text-muted">꾸준함은 연속 4주 중 3주에서 주 2일 이상 운동하면 1회로 세요.</p>}

    <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">한번 진화한 모습은 운동을 쉬어도 그대로예요.</p>
    <Link href="/record" className="mt-3 flex h-12 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-accent-ink">오늘 운동 시작하기</Link>
  </section>;
}
