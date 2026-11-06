import Image from "next/image";
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
  heroImage = null,
}: {
  quest: QuestCopy;
  children?: React.ReactNode;
  exercises?: QuestPreviewItem[];
  /** 내 캐릭터(현재 단계·외형) — 빈 기록 화면 카드와 같은 자리·같은 방식 */
  heroImage?: string | null;
}) {
  return (
    <section
      data-testid="daily-quest-card"
      aria-label="오늘의 퀘스트"
      className="relative rounded-card border border-accent/55 bg-accent-weak/30 p-4"
    >
      {/* 내 캐릭터 — 제목·칩 오른쪽에만 상체를 깐다. 아래 운동 박스·버튼 뒤로는 내려오지 않는다 */}
      {heroImage && (
        <div
          aria-hidden
          data-testid="quest-character"
          className="pointer-events-none absolute right-0 top-0 h-[150px] w-[42%] overflow-hidden rounded-tr-card"
          style={{
            // 왼쪽 가장자리를 투명하게 흘려 글자 쪽으로 번지지 않게 한다
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 45%)",
            maskImage: "linear-gradient(to right, transparent, #000 45%)",
          }}
        >
          <Image
            src={heroImage}
            alt=""
            fill
            sizes="(max-width: 768px) 42vw, 200px"
            className="origin-top scale-[1.2] object-cover object-top"
          />
        </div>
      )}
      <div className={`relative ${heroImage ? "max-w-[62%]" : ""}`}>
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
      </div>
      {exercises && exercises.length > 0 && (
        <QuestExercisePreview items={exercises} hideButton />
      )}
      {children}
    </section>
  );
}
