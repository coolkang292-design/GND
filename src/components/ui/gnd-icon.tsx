import type { ReactNode } from "react";

/**
 * GND 아이콘 2.0 — 아이보리 윤곽선 + 선택 시 작은 골드 포인트 (2026-10-05).
 *
 * 운동 선택 화면의 금색 이모지풍 아이콘을 바꾸는 제안서("GND Icon System Refresh")에 따라
 * Codex가 그린 SVG 6종(`운동 이미지/GPT 생성된 이미지/UI아이콘_리프레시_2026-10-05/SVG`)을
 * 그대로 옮겼다. `situ-challenge`·`situ-interval`·`routine`은 같은 규격(32 격자, 선 1.8,
 * round cap/join)으로 클로드가 그렸다 — Codex 묶음에 없던 상황 카드·추천 루틴용.
 *
 * ⚠️ 아이콘 전체를 골드로 칠하지 않는다(제안서 §3). 선택 상태는 `accent` 묶음만 골드가 된다.
 * 선택은 색 하나로만 보이지 않게 카드의 테두리·✓와 함께 쓴다(제안서 §14).
 *
 * ⚠️ 장식이다 — `aria-hidden`. 옆에 같은 뜻의 글자가 있다.
 */
export type GndIconName =
  | "hub-situation"
  | "hub-part"
  | "routine"
  | "situ-beginner"
  | "situ-challenge"
  | "situ-no-machines"
  | "situ-interval"
  | "situ-short"
  | "situ-cardio";

const IVORY = "#F6F3EA";
const GOLD = "#D4AF37";

const ICONS: Record<GndIconName, { base: ReactNode; accent: ReactNode }> = {
  "hub-situation": {
    base: (
      <>
        <circle cx="15" cy="17" r="10" />
        <circle cx="15" cy="17" r="6" />
        <circle cx="15" cy="17" r="2" />
      </>
    ),
    accent: <path d="m15 17 11-11m-4 0h4v4" />,
  },
  "hub-part": {
    base: (
      <path d="M13 5v4c-2 0-4 1-5 3L4 17l3 3 3-3v10h12V17l3 3 3-3-4-5c-1-2-3-3-5-3V5M13 5c1 2 5 2 6 0M12 15c2 1 6 1 8 0M16 16v7" />
    ),
    accent: <path d="m8 12-2 3" />,
  },
  // 사다리 — 세트별 횟수가 오르내리는 추천 루틴. 가로대 하나만 골드
  routine: {
    base: <path d="M10 4v24M22 4v24M10 9h12M10 21h12M10 27h12" />,
    accent: <path d="M10 15h12" />,
  },
  "situ-beginner": {
    base: (
      <>
        <circle cx="12" cy="7" r="3" />
        <path d="M5 22v-4a7 7 0 0 1 14 0v4M12 14v8m0-2-4 8m4-8 4 8" />
      </>
    ),
    accent: <path d="M25 6v6m-3-3h6" />,
  },
  // 트로피 — 챌린지 목표에 맞게. 받침의 별만 골드
  "situ-challenge": {
    base: (
      <path d="M10 5h12v7a6 6 0 0 1-12 0V5ZM10 8H6a4 4 0 0 0 4 5M22 8h4a4 4 0 0 1-4 5M16 18v5m-5 4h10M12 27l1-4h6l1 4" />
    ),
    accent: <path d="m16 7.5.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3Z" />,
  },
  "situ-no-machines": {
    base: (
      <g transform="rotate(-22 15 18)">
        <path d="M4 15v6m3-9v12m3-9v6m0-3h10m0-3v6m3-9v12m3-9v6" />
      </g>
    ),
    accent: (
      <>
        <path d="M24 6a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
        <circle cx="26.5" cy="12.5" r=".35" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // 집 + 번개 — 집에서 하는 인터벌. 번개만 골드
  "situ-interval": {
    base: <path d="M4 15 16 5l12 10M7 13v14h18V13" />,
    accent: <path d="m17 14-4 6h5l-3 5" />,
  },
  "situ-short": {
    base: (
      <>
        <circle cx="16" cy="18" r="9" />
        <path d="M13 3h6m-3 0v6m8-1 2 2m-10 8 4 2" />
      </>
    ),
    accent: <path d="M16 12v6" />,
  },
  "situ-cardio": {
    base: (
      <>
        <path d="M9 6c2 2 4 3 6 3l1 5c2 4 5 5 10 7 2 1 3 2 3 5H7c-3 0-4-2-3-4l4-8c1-3 2-5 1-8Z" />
        <path d="M5 23h22m-11-9-3 2m6 1-3 2m-11-1H2" />
      </>
    ),
    accent: <path d="M2 13h4" />,
  },
};

export function GndIcon({
  name,
  size = 32,
  selected = false,
  className,
}: {
  name: GndIconName;
  size?: number;
  selected?: boolean;
  className?: string;
}) {
  const icon = ICONS[name];
  const accent = selected ? GOLD : IVORY;
  return (
    <svg
      aria-hidden
      data-icon={name}
      data-selected={selected ? "true" : undefined}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={IVORY}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <g>{icon.base}</g>
      <g stroke={accent} color={accent}>
        {icon.accent}
      </g>
    </svg>
  );
}
