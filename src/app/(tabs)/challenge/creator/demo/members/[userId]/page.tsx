import { notFound } from "next/navigation";
import { CreatorMemberDetailScreen } from "@/components/challenge/creator/creator-member-detail";
import { demoView } from "../../demo-view";

export const dynamic = "force-dynamic";

/** 참여자 상세 미리보기 (시안 2). 없는 회원 id면 진짜 화면처럼 404. */
export default async function CreatorDemoMember({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { challenge, memberDetail } = demoView();
  const detail = memberDetail(userId);
  if (!detail) notFound();
  return <CreatorMemberDetailScreen challenge={challenge} detail={detail} />;
}
