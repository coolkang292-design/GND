import Image from "next/image";
import { Icon, type IconName } from "@/components/ui/icon";
import type { CompletionHero } from "@/lib/domain/workout-complete-message";

/**
 * 운동 완료 화면 맨 위 카드 (2026-09-28 사용자 요청 — "성취감이 느껴지게
 * 사진 자산과 '오늘도 해냈다'는 느낌, 기록이 쌓여서 실력이 된다는 느낌의 문구").
 *
 * ⚠️ 옛 표기는 `🎉` 이모지 + "오늘 운동 완료!" 제목이었다.
 * ⚠️ 이미지(사용자 제작)에 마케팅 문구가 **이미 들어 있다.** 그 위에 글자를 얹지
 *    않고 16:9 그대로 보여준다. 이미지 아래에는 이미지가 못 하는 것 — 실제 누적일·
 *    오늘 수치·기록 갱신 — 만 둔다. 문구는 `completionHero()`가 정한다.
 */
export function CompletionHeroCard({
  hero,
  statsLine,
  stats,
  recordNote,
  achievementLine,
}: {
  hero: CompletionHero;
  /** Verified week-level achievement; omit when history cannot be read. */
  achievementLine?: string | null;
  /** "45분 · 운동한 날 24일째 · +120 XP" — 화면 낭독용 한 줄(숫자 칸과 같은 값) */
  statsLine: string;
  /**
   * 큰 숫자 칸 = **운동 시간 · 운동한 날 · XP** (이슈 #16 P0-A, 2026-10-19 사용자 결정).
   * 옛 칸(`분 · KG · SETS`, 시안 ④ 2026-10-05)의 볼륨·세트는 접힘 영역 "기록 상세"로 갔다.
   * ⚠️ 모르는 값(`null`)은 **칸을 뺀다** — 0을 지어내지 않는다(누적일 미조회, XP 0·멱등 재생).
   * ⚠️ `statsLine`과 **같은 결과값**에서 만든다 — 두 곳이 다른 숫자를 말하지 않게 부르는 쪽이 같이 넘긴다.
   */
  stats?: { minutes: number; workoutDays: number | null; xp: number | null };
  recordNote: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
      <Image
        src={hero.image}
        alt={hero.alt}
        width={1200}
        height={675}
        sizes="(max-width: 520px) 100vw, 520px"
        loading="eager"
        className="block aspect-[16/9] w-full object-cover"
      />
      <div className="px-5 pt-3.5 pb-4 text-center">
        {achievementLine && (
          <p className="text-[17px] font-extrabold text-accent" aria-label="이번 운동의 성취">
            {achievementLine}
          </p>
        )}
        {/* 운동한 날 칸이 있으면 같은 숫자를 문장으로 또 말하지 않는다 */}
        {hero.progressLine && !(stats && stats.workoutDays !== null) && (
          <p className={`${achievementLine ? "mt-1 text-[12px] text-muted" : "text-[15px] font-extrabold text-accent"}`}>
            {hero.progressLine}
          </p>
        )}
        {stats ? (
          <>
            <p className="sr-only">{statsLine}</p>
            <div
              aria-hidden
              data-testid="hero-stats"
              className={`mt-3 grid ${statColumns(stats)} divide-x divide-line rounded-card-sm border border-line bg-surface-2/60 py-2.5`}
            >
              <StatCell icon="clock" value={stats.minutes.toLocaleString()} unit="분" />
              {stats.workoutDays !== null && (
                <StatCell icon="calendar" value={stats.workoutDays.toLocaleString()} unit="운동한 날" />
              )}
              {stats.xp !== null && (
                <StatCell icon="spark" value={`+${stats.xp.toLocaleString()}`} unit="XP" accent />
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{statsLine}</p>
        )}
        {recordNote && (
          /* 기록 갱신은 보상이라 금색이다(시안 ④ "Gold는 기록/XP/보상에만") */
          <div className="mt-3 rounded-card-sm border border-gold/50 px-3 py-2.5 text-left">
            <p className="flex items-center gap-1 text-[10.5px] font-black tracking-wider text-gold">
              <Icon name="pr" size={13} /> NEW RECORD
            </p>
            <p className="mt-0.5 text-sm font-extrabold">기록 갱신! 지난번보다 {recordNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function statColumns(stats: { workoutDays: number | null; xp: number | null }): string {
  const n = 1 + (stats.workoutDays !== null ? 1 : 0) + (stats.xp !== null ? 1 : 0);
  return n === 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
}

function StatCell({
  icon,
  value,
  unit,
  accent = false,
}: {
  icon: IconName;
  value: string;
  unit: string;
  /** XP는 보상이라 라임으로 강조한다(시안 STATE 01~03) */
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1">
      <Icon name={icon} size={18} className="text-accent" />
      <strong className={`text-[20px] font-black tabular-nums ${accent ? "text-accent" : ""}`}>{value}</strong>
      <span className="text-[10.5px] font-extrabold text-muted">{unit}</span>
    </div>
  );
}
