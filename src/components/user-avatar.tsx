"use client";

import { ProfileAvatar } from "@/components/profile-avatar";
import { useCharacterFace } from "@/lib/character-faces";

/**
 * 사람 한 명의 원형 아바타 — **직접 올린 사진 > 그 사람의 진화 캐릭터 얼굴 > 기본(이모지)**.
 *
 * `<Avatar>`와 같은 자리에 `userId`만 더해 쓴다. 그 사람의 단계·외형은 화면마다 따로 들고
 * 있지 않고 `useCharacterFace`가 한 곳에서 가져온다(같은 화면의 요청은 한 번으로 묶인다).
 * 값을 못 얻으면(관계 없음·조회 실패) 기존 아바타 그대로다.
 */
export function UserAvatar({
  userId,
  src,
  className,
  label,
}: {
  userId: string | null | undefined;
  /** `profiles.avatar_url` 값 그대로 */
  src: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const faceSrc = useCharacterFace(userId);
  return <ProfileAvatar src={src} faceSrc={faceSrc} className={className} label={label} />;
}
