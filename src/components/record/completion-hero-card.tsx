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
}: {
  hero: CompletionHero;
  /** "1분 · 볼륨 1,755kg · 완료 세트 3개" — 화면 낭독용 한 줄(숫자 칸과 같은 값) */
  statsLine: string;
  /**
   * 시안 ④의 큰 숫자 세 칸(`52분 · 6,840kg · 18 SETS`, 2026-10-05). 없으면 한 줄로 그린다.
   * ⚠️ `statsLine`과 **같은 결과값**에서 만든다 — 두 곳이 다른 숫자를 말하지 않게 부르는 쪽이 같이 넘긴다.
   */
  stats?: { minutes: number; volumeKg: number; sets: number };
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
        {hero.progressLine && (
          <p className="text-[15px] font-extrabold text-accent">
            {hero.progressLine}
          </p>
        )}
        {stats ? (
          <>
            <p className="sr-only">{statsLine}</p>
            <div aria-hidden className="mt-3 grid grid-cols-3 divide-x divide-line rounded-card-sm border border-line bg-surface-2/60 py-2.5">
              <StatCell icon="clock" value={stats.minutes.toLocaleString()} unit="MIN" />
              <StatCell icon="volume" value={Math.round(stats.volumeKg).toLocaleString()} unit="KG" />
              <StatCell icon="dumbbell" value={stats.sets.toLocaleString()} unit="SETS" />
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

function StatCell({ icon, value, unit }: { icon: IconName; value: string; unit: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1">
      <Icon name={icon} size={18} className="text-accent" />
      <span className="flex items-baseline gap-1">
        <strong className="text-[20px] font-black tabular-nums">{value}</strong>
        <span className="text-[10.5px] font-extrabold">{unit}</span>
      </span>
    </div>
  );
}
