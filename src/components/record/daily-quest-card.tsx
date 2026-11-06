import { Icon } from "@/components/ui/icon";
import type { QuestCopy } from "@/lib/domain/daily-quest";
import { QuestHero } from "./quest-hero";
import { QuestTodayCard, type QuestPreviewItem } from "./quest-today-card";

export type { QuestPreviewItem };

/**
 * 오늘의 퀘스트 카드 (시안 2026-11-07) — 배너 · 오늘의 운동 · 큰 시작 버튼 · 다른 방법.
 *
 * 버튼은 **하나**다(`onStart`). 무엇을 하는지는 부르는 쪽이 정한다 — 운동이 담긴 화면에서는
 * 계획 화면으로, 빈 화면에서는 퀘스트를 담고 계획 화면으로, 인터벌·프로그램 계획은 그 시작으로.
 * 다른 방법 타일은 `options`로 받아 카드 **아래**에 둔다.
 */
export function DailyQuestCard({
  quest,
  heroImage = null,
  exercises,
  startLabel = "퀘스트 시작하기",
  onStart,
  busy = false,
  onMore,
  options,
  testId = "daily-quest-card",
}: {
  quest: QuestCopy;
  /** 내 캐릭터(현재 단계·외형) */
  heroImage?: string | null;
  /** 오늘 담긴 운동 — 있으면 그림 칸으로 보인다. 없으면(빈 화면) 버튼만 */
  exercises?: QuestPreviewItem[];
  startLabel?: string;
  onStart: () => void;
  busy?: boolean;
  /** `+N종 더보기` — 보통 시작 버튼과 같은 곳(계획 화면) */
  onMore?: () => void;
  /** 카드 아래 `다른 방법으로 시작하기` */
  options?: React.ReactNode;
  testId?: string;
}) {
  const start = (
    <button
      type="button"
      data-priority="primary"
      data-testid="quest-start"
      disabled={busy}
      onClick={onStart}
      className="mt-4 flex h-16 w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[19px] font-black text-accent-ink shadow-card active:bg-accent-press disabled:opacity-60"
    >
      {!busy && <Icon name="play" size={18} filled />}
      {busy ? "처리 중…" : startLabel}
    </button>
  );
  return (
    <section
      data-testid={testId}
      aria-label="오늘의 퀘스트"
      className="flex flex-col gap-3"
    >
      <QuestHero quest={quest} heroImage={heroImage} />
      {exercises && exercises.length > 0 ? (
        <QuestTodayCard items={exercises} onMore={onMore ?? onStart}>
          {start}
        </QuestTodayCard>
      ) : (
        <div className="-mt-1">{start}</div>
      )}
      {options}
    </section>
  );
}
