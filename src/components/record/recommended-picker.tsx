"use client";

import Image from "next/image";
import { useRef } from "react";
import { UiIcon } from "@/components/ui-icon";
import { GndIcon, type GndIconName } from "@/components/ui/gnd-icon";
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
import { PickActions } from "./pick-actions";

/** 그리드 한 칸 — 부위와 상황이 같은 모양을 쓴다 */
/** ⚠️ `iconSrc`는 이모지가 아니라 이미지 경로다 (`PART_META` 주석 참조) */
type Choice = {
  key: string;
  label: string;
  sub: string;
  iconSrc: string;
  /** 상황 카드만 — GND 아이콘 2.0(아이보리 윤곽선). 있으면 `iconSrc` 대신 그린다 */
  icon?: GndIconName;
  /** 상황 카드만 — 배경 사진 (2026-10-05 사용자 지시) */
  photo?: string;
};

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
  onAdd,
  onAdjust,
  onStartInterval,
  intervalCta,
}: {
  mode: "part" | "situation";
  catalog: CatalogExercise[];
  challengeCategories: ReadonlySet<GoalCategory> | null;
  part: RecommendPart;
  onPart: (next: RecommendPart) => void;
  situation: SituationKey;
  onSituation: (next: SituationKey) => void;
  /** 선택된 카탈로그 id — 검색 화면에서 고른 것까지 **피커 전체**의 선택이다 */
  selected: ReadonlySet<string>;
  onToggle: (item: CatalogExercise) => void;
  onBack: () => void;
  /** '원하는 운동이 없나요?' — 검색 화면으로 */
  onSearch: () => void;
  /** 고른 것을 기본 세트(3세트·10회)로 바로 담는다 */
  onAdd: () => void;
  /** 세트 설정 화면으로 — 없으면 버튼이 안 나온다 (`PickActions`) */
  onAdjust?: () => void;
  /**
   * 전신 인터벌을 연다 (사용자 지시 2026-08-13).
   *
   * `interval` 칸은 다른 칸과 **하는 일이 다르다** — 종목을 목록에 담는 대신
   * 인터벌을 시작한다. 담기만 하면 3세트 10회짜리 일반 운동이 되어 버린다.
   * 안 넘기면 그 칸은 미리보기만 보여 준다.
   */
  onStartInterval?: () => void;
  /** 인터벌 칸의 버튼 문구 — 기록 화면은 "고르러 가기", 달력은 "계획하기" */
  intervalCta?: string;
}) {
  const byPart = mode === "part";
  const scrollRef = useRef<HTMLDivElement>(null);
  const recHeadRef = useRef<HTMLParagraphElement>(null);
  const recListRef = useRef<HTMLDivElement>(null);

  /**
   * 고른 상황·부위의 추천 운동이 **가려져 있으면** 그 머리글까지 내려 준다 (2026-10-05).
   *
   * ⚠️ 375×667 폰에서 실측하니 그리드 아래 첫 추천 카드가 스크롤 영역의
   *    309px 지점에서 시작하는데 보이는 높이는 280px였다(부위별 298 / 279).
   *    카드를 눌러도 ✓ 하나만 바뀌고 `＋ 담기`는 화면 밖이라, 사용자에게는
   *    "고른 다음에 추가가 안 된다"로 보였다.
   *
   * 이미 보이면 움직이지 않는다 — 큰 화면에서 그리드를 밀어 올리면 다른 상황과
   * 비교하려는 사람이 다시 올려야 한다. 그리드를 접지 않는 것도 같은 이유다
   * (부위는 선택지를 감추지 않는 그리드 — 이 파일 머리 주석, 사용자 지시).
   */
  function revealRecommendations() {
    const box = scrollRef.current;
    const head = recHeadRef.current;
    if (!box || !head) return;
    const boxRect = box.getBoundingClientRect();
    const first = recListRef.current?.firstElementChild ?? head;
    if (first.getBoundingClientRect().bottom <= boxRect.bottom) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo?.({
      top: box.scrollTop + head.getBoundingClientRect().top - boxRect.top - 4,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  const situations = visibleSituations(
    challengeCategories,
    onStartInterval !== undefined,
  );
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
        icon: s.icon,
        photo: s.photo,
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
    <div className="relative isolate flex min-h-0 flex-1 flex-col">
      {/*
        머리글 배경 사진 (2026-10-05 사용자 지시 — 시안처럼 제목 뒤에 사진을 어둡게).
        아래로 갈수록 시트 색(surface)으로 사라져 글자와 카드가 그대로 읽힌다.
        ⚠️ 시트 안쪽 여백(p-4)까지 덮으려고 -mx-4 -mt-4로 편다.
      */}
      <div
        aria-hidden
        data-testid="recommend-header-photo"
        className="pointer-events-none absolute -top-4 -right-4 -left-4 -z-10 h-56 overflow-hidden rounded-t-[22px]"
      >
        <Image
          src={byPart ? "/program-assets/arms.webp" : "/program-assets/shoulder.webp"}
          alt=""
          fill
          sizes="(max-width: 480px) 100vw, 480px"
          className="object-cover object-[50%_30%] opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-surface/30 via-surface/75 to-surface" />
      </div>
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
      <p className="mt-2.5 flex-none self-start rounded-full border border-accent/50 bg-accent/[0.08] px-2.5 py-1 text-[11px] font-bold text-accent">
        ✨ {byPart ? "부위를" : "상황을"} 고르면 추천 운동을 먼저 보여드려요
      </p>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pt-3">
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
                onClick={() => {
                  if (byPart) onPart(choice.key as RecommendPart);
                  else onSituation(choice.key as SituationKey);
                  // 새 목록이 그려진 뒤에 잰다
                  requestAnimationFrame(revealRecommendations);
                }}
                aria-pressed={isActive}
                /*
                  GND 아이콘 2.0 카드 (2026-10-05 제안서 §4). 선택은 색 하나로만 보이지
                  않게 테두리·배경·✓ 셋을 함께 바꾼다(§14). 골드 면적은 테두리·✓·제목·
                  아이콘 포인트로만 제한한다.
                */
                className={`relative isolate flex min-h-16 items-center gap-2.5 overflow-hidden rounded-[20px] border p-3 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${
                  isActive
                    ? "border-accent bg-[#1c1a12]"
                    : "border-white/10 bg-surface-2"
                }`}
              >
                {choice.photo && (
                  /* 배경 사진 — 왼쪽(아이콘·글자 자리)은 덮고 오른쪽으로 갈수록 비친다 */
                  <span aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                    <Image
                      src={choice.photo}
                      alt=""
                      fill
                      sizes="240px"
                      className={`object-cover object-[70%_35%] ${isActive ? "opacity-45" : "opacity-35"}`}
                    />
                    <span
                      className={`absolute inset-0 bg-gradient-to-r ${
                        isActive
                          ? "from-[#1c1a12] via-[#1c1a12]/80 to-[#1c1a12]/20"
                          : "from-surface-2 via-surface-2/80 to-surface-2/20"
                      }`}
                    />
                  </span>
                )}
                {/* ⚠️ `alt=""`가 맞다 — 바로 옆에 같은 뜻의 글자(`choice.label`)가
                    있어서, alt를 채우면 스크린리더가 부위 이름을 두 번 읽는다.
                    이미지가 안 떠도 글자·선택 상태·다음 이동은 그대로다(설계 §5). */}
                {choice.icon ? (
                  <GndIcon
                    name={choice.icon}
                    size={30}
                    selected={isActive}
                    className="flex-none"
                  />
                ) : (
                  <Image
                    src={choice.iconSrc}
                    alt=""
                    width={40}
                    height={40}
                    /* 부위 아이콘은 남색 정사각형이라 모서리를 둥글린다 (2026-10-05) */
                    className="h-10 w-10 flex-none rounded-lg"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-bold ${
                      isActive ? "text-accent" : "text-text"
                    }`}
                  >
                    {choice.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                    {choice.sub}
                  </span>
                </span>
                {isActive && (
                  <span className="absolute top-1.5 right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p ref={recHeadRef} className="mb-2 text-sm font-extrabold">
          ✨ 이 {byPart ? "부위에" : "상황에"} 맞는 추천 운동{" "}
          <span className="ml-1 rounded-full bg-accent-weak px-2 py-0.5 text-[11px] text-accent">
            {activeLabel}
          </span>
        </p>

        <div ref={recListRef}>
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
              {intervalCta ?? "전신 인터벌 고르러 가기"}
            </button>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            추천할 운동을 찾지 못했어요. 아래에서 직접 검색해 주세요.
          </p>
        ) : (
          list.map(({ item, note, thumbSrc }) => {
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
                {thumbSrc && (
                  <Image
                    src={thumbSrc}
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
                  {/* '추가됨'이라고 쓰지 않는다 — 아직 담기만 한 것이고 실제로
                      들어가는 것은 아래 `바로 추가`다 (2026-10-05) */}
                  {isSelected ? "✓ 담음" : "＋ 담기"}
                </span>
              </button>
            );
          })
        )}
        </div>

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

      <PickActions count={selected.size} onAdd={onAdd} onAdjust={onAdjust} />
    </div>
  );
}
