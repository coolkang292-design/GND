"use client";

import Image from "next/image";
import { UiIcon } from "@/components/ui-icon";
import {
  secondaryKind,
  type SuggestionKind,
} from "@/lib/domain/workout-suggestion";

/**
 * 등록된 운동이 0개일 때의 기록 화면 (사용자 지시 2026-08-06).
 *
 * **여기서 중요한 건 안 그리는 것들이다.** 완료 볼륨 `0kg` · 이전 대비 ·
 * 세트 사이 휴식 · 타바타 · 복구 안내는 전부 "지금 할 일"과 무관하다 —
 * 아직 잴 볼륨도, 쉴 세트도, 시작할 운동도 없다. 그 판정은 기록 페이지가
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
  onApplySuggestion,
  onApplySecondary,
}: {
  /**
   * 완료한 운동이 하나라도 있나.
   *
   * ⚠️ 이력이 없는 사람에게 '최근 운동 불러오기'를 띄우면 눌러도 빈 목록이다 —
   * 막다른 길을 주는 대신 아예 안 보인다.
   */
  hasHistory: boolean;
  onAdd: () => void;
  onLoadRecent: () => void;
  /**
   * 내 루틴에서 담기 (사용자 지시 2026-08-13).
   *
   * ⚠️ 저장된 루틴이 **있을 때만** 보여 준다. 최근 운동 불러오기와 같은 이유다 —
   *    눌러도 빈 목록이면 막다른 길을 하나 더 주는 셈이다.
   */
  onLoadRoutine?: () => void;
  routineCount?: number;
  /**
   * 오늘의 제안 (2026-08-16). `null`이면 카드를 안 그린다.
   * 판정은 `pickSuggestionKind` — 알림과 **같은 함수**다.
   */
  suggestionKind?: SuggestionKind | null;
  /** 알림 본문과 **같은 말**이어야 한다 — `suggestionCopy`가 준다 */
  suggestionBody?: string;
  onApplySuggestion?: () => void;
  /** 보조 제안(4분 인터벌) — 담기가 아니라 **시작**이다 */
  onApplySecondary?: () => void;
}) {
  return (
    <section>
      {/* ⚠️⚠️ 제안이 알림 링크에만 살면 **앱 아이콘으로 들어온 사람은 아무것도
          못 본다.** 이 카드가 그 구멍을 막는다 (설계 C2). */}
      {suggestionKind && onApplySuggestion && (
        <div
          data-testid="suggestion-card"
          className="mb-3 rounded-card border border-accent/50 bg-accent-weak/30 p-4"
        >
          <p className="text-[13px] leading-5 text-text">{suggestionBody}</p>
          <button
            type="button"
            data-priority="primary"
            onClick={onApplySuggestion}
            className="mt-3 h-14 w-full rounded-card bg-accent text-[15px] font-extrabold text-accent-ink"
          >
            {suggestionKind === "walk"
              ? "10분 걷기 담기"
              : suggestionKind === "repeat"
                ? "지난번 그대로 담기"
                : "4분 인터벌 시작"}
          </button>
          {/* ⚠️ 보조는 **담기가 아니라 시작**이다 — 인터벌은 목록에 담으면
              음원도 코스도 없는 맨몸 4개가 된다(`tabata.ts` 주석). */}
          {secondaryKind(suggestionKind) === "interval" && onApplySecondary && (
            <button
              type="button"
              data-priority="secondary"
              onClick={onApplySecondary}
              className="mt-2 h-12 w-full rounded-card border border-accent/50 bg-transparent text-sm font-bold text-accent"
            >
              시간 없으면 · 4분 인터벌 시작
            </button>
          )}
        </div>
      )}
      <div
        data-testid="record-start-card"
        className="overflow-hidden rounded-card border border-line bg-surface text-center shadow-card"
      >
        {/* ⚠️ 옛 표기는 `🏋️` 이모지 하나였다 (2026-08-07 사용자 제공 시안으로 교체).
            이 카드는 **처음 온 사람이 가장 먼저 보는 화면**인데 이모지 한 글자는
            "여기서 뭘 하는 곳인지"를 말하지 못했다. 덤벨·체크리스트·돋보기는
            아래 세 갈래(추가하기 · 불러오기 · 추천)를 그림으로 먼저 말한다.

            `alt=""` — 바로 아래 글자가 같은 뜻을 말한다. 이미지가 안 떠도 문구와
            버튼은 그대로 성립한다.

            ⚠️ `object-cover`로 위아래를 자른다. 원본은 3:2인데 그대로 펼치면
            빈 상태 카드가 화면 절반을 먹어 정작 눌러야 할 버튼이 접힌다. */}
        <Image
          src="/record-assets/exercise-picker-hero.webp"
          alt=""
          width={1200}
          height={800}
          sizes="(max-width: 520px) 100vw, 520px"
          loading="eager"
          className="h-36 w-full object-cover"
        />
        <div className="px-4 pt-4 pb-4">
          <p className="text-base font-extrabold">아직 추가된 운동이 없어요</p>
          <p className="mt-1.5 text-[12.5px] leading-5 text-muted">
            운동을 선택하면 세트와 무게를
            <br />
            쉽게 기록할 수 있어요
          </p>

          <button
            type="button"
            data-priority="primary"
            onClick={onAdd}
            className="mt-4 h-14 w-full rounded-card bg-accent text-[15px] font-extrabold text-accent-ink"
          >
            운동 계획하기
          </button>

          {hasHistory && (
            <button
              type="button"
              data-priority="secondary"
              onClick={onLoadRecent}
              className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-card border border-accent/50 bg-transparent text-sm font-bold text-accent"
            >
              {/* 옛 표기는 `🕘`였다 (2026-08-07 2차 시안으로 교체) — 허브의
                  `지난 운동 불러오기`와 **같은 그림**이라야 같은 일로 읽힌다 */}
              <UiIcon name="hub-past" size={18} />
              최근 운동 불러오기
            </button>
          )}

          {onLoadRoutine && routineCount > 0 && (
            <button
              type="button"
              data-priority="secondary"
              onClick={onLoadRoutine}
              className="mt-2 flex h-12 w-full items-center justify-center gap-1.5 rounded-card border border-line bg-transparent text-sm font-bold text-text"
            >
              <UiIcon name="hub-routine" size={18} />
              내 루틴에서 추가하기
            </button>
          )}

          <p className="mt-3 text-center text-[11.5px] text-muted">
            🎓 초보자도 쉽게 시작할 수 있게{" "}
            <span className="font-bold text-accent">추천 운동</span>부터 안내해드려요
          </p>
        </div>
      </div>
    </section>
  );
}
