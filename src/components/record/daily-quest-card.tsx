import type { QuestCopy } from "@/lib/domain/daily-quest";

/**
 * 오늘의 퀘스트 카드 — 도착 알림 + 클리어 혜택.
 *
 * 표시 전용이다. 버튼은 부르는 쪽이 `children`으로 넣는다(빈 화면에서는 "담기",
 * 이미 세팅된 뒤에는 버튼 없음 — 아래 고정 시작 버튼이 그 일을 한다).
 */
export function DailyQuestCard({
  quest,
  children,
}: {
  quest: QuestCopy;
  children?: React.ReactNode;
}) {
  return (
    <section
      data-testid="daily-quest-card"
      aria-label="오늘의 퀘스트"
      className="rounded-card border border-accent/55 bg-accent-weak/30 p-4"
    >
      <p className="text-[11.5px] font-extrabold text-accent">{quest.eyebrow}</p>
      <p className="mt-1.5 text-[17px] font-black leading-snug break-keep">
        {quest.title}
      </p>
      <p className="mt-1 text-[12.5px] leading-snug break-keep text-muted">
        {quest.lead}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 rounded-card-sm bg-surface/70 p-3">
        {quest.hooks.map((hook) => (
          <li key={hook} className="text-[13px] font-bold leading-snug">
            {hook}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
