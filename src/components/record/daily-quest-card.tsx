import { QuestExercisePreview, type QuestPreviewItem } from "./quest-exercise-preview";
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
  exercises,
}: {
  quest: QuestCopy;
  children?: React.ReactNode;
  exercises?: QuestPreviewItem[];
}) {
  return (
    <section
      data-testid="daily-quest-card"
      aria-label="오늘의 퀘스트"
      className="rounded-card border border-accent/55 bg-accent-weak/30 p-4"
    >
      <p className="text-[11.5px] font-extrabold text-accent">{quest.eyebrow}</p>
      <p className="mt-1 text-[17px] font-black leading-snug break-keep">
        {quest.title}
      </p>
      <p className="mt-1 text-[12.5px] leading-snug break-keep text-muted">
        {quest.lead}
      </p>
      {/* 혜택은 한 줄 칩이다 — 박스 목록은 화면을 길게 만들었다 (2026-11-06 "복잡해") */}
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {quest.hooks.map((hook) => (
          <li
            key={hook}
            className="rounded-full bg-surface/70 px-2.5 py-1 text-[11.5px] font-bold leading-snug"
          >
            {hook}
          </li>
        ))}
      </ul>
      {exercises && exercises.length > 0 && <QuestExercisePreview items={exercises} />}
      {children}
    </section>
  );
}
