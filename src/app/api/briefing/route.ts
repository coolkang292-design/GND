import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildBriefings, type BriefingUser } from "@/lib/domain/briefing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 해시 후 비교해 길이 차이까지 숨기는 타이밍 안전 문자열 비교.
function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

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
    !secretsMatch(
      req.headers.get("authorization") ?? "",
      `Bearer ${process.env.CRON_SECRET}`,
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hourParam = new URL(req.url).searchParams.get("hour");
  let invocationHour: number | undefined;
  if (hourParam !== null) {
    const n = Number(hourParam);
    if (!Number.isInteger(n) || n < 0 || n > 23) {
      return NextResponse.json({ error: "invalid_hour" }, { status: 400 });
    }
    invocationHour = n;
  }

  const admin = getSupabaseAdminClient();

  // 0044: 챌린지 자동 시작·종료. 브리핑과 같은 09:00 KST 슬롯에 얹는다 —
  // vercel.json의 크론이 하나뿐이고, 하루 한 번 도래분을 넘기면 충분하다.
  //
  // 두 RPC는 멱등이다(이미 active면 건너뛴다). 실패해도 브리핑은 계속 보낸다 —
  // 챌린지 전환이 안 됐다고 아침 알림을 통째로 죽이면 손해가 더 크다.
  // 둘 다 auth.uid()를 쓰지 않으므로 service_role로 호출된다(0042 확인).
  const challengeTransitions: Record<string, unknown> = {};
  for (const fn of ["autostart_due_challenges", "autofinalize_due_challenges"]) {
    const { data, error } = await admin.rpc(fn);
    challengeTransitions[fn] = error ? { error: error.message } : data;
  }
  const [profilesRes, sessionsRes, settingsRes] =
    await Promise.all([
      admin.from("profiles").select("id, timezone"),
      // 전체 완료 세션 조회 — PostgREST 기본 row cap(1000)에 걸리면 조용히 잘려
      // 스트릭이 과소계산된다. 크루 3~5명 규모에선 무관, 확장 시 기간 필터/페이지네이션 필요.
      admin
        .from("workout_sessions")
        .select("user_id, completed_at")
        .eq("status", "completed")
        .is("deleted_at", null)
        .not("completed_at", "is", null),
      admin.from("notification_settings").select("user_id, morning_brief"),
    ]);
  const queryError = [profilesRes, sessionsRes, settingsRes].find(
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
  // 크루 조회는 없앴다(2026-07-28). 브리핑은 본문을 안 보내므로 크루 집계가 필요
  // 없고, 0039 이후 group_members는 크루의 원천도 아니다.
  const users: BriefingUser[] = (profilesRes.data ?? []).map((p) => ({
    userId: p.id,
    timezone: (p.timezone as string) || "Asia/Seoul",
    completedAts: completedAtsByUser.get(p.id) ?? [],
    morningBrief: settings.get(p.id) ?? true,
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

  return NextResponse.json({
    sent,
    alreadySent,
    skipped,
    errors,
    challengeTransitions,
  });
}
