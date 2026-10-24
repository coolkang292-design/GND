import { CreatorMembers } from "@/components/challenge/creator/creator-members";
import { CREATOR_BASE_PATH, requireHostChallenge } from "@/lib/creator-access";
import { loadCreatorView } from "@/lib/creator-data";
import { parseMemberFilter } from "@/lib/domain/creator-studio";

export const dynamic = "force-dynamic";

/** 참여자 관리 (시안 3). 같은 인가·같은 스냅샷 — 홈과 숫자가 갈리지 않는다. */
export default async function CreatorMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { db, challenge } = await requireHostChallenge(id, `${CREATOR_BASE_PATH}/${id}/members`);
  const { snapshot } = await loadCreatorView(db, challenge);
  return (
    <CreatorMembers
      challenge={challenge}
      snapshot={snapshot}
      initialFilter={parseMemberFilter(query.filter)}
    />
  );
}
