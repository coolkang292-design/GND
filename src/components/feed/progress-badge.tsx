"use client";

import { CharacterImage } from "@/components/character-image";
import { useCharacterFace } from "@/lib/character-faces";
import { characterSrc } from "@/lib/domain/character-variant";
import { progressBadgeText, type ProgressEvent } from "@/lib/domain/progress-event";

/**
 * 레벨업·진화 배지 — 시안 `피드 도착`의 "캐릭터 그림 + 꾸준러로 진화 / Lv.16 달성" (2026-11-20, 사용자 시안).
 *
 * 피드 카드의 **본문 줄**이다 — 숫자 줄·기록 갱신 줄과 같은 상자 톤. 사진 카드든 사진 없는 카드든 같은 자리·같은
 * 모양이다(사용자 지시 2026-11-20 "사진에 표시말고 사진 없는 카드처럼"). 처음엔 사진 위에 겹쳤는데 사진을 가려서
 * 걷어냈다 — 되살리지 마라.
 *
 * ⚠️ 그림은 **오른 뒤 단계**(`event.stage`)의 캐릭터다. 지금 단계가 아니다 — 그날의 사건을 보여 주는 기록이라
 *    그 사람이 나중에 더 진화해도 이 카드의 그림은 바뀌지 않는다.
 * ⚠️ 외형(남/여)은 그 사람의 캐릭터 얼굴 경로로 안다(`useCharacterFace`, 다른 아바타와 같은 한 번의 묶음 조회).
 *    모르면 기본(남성) 그림이고, 그림 파일이 없으면 `CharacterImage`가 기본 캐릭터로 되돌린다.
 */
export function ProgressBadge({
  event,
  userId,
}: {
  event: ProgressEvent;
  userId: string | null | undefined;
}) {
  const face = useCharacterFace(userId);
  const charVariant = face?.includes("/characters/female/") ? "female" : "male";
  const src = characterSrc(`/characters/char-${event.stage}.png`, charVariant);
  const text = progressBadgeText(event);
  return (
    <div
      data-testid="progress-badge"
      className="flex items-center gap-2.5 rounded-card-sm border border-accent/40 bg-surface-2/60 px-3 py-2"
    >
      <CharacterImage src={src} alt="" width={44} height={44} className="h-11 w-11 flex-none object-contain" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-black">
          <span className="text-accent">{text.accent}</span>
          {text.rest}
        </p>
        <p className="mt-0.5 text-[12px] font-bold text-muted">{text.sub}</p>
      </div>
    </div>
  );
}
