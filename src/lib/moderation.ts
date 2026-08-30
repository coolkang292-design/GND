/**
 * 차단·신고 RPC 래퍼 (0089).
 *
 * 왜 crew-link.ts에 안 넣었나: 차단은 크루 관계가 **없는** 사람에게도 건다
 * (공개 모집으로 만난 모르는 사람이 주 대상이다). 크루 파일에 두면 "크루한테만
 * 하는 것"으로 읽힌다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toSocialError } from "@/lib/social";
import type { ReportReason } from "@/lib/domain/moderation";

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

export type ReportOutcome = "received" | "already_open";

/**
 * 신고. 자동 조치는 없다 — /admin에서 사람이 본다.
 *
 * 같은 상대에 대해 처리 안 된 신고가 이미 있으면 서버가 `already_open`을 준다.
 * **오류가 아니다.** 화면에서 실패로 다루면 사용자가 다시 누르는데, 서버는
 * 계속 같은 답을 준다. "접수됐어요"로 똑같이 보여주는 편이 정확하다.
 */
export async function reportUser(input: {
  targetId: string;
  reason: ReportReason;
  note?: string;
  challengeId?: string;
}): Promise<ReportOutcome> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("report_user", {
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_note: input.note?.trim() ? input.note.trim() : null,
    p_challenge_id: input.challengeId ?? null,
  });
  if (error) throw toSocialError(error);
  return (data as { status: ReportOutcome }).status;
}
