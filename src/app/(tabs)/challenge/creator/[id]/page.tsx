import { CreatorHome } from "@/components/challenge/creator/creator-home";
import { CREATOR_BASE_PATH, requireHostChallenge } from "@/lib/creator-access";
import { loadCreatorView } from "@/lib/creator-data";

export const dynamic = "force-dynamic";

/**
 * 운영 홈 (시안 4). Server-side authorization is mandatory (`requireHostChallenge`).
 * No service_role and no client-side query of private management data.
 */
export default async function CreatorChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, user, challenge } = await requireHostChallenge(id, `${CREATOR_BASE_PATH}/${id}`);
  const { snapshot, recent } = await loadCreatorView(db, challenge, { recentLimit: 5 });
  return <CreatorHome challenge={challenge} snapshot={snapshot} recent={recent} viewerId={user.id} />;
}
