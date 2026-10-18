import { getBadgeCatalog } from "@/lib/badges";
import { getCrewMemberProfile } from "@/lib/progression";
import { buildAchievementHistory } from "@/lib/domain/profile-achievements";

/** 사용자 본인의 성취 이력. RPC는 본인·크루 접근권한을 서버에서 검사한다. */
export async function getMyAchievementHistory(userId: string) {
  const [profile, catalog] = await Promise.all([
    getCrewMemberProfile(userId),
    getBadgeCatalog(),
  ]);
  return buildAchievementHistory({
    joinedAt: profile.joinedAt,
    levelUps: profile.levelUps,
    badges: profile.badges,
    catalog,
  });
}
