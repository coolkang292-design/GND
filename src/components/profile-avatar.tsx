"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { avatarSource } from "@/lib/domain/avatar-source";

/**
 * 프로필 원형 아바타 — **우선순위: 직접 올린 사진 > 진화 캐릭터 얼굴 > 기본(이모지)**.
 *
 * - 사진이 있으면 그대로 `<Avatar>`가 그린다(사진 데이터는 건드리지 않는다).
 * - 사진이 없으면 현재 진화 단계의 얼굴 이미지(`faceSrc`)를 그린다. 경로가 단계마다
 *   달라서 단계가 바뀌면 브라우저 캐시와 상관없이 새 이미지가 뜬다.
 * - 얼굴 이미지가 없거나 불러오지 못하면 기존 이모지로 되돌린다(화면이 깨지지 않는다).
 *
 * ⚠️ `avatar_url`을 직접 판정하지 않는다 — `avatarSource`가 단일 판정이다.
 */
export function ProfileAvatar({
  src,
  faceSrc,
  className,
  label,
}: {
  /** `profiles.avatar_url` 값 그대로 */
  src: string | null | undefined;
  /** 진화 단계 얼굴 이미지. 없으면 기존 아바타 */
  faceSrc?: string | null;
  className?: string;
  label?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const isPhoto = avatarSource(src).kind === "photo";

  if (isPhoto || !faceSrc || failedSrc === faceSrc) {
    return <Avatar src={src} className={className} label={label} />;
  }

  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={faceSrc}
        alt={label ?? ""}
        className="h-full w-full rounded-full object-cover"
        onError={() => setFailedSrc(faceSrc)}
      />
    </span>
  );
}
