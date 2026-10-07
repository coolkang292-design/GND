import { Icon } from "@/components/ui/icon";
import type { PeriodRewards } from "@/lib/domain/challenge-report";

/** 육각 레벨 배지 — 시안의 그림 대신 SVG (사용자 지시: 이미지는 제외) */
export function LevelHex({ level, size = 44 }: { level: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="flex-none">
      <polygon
        points="22,2 40,12 40,32 22,42 4,32 4,12"
        fill="var(--accent-weak)"
        stroke="var(--accent)"
        strokeWidth={2}
      />
      <text
        x={22}
        y={23}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--accent)"
        fontSize={12}
        fontWeight={900}
      >
        Lv.{level}
      </text>
    </svg>
  );
}

/** 종료 시점 XP 막대 — 시안 `1,250 / 2,000 XP` */
export function XpBar({ r }: { r: PeriodRewards }) {
  return (
    <>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(100, Math.max(0, r.percentAtEnd))}%` }}
        />
      </div>
      <p className="mt-1 text-right font-mono text-[11px] text-muted">
        <b className="text-text">{r.totalXpAtEnd.toLocaleString()}</b>
        {r.nextLevelXp !== null && ` / ${r.nextLevelXp.toLocaleString()} XP`}
      </p>
    </>
  );
}

/**
 * 시안 화면 A `Lv.2 산책러 +1 레벨 업 >` — 누르면 화면 B.
 * 표기는 앱 규칙 `단계명 Lv.N`(2026-10-06 결정). 레벨은 **영구 성장 레벨**이다(챌린지 레벨 아님).
 */
export function LevelCard({ r, onOpen }: { r: PeriodRewards; onOpen?: () => void }) {
  const gained = r.levelAtEnd - r.levelAtStart;
  const body = (
    <>
      <LevelHex level={r.levelAtEnd} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold">
          {r.stageNameAtEnd} Lv.{r.levelAtEnd}
          {gained > 0 && <span className="ml-1.5 text-accent">+{gained} 레벨 업!</span>}
        </p>
        <div className="mt-1.5">
          <XpBar r={r} />
        </div>
      </div>
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-card border border-accent/40 bg-surface p-3.5 text-left shadow-card";
  if (!onOpen) {
    return (
      <div data-testid="level-card" className={cls}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label="나의 챌린지 결과 보기" className={cls}>
      {body}
      <Icon name="chevron" size={18} className="text-muted" />
    </button>
  );
}
