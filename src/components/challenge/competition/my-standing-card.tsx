import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { metricMeta, type MetricKey } from "@/lib/domain/challenge-metrics";

/**
 * 최종 시안 `내 현재 순위 👑 1위 · 운동 횟수 기준` | `오늘 인증 완료 ✓ · 3일 연속 🔥` `>`.
 * 지침의 칩 3종(연속·오늘 인증·이번 주 1위)을 오른쪽에 모은다. 게임 요소는 왕관·불꽃까지.
 *
 * ⚠️ 오늘 아직 운동 전이면 `오늘 운동하기` 링크가 이 카드에 있다 — 진행 중 상세의
 *    "그래서 오늘 뭘 하면 되나"의 답(옛 히어로 대표 버튼)을 잃지 않는다.
 */
export function MyStandingCard({
  standing,
  todayDone,
  streak,
  weeklyFirst,
  periodOver = false,
  onOpenRanking,
}: {
  standing: { metric: MetricKey; rank: number } | null;
  todayDone: boolean;
  streak: number;
  weeklyFirst: boolean;
  /** 종료일이 지났다(결과 발표 대기) — 할 일은 운동이 아니라 결과 발표라 운동 링크를 숨긴다 */
  periodOver?: boolean;
  onOpenRanking: () => void;
}) {
  const first = standing?.rank === 1;
  return (
    <section className="flex items-stretch rounded-card border border-accent/40 bg-surface shadow-card">
      <button
        type="button"
        onClick={onOpenRanking}
        aria-label="챌린지 랭킹 보기"
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3.5 text-left"
      >
        <span className="text-[12px] font-bold text-muted">내 현재 순위</span>
        {standing ? (
          <>
            <span className="flex items-center gap-1.5">
              <Icon name="crown" size={22} filled className={first ? "text-gold" : "text-muted"} />
              <span className={`font-mono text-[30px] leading-none font-black ${first ? "text-accent" : "text-text"}`}>
                {standing.rank}위
              </span>
            </span>
            <span className="text-[11.5px] text-muted">{metricMeta(standing.metric).label} 기준</span>
          </>
        ) : (
          <span className="text-[14px] font-extrabold">첫 기록을 남겨 보세요</span>
        )}
      </button>
      <div className="my-3 w-px flex-none bg-line" aria-hidden />
      <div className="flex min-w-0 flex-col justify-center gap-1.5 px-3 py-3">
        {periodOver ? (
          <span className="text-[12.5px] font-extrabold text-muted">기간 종료 · 결과 발표 대기</span>
        ) : todayDone ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-ink">
              <Icon name="check" size={12} strokeWidth={3} />
            </span>
            오늘 인증 완료
          </span>
        ) : (
          <Link
            href="/record"
            className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-extrabold text-accent-ink"
          >
            <Icon name="play" size={12} filled />
            오늘 운동하기
          </Link>
        )}
        {streak >= 2 && (
          <span className="flex items-center gap-1 text-[12px] font-bold text-muted">
            {streak}일 연속 <Icon name="flame" size={13} filled className="text-gold" />
          </span>
        )}
        {weeklyFirst && (
          <span className="flex w-fit items-center gap-1 rounded-full bg-gold-weak px-2 py-0.5 text-[11px] font-extrabold text-gold">
            <Icon name="crown" size={11} filled />
            이번 주 1위
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenRanking}
        aria-label="챌린지 랭킹 열기"
        className="grid w-8 flex-none place-items-center text-muted"
      >
        <Icon name="chevron" size={18} />
      </button>
    </section>
  );
}
