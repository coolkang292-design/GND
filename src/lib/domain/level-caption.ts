/**
 * 레벨이 단계 마지막에서 멈췄을 때(`capped`) 보여 줄 문구 (사용자 지시 2026-11-22).
 *
 * ⚠️ 경험치가 **사라지지 않는다**는 것을 먼저 말한다. 멈춘 레벨만 보면 "경험치가 헛되다"고 느끼기
 *    쉬운데, 실제로는 누적 경험치가 계속 쌓이고 진화하면 새 단계가 시작된다.
 */
export function cappedLevelCaption(input: { totalXp?: number; compact?: boolean }): string {
  if (input.compact) return "경험치 가득 · 진화 미션을 채워요";
  const total =
    typeof input.totalXp === "number" && Number.isFinite(input.totalXp)
      ? `(누적 ${Math.max(0, Math.round(input.totalXp)).toLocaleString("ko-KR")} XP) `
      : "";
  return `경험치는 계속 쌓여요 ${total}· 진화 미션을 채우면 다음 단계가 시작돼요`;
}
