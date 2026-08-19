import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 프로필 카드를 **열었다는 사실**만 남긴다 (0081).
 *
 * ⚠️⚠️ **이걸 지우면 이 기능이 쓰이는지 영원히 알 수 없다.**
 * 꾸준왕 열람권은 만든 지 한 달이 넘도록 `record_views`가 **0행**이었는데,
 * 그걸 알아낼 수 있었던 유일한 이유가 **테이블이 있었기 때문**이다. 이 앱에는
 * 화면 이벤트 계측이 한 건도 없다(2026-08-19 확인 — `track(`·posthog·gtag 0건).
 *
 * ⚠️ `record_views`(꾸준왕 열람권)와 **다른 테이블**이다. 섞으면 열람권 통계가
 * 오염된다 — 열람권은 "주 5일 운동해야 열리는 권리"고 이건 그냥 카드를 연 것이다.
 *
 * ⚠️ **알림을 보내지 않는다.** 프로필을 열 때마다 상대 폰이 울리면 아무도 안 누른다.
 */
export type ProfileViewSource = "feed" | "crew" | "home" | "challenge";

/**
 * 실패해도 **조용히 삼킨다.** 계측 때문에 프로필 시트가 안 열리면 본말전도다.
 * 0081을 아직 Run 하지 않은 서버에서도 여기서만 실패하고 화면은 멀쩡하다.
 */
export async function recordProfileView(
  viewerId: string,
  targetId: string,
  source: ProfileViewSource,
): Promise<void> {
  // 자기 프로필은 남기지 않는다 — DB에도 같은 제약이 있다(profile_views_not_self).
  if (!viewerId || !targetId || viewerId === targetId) return;
  try {
    await getSupabaseBrowserClient()
      .from("profile_views")
      .insert({ viewer_id: viewerId, target_id: targetId, source });
  } catch {
    // 계측은 화면을 막지 않는다
  }
}
