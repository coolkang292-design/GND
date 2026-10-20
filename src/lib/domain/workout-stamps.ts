/** Cosmetic stamps cannot change workout success, XP or challenge scores. */
export type StampVariant = "basic" | "orange" | "gold";
export function stampCompletionLine(variant: StampVariant): string {
  if (variant === "gold") return "오늘, 뭔가 좋은 일 생기려나?";
  if (variant === "orange") return "오늘은 느낌이 좀 좋은데?";
  return "오늘의 도장, 찍었다!";
}
export function isStampVariant(value: unknown): value is StampVariant {
  return value === "basic" || value === "orange" || value === "gold";
}
