import type { BodyPart } from "@/lib/types";
import data from "./exercise-images.data.json";

/**
 * 운동 이름 앞에 붙는 그림 (2026-10-05).
 *
 * 연결표는 `exercise-images.data.json` — **운동 ID(UUID) → 그림 파일**. 손으로 고치지
 * 말고 `python scripts/build-exercise-images.py`로 다시 만든다. 그 스크립트가 Codex
 * 파일럿 PASS와 사용자 시트에서 자른 것을 합쳐 `public/exercise-images/{ID}.webp`도 쓴다.
 *
 * ⚠️ **이름이 아니라 ID로 잇는다**(Codex 인수인계서 2026-10-05). 이름은 띄어쓰기 하나로
 * 어긋나고, 사용자가 같은 이름으로 만든 직접 운동에도 엉뚱하게 붙는다. JSON의 `name`은
 * 사람이 읽고 테스트가 매니페스트와 대조하라고 둔 것이다.
 *
 * ⚠️ **연결표를 DB가 아니라 코드에 두는 이유.** 그림 파일은 `public/`이라 배포해야
 * 올라가는데 DB는 운영과 공유한다. DB에 먼저 쓰면 배포 전까지 운영 앱에 깨진
 * 그림이 뜬다. 파일과 연결표가 같은 배포로 나가야 어긋날 틈이 없다.
 *
 * ⚠️ 하는 방식이 다르면 그림도 달라야 한다(사용자 지시). 한 파일을 여러 ID가 같이
 * 쓰는 것은 **같은 운동의 다른 이름**일 때뿐이다(스쿼트=바벨 백스쿼트 등).
 *
 * 그림마다 출처(`source`)를 적는다 — 무료 소스로 채운 것을 골라 내리거나 남은 교체
 * 수를 셀 수 있게(사용자 결정 2026-10-05). 프롬프트는 `docs/exercise-image-prompts.md`.
 */
export type ExerciseImageSource = "gnd" | "wger" | "free-exercise-db";

export type ExerciseImageEntry = {
  name: string;
  file: string;
  source: ExerciseImageSource;
  origin: string;
};

export const EXERCISE_IMAGES = data as Readonly<Record<string, ExerciseImageEntry>>;

/** 운동 그림이 있으면 경로, 없으면 undefined */
export function exerciseImageSrc(exerciseId: string): string | undefined {
  const hit = EXERCISE_IMAGES[exerciseId];
  return hit ? `/exercise-images/${hit.file}.webp` : undefined;
}

/**
 * 그림을 **불러오지 못했을 때만** 쓰는 부위 아이콘(Codex 인수인계서의 로딩 실패 fallback).
 *
 * ⚠️ 그림이 **아예 없는** 운동에는 쓰지 않는다 — 빈 칸이다(사용자 결정 2026-10-05).
 * 335개 중 대부분이 같은 부위 아이콘으로 채워지면 구별에 도움이 안 되고 세로 공간만
 * 먹는다(2026-08-06 설계 가정 ⑧과 같은 결론).
 * 유산소는 부위 아이콘이 없어 상황 추천의 유산소 아이콘을 빌린다.
 */
const PART_FALLBACK: Record<BodyPart, string> = {
  가슴: "/ui-icons/part-chest.webp",
  등: "/ui-icons/part-back.webp",
  하체: "/ui-icons/part-legs.webp",
  어깨: "/ui-icons/part-shoulders.webp",
  팔: "/ui-icons/part-arms.webp",
  코어: "/ui-icons/part-core.webp",
  유산소: "/ui-icons/situ-cardio.webp",
};

export function partIconSrc(bodyPart: BodyPart): string {
  return PART_FALLBACK[bodyPart];
}
