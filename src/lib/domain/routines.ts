/**
 * 나만의 운동 루틴 — 슬롯 한도 계산 (2026-08-02).
 *
 * 설계: docs/superpowers/specs/2026-08-02-routines-frequent-exercises-calendar-planning-design.md
 *
 * 한도 = 기본 3개 + 달성한 `routine_slot_*` 보상 수.
 *
 * ⚠️ **레벨 숫자(12·27)를 여기에 박지 않는다.** 0022가 `level_definitions`에
 * 심어 둔 배치가 단일 진실이고, 마이그레이션 0056의 트리거도 같은 표를 읽는다.
 * 숫자를 코드에 복사하면 표를 옮겼을 때 화면과 서버가 조용히 갈라진다
 * (CLAUDE.md §같은 사실을 두 곳에 두지 않는다).
 */

export const ROUTINE_BASE_SLOTS = 3;

export const ROUTINE_SLOT_REWARD_KEYS = [
  "routine_slot_1",
  "routine_slot_2",
] as const;

/** `getLevelRewards()` 결과 중 이 계산에 필요한 최소 형태 */
export type SlotReward = {
  level: number;
  rewardKey: string | null;
};

function slotRewardLevels(rewards: readonly SlotReward[]): number[] {
  return rewards
    .filter((reward) =>
      ROUTINE_SLOT_REWARD_KEYS.includes(
        reward.rewardKey as (typeof ROUTINE_SLOT_REWARD_KEYS)[number],
      ),
    )
    .map((reward) => reward.level)
    .sort((a, b) => a - b);
}

/**
 * 저장할 수 있는 루틴 개수.
 *
 * 보상 표를 못 불러온 경우(빈 배열)에는 기본값으로 버틴다 — 한도를 무한으로
 * 열어 두는 것보다 낫다. 서버 트리거가 어차피 진짜 한도를 강제한다.
 */
export function routineSlotLimit(
  currentLevel: number,
  rewards: readonly SlotReward[],
): number {
  const reached = slotRewardLevels(rewards).filter(
    (level) => currentLevel >= level,
  );
  return ROUTINE_BASE_SLOTS + reached.length;
}

/** 다음 슬롯이 열리는 레벨. 더 열릴 게 없으면 null. */
export function nextRoutineSlotLevel(
  currentLevel: number,
  rewards: readonly SlotReward[],
): number | null {
  return (
    slotRewardLevels(rewards).find((level) => level > currentLevel) ?? null
  );
}
