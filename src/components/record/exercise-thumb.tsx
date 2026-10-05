"use client";
import Image from "next/image";
import { useContext, useState } from "react";
import { localTrialImage, LocalTrialFailureContext } from "@/lib/domain/exercise-image-local-trial";
import { exerciseImageSrc, partIconSrc } from "@/lib/domain/exercise-images";
import type { BodyPart } from "@/lib/types";

/**
 * 운동 이름 앞 48px 그림 (2026-10-05).
 *
 * 세 가지 상태가 있다.
 * - **그림 있음** — 운동 ID로 찾은 그림. 시트 배경째 잘라 쓰는 화풍이라 타일 색을
 *   시트 배경색 `#1e2429`로 맞춘다(다르면 가장자리에 사각 테두리가 비친다)
 * - **그림 없음** — 같은 크기의 **빈 칸**(사용자 결정 2026-10-05). 이름 줄을 맞추면서
 *   그림 있는 운동만 눈에 띄게 한다. 부위 아이콘을 채우지 않는다(`exercise-images.ts`)
 * - **불러오기 실패** — 부위 아이콘(Codex 인수인계서의 로딩 실패 fallback). 줄은 그대로다
 *
 * `localTrialImage`는 Codex의 로컬 QA 전용(개발 모드 + 명시적 플래그). 운영에서는 꺼진다.
 *
 * ⚠️ `alt=""`가 맞다 — 바로 옆에 운동 이름이 있어서, alt를 채우면 스크린리더가
 * 이름을 두 번 읽는다(`recommended-picker.tsx`와 같은 이유).
 */
export function ExerciseThumbTile({
  id,
  name,
  bodyPart,
}: {
  /** 카탈로그 운동 ID. 없으면(로컬 QA) 그림 없음으로 본다 */
  id?: string;
  name: string;
  bodyPart: BodyPart;
}) {
  const broken = useContext(LocalTrialFailureContext);
  const src = localTrialImage(name, broken) ?? (id ? exerciseImageSrc(id) : undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src) {
    return <span aria-hidden className="h-12 w-12 flex-none rounded-lg bg-surface-2" />;
  }
  if (failedSrc !== src) {
    return (
      <span className="h-12 w-12 flex-none overflow-hidden rounded-lg bg-[#1e2429]">
        <Image
          src={src}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12"
          onError={() => setFailedSrc(src)}
        />
      </span>
    );
  }
  return (
    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-surface-2">
      <Image
        src={partIconSrc(bodyPart)}
        alt=""
        width={30}
        height={30}
        className="h-[30px] w-[30px] opacity-80"
      />
    </span>
  );
}
