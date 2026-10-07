import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/ui/icon";

export type MetricCell = { key: string; label: string; value: string; rank: number | null };

/**
 * 종료 `결과 요약` 탭 — 최종 시안 3번 (2026-10-07).
 * 내 결과 카드(월계수 `N위` · 아바타+왕관 · 종합 점수) → 종목 4칸(값 + 내 순위) → 최종 TOP 3 → 전체 랭킹 보기.
 *
 * ⚠️ 왕관·월계수는 앱 장식 자산(`/gnd/decorations`, 시상대가 이미 쓴다)이다. 시안의 트로피·인물
 *    일러스트는 그리지 않는다(사용자 지시: 이미지는 제외).
 */
export function ResultOverview({
  mine,
  cells,
  podium,
  onOpenFinal,
}: {
  /** 목표를 안 건 사람은 null — 종합 점수가 없다 */
  mine: { rank: number; overall: number; avatarUrl: string | null } | null;
  cells: MetricCell[];
  podium: ReactNode;
  onOpenFinal: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-card border border-gold/50 bg-surface shadow-card">
        {mine ? (
          <div className="grid grid-cols-3 items-center gap-1 px-3 pt-4 pb-3">
            <div className="relative grid h-[84px] place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gnd/decorations/laurel-128.webp" alt="" className="absolute h-[84px] w-[84px] object-contain" />
              <span className={`relative font-mono text-[26px] font-black ${mine.rank === 1 ? "text-gold" : "text-text"}`}>
                {mine.rank}
                <span className="text-[15px]">위</span>
              </span>
            </div>
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gnd/decorations/crown-64.webp" alt="" width={30} height={30} className="-mb-1 h-[30px] w-[30px]" />
              <Avatar
                src={mine.avatarUrl}
                className="grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-full border-2 border-gold bg-surface-2 text-xl"
              />
              <span className="mt-1 text-[13px] font-extrabold">나</span>
            </div>
            <div className="text-center">
              <p className="text-[12px] text-muted">종합 점수</p>
              <p className="font-mono text-[28px] leading-tight font-black text-gold">
                {mine.overall.toFixed(1)}
                <span className="ml-0.5 text-[14px]">점</span>
              </p>
            </div>
          </div>
        ) : (
          <p className="px-4 pt-4 pb-3 text-center text-[13px] text-muted">
            목표를 정하지 않아 종합 점수가 없어요. 종목 기록은 아래에서 볼 수 있어요.
          </p>
        )}
        <div className="grid grid-cols-4 border-t border-line">
          {cells.map((c, i) => (
            <div
              key={c.key}
              data-testid="metric-cell"
              className={`flex flex-col items-center gap-0.5 px-1 py-3 text-center ${i > 0 ? "border-l border-line" : ""}`}
            >
              <span className="text-[10.5px] text-muted">{c.label}</span>
              <span className="font-mono text-[14px] font-extrabold">{c.value}</span>
              <span className={`text-[11px] font-bold ${c.rank === 1 ? "text-gold" : "text-muted"}`}>
                {c.rank === null ? "-" : `(${c.rank}위)`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line-strong bg-surface px-2 pt-3 pb-3 shadow-card">
        <h3 className="mb-1 px-2 text-[15px] font-extrabold">최종 TOP 3</h3>
        {podium}
        <button
          type="button"
          onClick={onOpenFinal}
          className="mx-2 mt-3 flex h-11 w-[calc(100%-1rem)] items-center justify-center gap-1 rounded-[12px] border border-accent/60 text-[13.5px] font-extrabold text-accent"
        >
          전체 랭킹 보기
          <Icon name="chevron" size={15} />
        </button>
      </section>
    </div>
  );
}
