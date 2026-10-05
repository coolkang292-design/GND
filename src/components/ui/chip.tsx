import type { ReactNode } from "react";

/**
 * 알약(칩) 하나 — Performance Social 톤 (2026-10-05 사용자 지시 "톤앤매너에 맞게").
 *
 * 시안의 `12 DAYS STREAK`처럼 **어두운 유리 바탕 + 얇은 테두리 + 흰 글자**가 기본이다.
 * 예전에는 자리마다 금색 채움·녹색 채움·라임 채움 알약이 섞여 있어서, 사용자가 화면을
 * 보고 레벨 알약(금색 테두리)과 XP 바를 짚었다.
 *
 * 규칙:
 *  - 색은 **테두리와 점**에만 쓴다. 바탕을 색으로 채우지 않는다(채움은 눌리는 버튼 몫).
 *  - 상태(오늘 완료·운동 중·운동 전)는 `dot`으로 색을 주고 글자는 그대로 흰색이다 —
 *    색만으로 구별하지 않는다(글자가 항상 옆에 있다).
 *  - 라임 테두리(`accent`)는 "지금 할 수 있는 것"에만. 장식에 쓰지 않는다.
 */
export type ChipTone = "neutral" | "accent" | "streak";
export type ChipDot = "good" | "warn" | "muted";

const TONE: Record<ChipTone, string> = {
  neutral: "border-white/[0.14] text-text",
  accent: "border-accent/50 text-accent",
  streak: "border-warn/55 text-text",
};

const DOT: Record<ChipDot, string> = {
  good: "bg-good",
  warn: "bg-warn",
  muted: "bg-faint",
};

export function Chip({
  children,
  tone = "neutral",
  dot,
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  dot?: ChipDot;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5 flex-none items-center gap-[5px] rounded-full border bg-black/35 px-2 text-[11px] font-bold leading-none whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {/* ⚠️ 높이를 **짝수(20px)로 못 박는다** (2026-10-05 사용자 지적 "점 정렬").
          예전엔 `py-[3px]`로 높이가 19px이 되어 6px 점의 위쪽이 6.5px — 반 픽셀에 걸려
          1배율 화면에서 흐릿하게 아래로 처져 보였다. 20px − 테두리 2px = 18px 안에서
          6px 점은 정확히 6px 위치에 앉는다. 점 크기를 바꾸면 짝수로 바꿔라. */}
      {dot && <span aria-hidden className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[dot]}`} />}
      {children}
    </span>
  );
}
