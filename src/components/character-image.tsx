"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/** 여성 경로 → 기본(남성) 경로. 외형이 male이거나 이미 기본이면 그대로다. */
export function defaultCharacterSrc(src: string): string {
  return src.replace("/characters/female/", "/characters/");
}

/**
 * 진화 캐릭터 이미지 — **로딩에 실패하면 기본 캐릭터로 되돌린다.**
 * 외형별 이미지가 없거나(404) 단계가 범위를 벗어나도 깨진 아이콘 대신 기존
 * 캐릭터가 보인다. `src`는 문자열 경로여야 한다(프로필 사진·이모지에는 쓰지 않는다).
 */
export function CharacterImage({
  src,
  alt,
  ...rest
}: Omit<ImageProps, "src"> & { src: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // src가 바뀌면(레벨업·외형 로딩 완료) 실패 기록을 버린다 — 새 경로는 다시 시도한다.
  const failed = failedSrc === src;
  const fallback = defaultCharacterSrc(src);
  return (
    <Image
      {...rest}
      alt={alt}
      src={failed ? fallback : src}
      onError={() => {
        if (!failed && fallback !== src) setFailedSrc(src);
      }}
    />
  );
}
