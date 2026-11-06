"use client";

import { Icon } from "@/components/ui/icon";
import { UiIcon } from "@/components/ui-icon";
import type { SuggestionKind } from "@/lib/domain/workout-suggestion";
import type { QuestCopy } from "@/lib/domain/daily-quest";
import { DailyQuestCard } from "./daily-quest-card";
import { QuestHero } from "./quest-hero";

/**
 * 등록된 운동이 0개일 때의 기록 화면 — "추천 배치" (시안 2026-11-06).
 *
 * 위에서 아래로 (시안 2026-11-07):
 *
 *   퀘스트 배너(큰 캐릭터 · 두 줄 제목 · 칩) · [퀘스트 시작하기] (큰 버튼 하나)
 *   다른 방법으로 시작하기
 *   [지난 운동 · 그대로 담기] [4분 인터벌 · 바로 시작]
 *   [운동 계획 · 새로 만들기] [내 루틴 · 불러오기]
 *
 * 설명 문장은 없다 — 글자는 적고 크게 (사용자 지시 "텍스트가 너무 작고 많아").
 * 버튼을 누르면 퀘스트를 담고 계획 화면으로 간다(부르는 쪽이 정한다).
 *
 * 예전에는 제안 카드 + `아직 추가된 운동이 없어요` 카드(그림·안내문·버튼 3개)가 따로
 * 있었다. 같은 말을 두 번 하는 화면이었다 — 둘 다 없앴다.
 *
 * **여기서 중요한 건 안 그리는 것들이다.** 완료 볼륨 `0kg` · 이전 대비 · 세트 사이
 * 휴식 · 타바타 · 복구 안내는 전부 "지금 할 일"과 무관하다 — 그 판정은 기록 페이지가
 * 하고(`isEmpty`), 이 컴포넌트는 남는 하나를 그린다.
 */
export function RecordEmptyState({
  hasHistory,
  onAdd,
  onLoadRecent,
  onLoadRoutine,
  routineCount = 0,
  suggestionKind = null,
  suggestionBody = "",
  quest = null,
  /** 퀘스트 배너 오른쪽에 그릴 내 캐릭터 (현재 단계 · 외형). 없으면 그림 없이 */
  heroImage = null,
  onApplySuggestion,
  onApplySecondary,
}: {
  /**
   * 완료한 운동이 하나라도 있나.
   * 없으면 `지난 운동 불러오기`는 눌러 봐야 빈 목록이다 — 타일을 아예 안 낸다.
   */
  hasHistory: boolean;
  /** 운동 계획(새로 만들기) — 선택 허브를 연다 */
  onAdd: () => void;
  onLoadRecent: () => void;
  onLoadRoutine?: () => void;
  /** 저장한 루틴 수 — 0이면 `내 루틴` 타일을 안 낸다 */
  routineCount?: number;
  /** 오늘의 퀘스트 종류 — 있으면 큰 시작 버튼이 선다 */
  suggestionKind?: SuggestionKind | null;
  /** 퀘스트가 없는 날의 한 줄 안내 */
  suggestionBody?: string;
  /** 오늘의 퀘스트 문구 — 주면 퀘스트 카드, 없으면 시작 타일만 */
  quest?: QuestCopy | null;
  heroImage?: string | null;
  onApplySuggestion?: () => void;
  /** 4분 인터벌 — 담기가 아니라 **시작**이다 */
  onApplySecondary?: () => void;
}) {
  const hasQuestButton = Boolean(suggestionKind && onApplySuggestion);
  // 인터벌이 이미 주 제안이면 타일에 같은 길을 또 두지 않는다
  const showInterval = Boolean(onApplySecondary) && suggestionKind !== "interval";
  const showRoutine = Boolean(onLoadRoutine) && routineCount > 0;

  const options = (
    <StartOptions
      withQuest={Boolean(quest)}
      hasHistory={hasHistory}
      showInterval={showInterval}
      showRoutine={showRoutine}
      primaryAdd={!hasQuestButton}
      onLoadRecent={onLoadRecent}
      onApplySecondary={onApplySecondary}
      onAdd={onAdd}
      onLoadRoutine={onLoadRoutine}
    />
  );

  if (quest) {
    return (
      <div data-testid="record-start-card" className="flex flex-col gap-3">
        {hasQuestButton ? (
          <DailyQuestCard
            quest={quest}
            heroImage={heroImage}
            onStart={onApplySuggestion!}
            options={options}
          />
        ) : (
          <>
            <QuestHero quest={quest} heroImage={heroImage} />
            {options}
          </>
        )}
      </div>
    );
  }

  /* ⚠️ 퀘스트는 **매일** 생긴다(제안이 없는 날도 걷기·지난 운동으로 채운다). 그래서
     "제안 없는 날" 카드는 없다. 퀘스트 문구가 없는 때는 오늘 이미 계획이 있거나
     운동을 마친 날뿐이고, 그때는 아래 시작 타일만 그린다. */
  return (
    <section
      data-testid="record-start-card"
      className="rounded-[22px] border border-line-strong bg-surface p-4 shadow-card"
    >
      {suggestionBody && (
        <p className="mb-3 text-[14px] leading-5 text-muted">{suggestionBody}</p>
      )}
      {hasQuestButton && (
        <button
          type="button"
          data-priority="primary"
          onClick={onApplySuggestion}
          className="mb-4 h-14 w-full rounded-full bg-accent text-[16px] font-black text-accent-ink"
        >
          {suggestionKind === "walk"
            ? "10분 걷기 담기"
            : suggestionKind === "repeat"
              ? "지난번 그대로 담기"
              : "4분 인터벌 시작"}
        </button>
      )}
      {options}
    </section>
  );
}

/**
 * "다른 방법으로 시작하기" 타일 묶음 — 빈 기록 화면과 운동이 담긴 퀘스트 카드가 **같은 것**을 쓴다
 * (사용자 지시 2026-11-07: 자동으로 담긴 날에도 다른 길이 남아 있어야 한다).
 */
export function StartOptions({
  withQuest,
  hasHistory,
  showInterval,
  showRoutine,
  primaryAdd = false,
  onLoadRecent,
  onApplySecondary,
  onAdd,
  onLoadRoutine,
}: {
  /** 퀘스트 카드 안이면 구분선과 "다른 방법으로 시작하기" 제목 */
  withQuest: boolean;
  hasHistory: boolean;
  showInterval: boolean;
  showRoutine: boolean;
  primaryAdd?: boolean;
  onLoadRecent: () => void;
  onApplySecondary?: () => void;
  onAdd: () => void;
  onLoadRoutine?: () => void;
}) {
  return (
    <div data-testid="start-options" className="relative">
      <h3 className="mb-2.5 px-1 text-[16px] font-extrabold">
        {withQuest ? "다른 방법으로 시작하기" : "운동 시작하기"}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {hasHistory && (
          <Tile
            title="지난 운동"
            sub="그대로 담기"
            icon={<UiIcon name="hub-past" size={22} />}
            onClick={onLoadRecent}
          />
        )}
        {showInterval && (
          <Tile
            title="4분 인터벌"
            sub="바로 시작"
            icon={<Icon name="interval" size={22} className="text-accent" />}
            onClick={onApplySecondary!}
          />
        )}
        <Tile
          title="운동 계획"
          sub="새로 만들기"
          icon={<UiIcon name="goal" size={22} />}
          onClick={onAdd}
          primary={primaryAdd}
        />
        {showRoutine && (
          <Tile
            title="내 루틴"
            sub="불러오기"
            icon={<UiIcon name="hub-routine" size={22} />}
            onClick={onLoadRoutine!}
          />
        )}
      </div>
    </div>
  );
}

/** 시안의 타일 — 왼쪽 위 아이콘, 왼쪽 아래 제목과 한 줄 설명 */
function Tile({
  title,
  sub,
  icon,
  onClick,
  primary = false,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** 퀘스트 버튼이 없는 날의 첫 길 — 테두리만 라임으로 */
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      data-priority={primary ? "primary" : "secondary"}
      onClick={onClick}
      className={`flex min-h-[72px] items-center gap-3 rounded-2xl border bg-surface p-3.5 text-left ${
        primary ? "border-accent/60" : "border-line"
      }`}
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[16px] font-extrabold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-tight text-muted">{sub}</span>
      </span>
    </button>
  );
}
