/** Cosmetic stamps cannot change workout success, XP or challenge scores. */
export type StampVariant = "basic" | "orange" | "gold";

/** The impact ends before the universal achievement copy appears. */
export const STAMP_HEADLINE_DELAY_MS = 1350;
/** Special-color omen appears after the universal achievement copy. */
export const STAMP_SPECIAL_LINE_DELAY_MS = 1950;
export function stampCompletionLine(variant: StampVariant): string {
  if (variant === "gold") return "오늘, 뭔가 좋은 일 생기려나?";
  if (variant === "orange") return "오늘은 느낌이 좀 좋은데?";
  return "오늘도 해냈다.";
}
export function isStampVariant(value: unknown): value is StampVariant {
  return value === "basic" || value === "orange" || value === "gold";
}
