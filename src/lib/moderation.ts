/**
 * 차단 RPC 래퍼 (0089).
 *
 * 왜 crew-link.ts에 안 넣었나: 차단은 크루 관계가 **없는** 사람에게도 건다.
 * 크루 파일에 두면 "크루한테만 하는 것"으로 읽힌다.
 *
 * ⚠️ `reportUser`가 여기 있었는데 걷어냈다 (2026-08-31). 서버 RPC(`report_user`)는
 *    0089에 남아 있지만 **아무도 부르지 않는다** — 신고를 받아도 조치할 수단이
 *    GND에 하나도 없어서, 창구만 있고 뒤가 없는 상태였다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toSocialError } from "@/lib/social";

export type BlockedUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  blockedAt: Date;
};

/**
 * 차단. 오가던 크루 요청도 서버가 같이 지운다(0089).
 *
 * ⚠️ 성공해도 화면을 그 자리에서 새로 그려야 한다. 차단은 `is_crew_with`를
 *    통째로 false로 만들어서, 이미 받아 둔 피드·프로필 데이터가 화면에 남아
 *    있으면 "차단했는데 그대로 보이는" 상태가 된다. 다시 조회하면 사라진다.
 */
export async function blockUser(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("block_user", { p_target_id: targetId });
  if (error) throw toSocialError(error);
}

export async function unblockUser(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("unblock_user", { p_target_id: targetId });
  if (error) throw toSocialError(error);
}

/**
 * 차단한 사람 목록.
 *
 * ⚠️ `profiles`를 직접 select하면 안 된다. 차단하면 `is_crew_with`가 false가
 *    되어 `profiles_select_own_or_crew`에 막히고, 정작 **차단한 사람의 이름을
 *    못 읽어** 해제 버튼에 "알 수 없음"만 뜬다. RPC가 그 문을 우회한다.
 */
export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("list_blocked_users");
  if (error) throw toSocialError(error);
  return ((data ?? []) as {
    id: string;
    nickname: string;
    avatar_url: string | null;
    blocked_at: string;
  }[]).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    blockedAt: new Date(r.blocked_at),
  }));
}
