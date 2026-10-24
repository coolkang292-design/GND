import { redirect } from "next/navigation";
import { CREATOR_BASE_PATH } from "@/lib/creator-access";

/** Moved under the challenge tab so the bottom tab bar stays (2026-10-24). */
export default async function LegacyCreatorChallenge({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`${CREATOR_BASE_PATH}/${encodeURIComponent(id)}`);
}
