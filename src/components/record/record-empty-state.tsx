"use client";

import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { UiIcon } from "@/components/ui-icon";
import type { SuggestionKind } from "@/lib/domain/workout-suggestion";
import type { QuestCopy } from "@/lib/domain/daily-quest";

/**
 * 등록된 운동이 0개일 때의 기록 화면 — "추천 배치" (시안 2026-11-06).
 *
 * **카드 하나**다. 위에서 아래로:
 *
 *   오늘의 퀘스트 · 한 줄 제목 · 한 줄 설명 · 칩(+XP · 연속) · [퀘스트 받기]
 *   ─────────────
 *   다른 방법으로 시작하기
 *   [지난 운동 · 그대로 담기] [4분 인터벌 · 바로 시작]
 *   [운동 계획 · 새로 만들기] [내 루틴 · 불러오기]
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
  heroImage = null,
  onApplySuggestion,
  onApplySecondary,
}: {
  /**
   * 완료한 운동이 하나라도 있나.
   *
   * ⚠️ 이력이 없는 사람에게 '지난 운동'을 띄우면 눌러도 빈 목록이다 —
   * 막다른 길을 주는 대신 아예 안 보인다.
   */
  hasHistory: boolean;
  onAdd: () => void;
  onLoadRecent: () => void;
  /**
   * 내 루틴에서 담기 (사용자 지시 2026-08-13).
   *
   * ⚠️ 저장된 루틴이 **있을 때만** 보여 준다. 지난 운동과 같은 이유다 —
   *    눌러도 빈 목록이면 막다른 길을 하나 더 주는 셈이다.
   */
  onLoadRoutine?: () => void;
  routineCount?: number;
  /**
   * 오늘의 제안 (2026-08-16). `null`이면 퀘스트 버튼을 안 그린다.
   * 판정은 `pickSuggestionKind` — 알림과 **같은 함수**다.
   */
  suggestionKind?: SuggestionKind | null;
  /** 퀘스트 문구가 없을 때(옛 호출)의 본문 — `suggestionCopy`가 준다 */
  suggestionBody?: string;
  /** 오늘의 퀘스트 문구. 없으면(제안이 없는 날) 제목만 있는 카드다 */
  quest?: QuestCopy | null;
  /** 퀘스트 카드 오른쪽에 그릴 내 전신 캐릭터 (현재 단계 · 외형). 없으면 그림 없이 카드만 */
  heroImage?: string | null;
  onApplySuggestion?: () => void;
  /** 4분 인터벌 — 담기가 아니라 **시작**이다 */
  onApplySecondary?: () => void;
}) {
  const hasQuestButton = Boolean(suggestionKind && onApplySuggestion);
  // 인터벌이 이미 주 제안이면 타일에 같은 길을 또 두지 않는다
  const showInterval = Boolean(onApplySecondary) && suggestionKind !== "interval";
  const showRoutine = Boolean(onLoadRoutine) && routineCount > 0;

  return (
    <section
      data-testid="record-start-card"
      className="rounded-[22px] border border-line-strong bg-surface p-4 shadow-card"
    >
      {quest ? (
        <div
          data-testid="daily-quest-card"
          aria-label="오늘의 퀘스트"
          role="group"
          className="relative"
        >
          {/* 내 캐릭터 — 퀘스트 글자 영역(제목·칩) 오른쪽에만 상체를 깐다(현재 단계 · 외형).
              아래 버튼·타일 뒤로 내려오지 않는다. 글자 쪽으로 번지지 않게 왼쪽을 카드 색으로
              덮고, 그림이 없으면 글자만 넓게 쓴다. */}
          {heroImage && (
            <div
              aria-hidden
              data-testid="quest-character"
              className="pointer-events-none absolute -right-4 -top-4 bottom-0 w-[46%] overflow-hidden rounded-tr-[22px]"
            >
              <Image
                src={heroImage}
                alt=""
                fill
                sizes="(max-width: 768px) 46vw, 220px"
                className="origin-top scale-[1.2] object-cover object-top"
              />
              <span className="absolute inset-0 bg-gradient-to-r from-surface via-surface/50 to-transparent" />
            </div>
          )}
          <div className={`relative ${heroImage ? "max-w-[64%]" : ""}`}>
            <p className="text-[11.5px] font-extrabold text-accent">{quest.eyebrow}</p>
            <h2 className="mt-1.5 text-[19px] font-black leading-snug tracking-tight break-keep">
              {quest.headline.join(" ")}
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug break-keep text-muted">{quest.lead}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {quest.hooks.map((hook) => (
                <li
                  key={hook}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-bold leading-snug"
                >
                  {hook}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        /* ⚠️ 퀘스트는 **매일** 생긴다(제안이 없는 날도 걷기·지난 운동으로 채운다). 그래서
           "제안 없는 날" 카드는 없다. 퀘스트 문구가 없는 때는 오늘 이미 계획이 있거나
           운동을 마친 날뿐이고, 그때는 아래 시작 타일만 그린다. 옛 `아직 추가된 운동이
           없어요` 그림·안내문은 되살리지 않는다. */
        suggestionBody && (
          <p className="text-[12.5px] leading-5 text-muted">{suggestionBody}</p>
        )
      )}

      {hasQuestButton && (
        <button
          type="button"
          data-priority="primary"
          onClick={onApplySuggestion}
          className="relative mt-3.5 h-14 w-full rounded-full bg-accent text-[16px] font-black text-accent-ink"
        >
          {quest
            ? "퀘스트 확인하기"
            : suggestionKind === "walk"
              ? "10분 걷기 담기"
              : suggestionKind === "repeat"
                ? "지난번 그대로 담기"
                : "4분 인터벌 시작"}
        </button>
      )}

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
    <div
      data-testid="start-options"
      className={`relative ${withQuest ? "mt-4 border-t border-line pt-3" : ""}`}
    >
      <h3 className="mb-2 text-[12.5px] font-bold text-muted">
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
      className={`flex min-h-[92px] flex-col justify-between rounded-2xl border bg-surface-2/60 p-3 text-left ${
        primary ? "border-accent/60" : "border-line"
      }`}
    >
      <span className="flex h-6 items-center">{icon}</span>
      <span>
        <span className="block text-[15px] font-extrabold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-tight text-muted">{sub}</span>
      </span>
    </button>
  );
}
