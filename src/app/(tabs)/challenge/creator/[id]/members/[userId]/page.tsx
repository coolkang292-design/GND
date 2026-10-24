import { notFound } from "next/navigation";
import { CreatorMemberDetailScreen } from "@/components/challenge/creator/creator-member-detail";
import { CREATOR_BASE_PATH, requireHostChallenge } from "@/lib/creator-access";
import { loadCreatorMemberDetail } from "@/lib/creator-data";

export const dynamic = "force-dynamic";

/**
 * 참여자 상세 (시안 2). 방장 확인(`requireHostChallenge`) 다음에 **그 방의 joined 회원인지**를
 * 한 번 더 본다 — 아니면 404. 주소의 userId만 바꿔 다른 방 회원을 읽는 길을 막는다.
 */
export default async function CreatorMemberPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;
  const { db, challenge } = await requireHostChallenge(id, `${CREATOR_BASE_PATH}/${id}/members/${userId}`);
  const detail = await loadCreatorMemberDetail(db, challenge, userId);
  if (!detail) notFound();
  return <CreatorMemberDetailScreen challenge={challenge} detail={detail} />;
}
