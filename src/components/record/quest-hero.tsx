import Image from "next/image";
import { splitQuestTitle, type QuestCopy } from "@/lib/domain/daily-quest";

/**
 * 퀘스트 배너 (시안 2026-11-07) — 큰 캐릭터 + 두 줄 제목 + 칩 둘.
 *
 * 글자는 **적고 크게**: 라벨 · 제목(앞줄 흰색 · 뒷줄 라임) · 칩. 설명 문장은 두지 않는다
 * (사용자 지시 "텍스트가 너무 작고 많아"). 캐릭터는 오른쪽에 크게 깔고, 글자 쪽 가장자리는
 * 마스크로 흐린다. 그림이 없으면 글자만 넓게 쓴다.
 */
export function QuestHero({
  quest,
  heroImage = null,
}: {
  quest: QuestCopy;
  /** 내 캐릭터(현재 단계·외형). 못 읽으면 null → 글자만 */
  heroImage?: string | null;
}) {
  const [first, second] = splitQuestTitle(quest.title);
  return (
    <div
      data-testid="quest-hero"
      className="relative min-h-[210px] overflow-hidden rounded-card border border-accent/55 bg-gradient-to-br from-[#16280d] via-[#0f1610] to-[#0b0d10] p-5"
    >
      {/* 캐릭터 뒤 라임 빛 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 top-0 h-60 w-60 rounded-full bg-accent/25 blur-3xl"
      />
      {heroImage && (
        <div
          aria-hidden
          data-testid="quest-character"
          className="pointer-events-none absolute inset-y-0 right-0 w-[56%] overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 38%)",
            maskImage: "linear-gradient(to right, transparent, #000 38%)",
          }}
        >
          <Image
            src={heroImage}
            alt=""
            fill
            sizes="(max-width: 768px) 56vw, 260px"
            className="origin-top scale-[1.15] object-cover object-top"
          />
        </div>
      )}
      <div className="relative">
        <div className={heroImage ? "max-w-[68%]" : ""}>
          <p className="text-[15px] font-extrabold text-accent">🎯 오늘의 퀘스트</p>
          <h2 className="mt-2 text-[25px] font-black leading-[1.2] tracking-tight break-keep">
            {first}
            {second && (
              <>
                <br />
                <span className="text-accent">{second}</span>
              </>
            )}
          </h2>
        </div>
        {/* 칩은 캐릭터 위로 겹쳐도 한 줄로 — 글자 폭에 가두면 두 줄로 꺾인다 */}
        <ul className="mt-4 flex flex-wrap gap-2">
          {quest.hooks.map((hook) => (
            <li
              key={hook}
              className="rounded-full border border-line bg-surface/85 px-3 py-1.5 text-[14px] font-bold leading-snug whitespace-nowrap"
            >
              {hook}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
