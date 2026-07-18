import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** 행 없음 = 전부 on (0011 관례) */
export type NotificationSettings = {
  morning_brief: boolean;
  cheers: boolean;
  pokes: boolean;
  ranks: boolean;
  record_views: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  morning_brief: true,
  cheers: true,
  pokes: true,
  ranks: true,
  record_views: true,
};

export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("morning_brief, cheers, pokes, ranks, record_views")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_NOTIFICATION_SETTINGS;
}

/** 부분 갱신 — 행 없으면 생성(나머지 컬럼은 DB default true) */
export async function updateNotificationSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}
