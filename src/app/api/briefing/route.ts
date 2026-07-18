import { NextResponse } from "next/server";
import { buildBriefings, type BriefingUser } from "@/lib/domain/briefing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 아침 브리핑 디스패처 (스펙 §2·§3) — Vercel Cron이 매일 UTC 0시(KST 9시,
 * ±59분)에 호출. CRON_SECRET Bearer 검증. ?hour=N은 수동 검증·향후 다중
 * 슬롯용 시각 오버라이드.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "env_missing" }, { status: 500 });
  }
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hourParam = new URL(req.url).searchParams.get("hour");
  const invocationHour = hourParam === null ? undefined : Number(hourParam);

  const admin = getSupabaseAdminClient();
  const [profilesRes, sessionsRes, settingsRes, membersRes] =
    await Promise.all([
      admin.from("profiles").select("id, timezone"),
      admin
        .from("workout_sessions")
        .select("user_id, completed_at")
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("completed_at", "is", null),
      admin.from("notification_settings").select("user_id, morning_brief"),
      admin.from("group_members").select("group_id, user_id"),
    ]);
  const queryError = [profilesRes, sessionsRes, settingsRes, membersRes].find(
    (r) => r.error,
  )?.error;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const completedAtsByUser = new Map<string, Date[]>();
  for (const row of sessionsRes.data ?? []) {
    const list = completedAtsByUser.get(row.user_id) ?? [];
    list.push(new Date(row.completed_at as string));
    completedAtsByUser.set(row.user_id, list);
  }
  const settings = new Map(
    (settingsRes.data ?? []).map((s) => [s.user_id, s.morning_brief as boolean]),
  );
  const membersByGroup = new Map<string, string[]>();
  const groupsByUser = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    membersByGroup.set(m.group_id, [
      ...(membersByGroup.get(m.group_id) ?? []),
      m.user_id,
    ]);
    groupsByUser.set(m.user_id, [
      ...(groupsByUser.get(m.user_id) ?? []),
      m.group_id,
    ]);
  }

  const users: BriefingUser[] = (profilesRes.data ?? []).map((p) => ({
    userId: p.id,
    timezone: (p.timezone as string) || "Asia/Seoul",
    completedAts: completedAtsByUser.get(p.id) ?? [],
    morningBrief: settings.get(p.id) ?? true,
    crewMemberIds: (groupsByUser.get(p.id) ?? []).flatMap(
      (g) => membersByGroup.get(g) ?? [],
    ),
  }));

  const { briefings, skipped } = buildBriefings(
    users,
    completedAtsByUser,
    new Date(),
    invocationHour,
  );

  // 유저별 insert — dedupe_key 충돌 = 이미 발송 (스펙 §3·§8: 일괄 insert 금지)
  let sent = 0;
  let alreadySent = 0;
  const errors: string[] = [];
  for (const b of briefings) {
    const { data, error } = await admin
      .from("notifications")
      .upsert(
        {
          user_id: b.userId,
          type: "morning_briefing",
          title: b.title,
          body: b.body,
          dedupe_key: b.dedupeKey,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) errors.push(`${b.userId}: ${error.message}`);
    else if ((data ?? []).length > 0) sent += 1;
    else alreadySent += 1;
  }

  return NextResponse.json({ sent, alreadySent, skipped, errors });
}
