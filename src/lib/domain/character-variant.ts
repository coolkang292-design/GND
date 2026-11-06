/**
 * 캐릭터 외형 — 순수 부분. `profiles.character_variant` (기본 'male').
 * 레벨·XP·단계 계산과 무관하다 — 이미지 경로만 바꾼다.
 */
export type CharacterVariant = "male" | "female";

/** 선택 화면·프로필에 보이는 캐릭터 이름. 단계 이름(개노답…)과는 별개다. */
export const CHARACTER_NAMES: Record<CharacterVariant, string> = {
  male: "무쇠",
  female: "하루",
};

export const CHARACTER_VARIANTS: CharacterVariant[] = ["male", "female"];

export function normalizeCharacterVariant(v: unknown): CharacterVariant {
  return v === "female" ? "female" : "male";
}

/**
 * `/characters/char-N.png` → female이면 `/characters/female/char-N.png`.
 * male이거나 모르는 경로면 그대로 둔다.
 */
export function characterSrc(path: string, variant: CharacterVariant): string {
  if (variant !== "female") return path;
  return path.replace(/^\/characters\/(char-[1-7]\.png)$/, "/characters/female/$1");
}
