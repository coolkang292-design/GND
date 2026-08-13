"use client";

import Image from "next/image";
import { UiIcon } from "@/components/ui-icon";
import { type GoalCategory } from "@/lib/challenge";
import {
  PART_META,
  RECOMMEND_PARTS,
  resolveByPart,
  resolveSituation,
  visibleSituations,
  type RecommendPart,
  type ResolvedRecommendation,
  type SituationKey,
} from "@/lib/domain/recommended-exercises";
import type { CatalogExercise } from "@/lib/types";

/** 그리드 한 칸 — 부위와 상황이 같은 모양을 쓴다 */
/** ⚠️ `iconSrc`는 이모지가 아니라 이미지 경로다 (`PART_META` 주석 참조) */
type Choice = { key: string; label: string; sub: string; iconSrc: string };

/**
 * 추천 운동 — 부위별·상황별 (사용자 디자인 2026-08-06).
 *
 * **두 화면이 한 컴포넌트다.** 머리글 문구와 그리드 데이터만 다르고 나머지
 * (2열 그리드 · 추천 카드 · 검색 안내 · 하단 선택 바)는 글자 하나까지 같다.
 * 두 벌로 만들면 카드 여백을 고칠 때 한쪽만 고쳐진다.
 *
 * 부위는 **가로 스크롤이 아니라 그리드**다 (사용자 지시). 가로 줄은 오른쪽이
 * 잘려 "고를 것이 몇 개인지"를 감춘다 — 처음 온 사람이 고르는 화면에서
 * 선택지를 감추면 안 된다.
 */
export function RecommendedPicker({
  mode,
  catalog,
  challengeCategories,
  part,
  onPart,
  situation,
  onSituation,
  selected,
  onToggle,
  onBack,
  onSearch,
  onNext,
  onStartInterval,
}: {
  mode: "part" | "situation";
  catalog: CatalogExercise[];
  challengeCategories: ReadonlySet<GoalCategory> | null;
  part: RecommendPart;
  onPart: (next: RecommendPart) => void;
  situation: SituationKey;
  onSituation: (next: SituationKey) => void;
  /** 선택된 카탈로그 id */
  selected: ReadonlySet<string>;
  onToggle: (item: CatalogExercise) => void;
  onBack: () => void;
  /** '원하는 운동이 없나요?' — 검색 화면으로 */
  onSearch: () => void;
  onNext: () => void;
  /**
   * 전신 인터벌을 연다 (사용자 지시 2026-08-13).
   *
   * `interval` 칸은 다른 칸과 **하는 일이 다르다** — 종목을 목록에 담는 대신
   * 인터벌을 시작한다. 담기만 하면 3세트 10회짜리 일반 운동이 되어 버린다.
   * 안 넘기면 그 칸은 미리보기만 보여 준다.
   */
  onStartInterval?: () => void;
}) {
  const byPart = mode === "part";

  const situations = visibleSituations(challengeCategories);
  // 목표를 모르면 '챌린지 목표에 맞게'가 목록에서 빠진다 — 그게 지금 고른
  // 상황이었다면 첫 번째로 되돌린다(빈 목록을 보여주지 않는다)
  const activeSituation =
    situations.find((s) => s.key === situation) ?? situations[0];

  const choices: Choice[] = byPart
    ? RECOMMEND_PARTS.map((p) => ({
        key: p,
        label: p,
        sub: PART_META[p].sub,
        iconSrc: PART_META[p].iconSrc,
      }))
    : situations.map((s) => ({
        key: s.key,
        label: s.label,
        sub: s.sub,
        iconSrc: s.iconSrc,
      }));

  const activeKey = byPart ? part : (activeSituation?.key ?? "beginner");
  const activeLabel = byPart
    ? part
    : (activeSituation?.label ?? "");

  const list: ResolvedRecommendation[] = byPart
    ? resolveByPart(part, catalog)
    : resolveSituation(
        activeSituation?.key ?? "beginner",
        catalog,
        challengeCategories,
      );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        aria-label="이전 화면으로 돌아가기"
        /* ⚠️ 테두리 있는 원으로 그린다 (2026-08-07 사용자 지적 "뒤로가기도 잘보이게").
           옛 모양은 배경도 테두리도 없는 `text-muted` 글리프 하나여서, 어두운
           배경에서 **눌 수 있는 것으로 보이지 않았다.** 44px 손가락 표적도
           확보한다(옛 32px). `exercise-picker.tsx`의 `backHeader`와 같은 모양이다. */
        className="mb-1 flex h-11 w-11 flex-none items-center justify-center self-start rounded-full border border-line bg-surface-2 text-lg text-text"
      >
        ←
      </button>

      <h3 className="flex-none text-[22px] font-extrabold tracking-tight">
        {byPart ? "부위별 추천" : "상황별 추천"}
      </h3>
      <p className="mt-1 flex-none text-[12.5px] leading-4 text-muted">
        운동 이름을 몰라도 괜찮아요.
        <br />
        {byPart ? "운동할 부위를" : "오늘 상황을"} 먼저 골라보세요
      </p>
      <p className="mt-2.5 flex-none self-start rounded-full border border-accent/40 bg-accent-weak px-3 py-1.5 text-[11px] font-bold text-accent">
        ✨ {byPart ? "부위를" : "상황을"} 고르면 추천 운동을 먼저 보여드려요
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <p className="mb-2 text-sm font-extrabold">
          오늘 {byPart ? "어디를 운동할까요?" : "어떤 상황인가요?"}
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {choices.map((choice) => {
            const isActive = choice.key === activeKey;
            return (
              <button
                key={choice.key}
                type="button"
                onClick={() =>
                  byPart
                    ? onPart(choice.key as RecommendPart)
                    : onSituation(choice.key as SituationKey)
                }
                aria-pressed={isActive}
                className={`relative flex items-center gap-2 rounded-card border p-3 text-left ${
                  isActive
                    ? "border-accent bg-accent-weak"
                    : "border-line bg-surface-2"
                }`}
              >
                {/* ⚠️ `alt=""`가 맞다 — 바로 옆에 같은 뜻의 글자(`choice.label`)가
                    있어서, alt를 채우면 스크린리더가 부위 이름을 두 번 읽는다.
                    이미지가 안 떠도 글자·선택 상태·다음 이동은 그대로다(설계 §5). */}
                <Image
                  src={choice.iconSrc}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 flex-none"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-extrabold ${
                      isActive ? "text-accent" : ""
                    }`}
                  >
                    {choice.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                    {choice.sub}
                  </span>
                </span>
                {isActive && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mb-2 text-sm font-extrabold">
          ✨ 이 {byPart ? "부위에" : "상황에"} 맞는 추천 운동{" "}
          <span className="ml-1 rounded-full bg-accent-weak px-2 py-0.5 text-[11px] text-accent">
            {activeLabel}
          </span>
        </p>

        {activeKey === "interval" && onStartInterval ? (
          <div className="rounded-card border border-accent/50 bg-accent-weak/40 p-4">
            <p className="text-[13px] leading-5 text-text">
              음악에 맞춰 <b>20초 운동 · 10초 휴식</b>을 반복해요. 시작하면 화면이
              종목을 차례로 알려 주고, 음원이 끝나면 자동으로 기록돼요.
            </p>
            <button
              type="button"
              onClick={onStartInterval}
              className="mt-3 h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink"
            >
              전신 인터벌 고르러 가기
            </button>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            추천할 운동을 찾지 못했어요. 아래에서 직접 검색해 주세요.
          </p>
        ) : (
          list.map(({ item, note, thumb }) => {
            const isSelected = selected.has(item.id);
            return (
              // 카드 전체가 탭 영역이다 — '＋ 추가' 버튼만 누르게 하면
              // 손가락이 큰 화면에서 헛손질이 는다
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item)}
                aria-pressed={isSelected}
                className={`mb-2 flex w-full items-center gap-3 rounded-card border p-3 text-left ${
                  isSelected
                    ? "border-accent bg-accent-weak/40"
                    : "border-line bg-surface-2"
                }`}
              >
                {/* 썸네일은 있는 것만 그린다. 없으면 자리도 비운다 —
                    부위 공통 이미지를 채우면 카드끼리 구별이 안 돼서
                    세로 공간만 먹는다 */}
                {thumb && (
                  <Image
                    src={`/exercise-thumbs/${thumb}.png`}
                    alt=""
                    width={64}
                    height={64}
                    sizes="64px"
                    className="h-16 w-16 flex-none rounded-card-sm object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">
                    {item.name}
                  </span>
                  <span className="mt-1 inline-block rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">
                    {item.body_part}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-muted">
                    {note}
                  </span>
                </span>
                <span
                  className={`flex-none rounded-card-sm px-3 py-2 text-xs font-extrabold ${
                    isSelected
                      ? "bg-accent text-accent-ink"
                      : "border border-accent/40 bg-surface text-accent"
                  }`}
                >
                  {isSelected ? "✓ 추가됨" : "＋ 추가"}
                </span>
              </button>
            );
          })
        )}

        {/* 추천에 없는 종목을 찾는 사람에게 나가는 문을 준다 — 이게 없으면
            추천 목록이 곧 카탈로그 전부인 줄 알고 막힌다 */}
        <p className="mt-4 mb-2 text-sm font-extrabold">원하는 운동이 없나요?</p>
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center gap-2 rounded-card border border-line bg-surface-2 px-3 py-3 text-left"
        >
          {/* 옛 표기는 `🔍`였다 (2026-08-07 2차 시안으로 교체) — 허브의
              `운동 이름 검색` 카드와 같은 그림이다 */}
          <UiIcon name="hub-search" size={22} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold">운동 이름 검색</span>
            <span className="mt-0.5 block text-[10.5px] text-muted">
              추천 운동 없으면 검색해서 직접 찾을 수 있어요
            </span>
          </span>
          <span className="flex-none text-faint">›</span>
        </button>

        <p className="mt-3 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          ⓘ 처음엔 <b className="text-accent">추천 운동 2~3개</b>만 추가해도
          충분해요
        </p>
      </div>

      <div className="mt-2 flex flex-none items-center gap-3 border-t border-line pt-3">
        <p className="text-[13px] font-bold text-muted">
          선택한 운동 <span className="text-accent">{selected.size}개</span>
        </p>
        <button
          type="button"
          onClick={onNext}
          disabled={selected.size === 0}
          className="ml-auto h-12 flex-1 rounded-card-sm bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
