import { CreatorMembers } from "@/components/challenge/creator/creator-members";
import { parseMemberFilter } from "@/lib/domain/creator-studio";
import { demoView } from "../demo-view";

export const dynamic = "force-dynamic";

/** 참여자 관리 미리보기 (시안 3). */
export default async function CreatorDemoMembers({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const query = await searchParams;
  const { challenge, snapshot } = demoView();
  return <CreatorMembers challenge={challenge} snapshot={snapshot} initialFilter={parseMemberFilter(query.filter)} />;
}
