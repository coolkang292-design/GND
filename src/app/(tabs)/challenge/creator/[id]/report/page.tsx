import { CreatorReport } from "@/components/challenge/creator/creator-report";
import { CREATOR_BASE_PATH, requireHostChallenge } from "@/lib/creator-access";
import { loadCreatorView } from "@/lib/creator-data";

export const dynamic = "force-dynamic";

/**
 * 성과 리포트 축소판 (시안 1, 사용자 결정 2026-10-24 §9-②).
 * 기존 데이터로 계산되는 것만 — 일별 인증률 · 참여 · 첫 인증. 링크 클릭·유입·전환은 P1 계측 뒤.
 */
export default async function CreatorReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, challenge } = await requireHostChallenge(id, `${CREATOR_BASE_PATH}/${id}/report`);
  const { snapshot, daily } = await loadCreatorView(db, challenge, { daily: true });
  return <CreatorReport challenge={challenge} snapshot={snapshot} daily={daily} />;
}
