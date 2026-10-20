/** Immutable cosmetic stamp awards and owner-only reads. */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isStampVariant, type StampVariant } from "@/lib/domain/workout-stamps";
export type StampAward = { dateKey: string; variant: StampVariant; newlyAwarded: boolean };
export async function claimWorkoutStamp(sessionId: string): Promise<StampAward | null> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.rpc("claim_workout_stamp", { p_session_id: sessionId });
  if (error) throw error;
  const item = (data as Array<{stamp_date:string;stamp_variant:string;newly_awarded:boolean}> | null)?.[0];
  if (!item || !isStampVariant(item.stamp_variant)) return null;
  return { dateKey: item.stamp_date, variant: item.stamp_variant, newlyAwarded: item.newly_awarded };
}
export async function getMyStampColors(
  userId: string, startDate?: string, endExclusive?: string,
): Promise<Record<string, StampVariant>> {
  const client = getSupabaseBrowserClient();
  let query = client.from("workout_stamp_colors").select("workout_date, variant").eq("user_id", userId);
  if (startDate) query = query.gte("workout_date", startDate);
  if (endExclusive) query = query.lt("workout_date", endExclusive);
  const { data, error } = await query;
  if (error) throw error;
  const colors: Record<string, StampVariant> = {};
  for (const item of data ?? []) {
    if (isStampVariant(item.variant)) colors[item.workout_date as string] = item.variant;
  }
  return colors;
}
