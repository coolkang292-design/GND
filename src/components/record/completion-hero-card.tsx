import Image from "next/image";
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
  recordNote,
}: {
  hero: CompletionHero;
  /** "1분 · 볼륨 1,755kg · 완료 세트 3개" */
  statsLine: string;
  recordNote: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-good bg-surface shadow-card">
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
        <p className="mt-1 text-sm text-muted">{statsLine}</p>
        {recordNote && (
          <p className="mt-2 rounded-card-sm bg-accent-weak px-3 py-2 text-sm font-extrabold text-accent">
            🏅 기록 갱신! 지난번보다 {recordNote}
          </p>
        )}
      </div>
    </section>
  );
}
