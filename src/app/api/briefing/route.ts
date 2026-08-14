import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  bugReminderDedupeKey,
  bugReminderText,
} from "@/lib/domain/bug-reminder";
import { buildBriefings, type BriefingUser } from "@/lib/domain/briefing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 알림 2층 (0052) — 미처리 버그 신고가 남아 있으면 관리자에게 하루 한 번.
 *
 * 브리핑과 같은 09:00 KST 슬롯에 얹는다 — vercel.json의 크론이 하나뿐이다.
 * `autostart_due_challenges`(0044)를 여기 얹은 것과 같은 자리·같은 규칙이다.
 *
 * **실패해도 브리핑을 죽이지 않는다.** 신고 알림이 안 나갔다고 전 사용자의 아침
 * 알림을 통째로 잃으면 손해가 훨씬 크다.
 */
async function remindPendingBugReports(
  admin: SupabaseClient,
  now: Date,
): Promise<Record<string, unknown>> {
  try {
    // **`new`만 세지 않는다.** `triaged`는 "원인은 적어 뒀지만 아직 안 고친 것"이라
    // 여전히 미처리다. new만 세면 원인을 적어 둔 순간 알림이 끊겨, 손대다 만
    // 신고가 영영 조용히 묻힌다 — 2층의 존재 이유가 정확히 그걸 막는 것이다.
    // (0052의 pending_bug_report_count RPC는 new만 센다. 여기서 직접 세는 이유가
    //  그것이고, 마이그레이션을 한 번 더 돌리지 않으려는 이유이기도 하다.)
    const { count, error: countError } = await admin
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "triaged"]);
    if (countError) return { error: countError.message };
    if (!count || count <= 0) return { pending: 0, sent: 0 };

    const { data: watchers, error: watchersError } = await admin
      .from("bug_report_watchers")
      .select("user_id");
    if (watchersError) return { error: watchersError.message };

    const { title, body } = bugReminderText(count);
    let sent = 0;
    for (const w of watchers ?? []) {
      const userId = w.user_id as string;
      const { data } = await admin
        .from("notifications")
        .upsert(
          {
            user_id: userId,
            type: "bug_reported",
            title,
            body,
            dedupe_key: bugReminderDedupeKey(userId, now),
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if ((data ?? []).length > 0) sent += 1;
    }
    return { pending: count, sent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

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
  // ⚠️ 크론이 30분마다 돌게 된 뒤(2026-08-13, 알림 시각 개인화)로는 **UTC 0시
  //    슬롯에서만** 부른다. 멱등이라 48번 돌려도 안전하지만 값이 없다 —
  //    도래분은 하루 한 번만 넘기면 충분하다(옛 동작과 같다).
  const now = new Date();
  const isDailySlot =
    invocationHour !== undefined ||
    (now.getUTCHours() === 0 && now.getUTCMinutes() < 30);
  const challengeTransitions: Record<string, unknown> = {};
  if (isDailySlot) {
    for (const fn of [
      // 0077: 예고를 **먼저** 부른다. 예고는 `start_date = 내일`만 보고
      // autostart는 `<= 오늘`만 보므로 서로 대상이 겹치지 않지만, 읽는 순서가
      // 시간 순서(내일 예고 → 오늘 시작 → 어제 종료)와 같아야 나중에 읽는
      // 사람이 헷갈리지 않는다.
      // ⚠️ `remind_`는 service_role에만 EXECUTE가 있다(0077). 이 라우트는
      //    `getSupabaseAdminClient()`라 괜찮지만, 화면에서 부르면 막힌다.
      "remind_upcoming_challenges",
      "autostart_due_challenges",
      "autofinalize_due_challenges",
    ]) {
      const { data, error } = await admin.rpc(fn);
      challengeTransitions[fn] = error ? { error: error.message } : data;
    }
  }
  /**
   * 완료 세션 전량 — **페이지네이션 필수**.
   *
   * ⚠️ 옛 코드는 한 번에 긁고 주석으로만 경고했다: *"PostgREST 기본 row cap(1000)에
   * 걸리면 조용히 잘려 스트릭이 과소계산된다."* 하루 1회일 땐 넘어갔지만 크론이
   * 30분마다 돌게 되면서(2026-08-13) 같은 조회가 48배로 늘었고, 무엇보다
   * **틀린 스트릭으로 알림을 보내는 것**은 조용한 사고다. `.range()`로 끝까지 읽는다.
   *
   * ⚠️ `started_at`을 같이 읽는다 — 알림 시각 추정의 재료다(`completed_at`으로 재면
   * 운동이 끝난 시각이라 알림이 늘 늦는다).
   */
  const PAGE = 1000;
  type SessionRow = {
    user_id: string;
    completed_at: string;
    started_at: string | null;
  };
  const sessionRows: SessionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("workout_sessions")
      .select("user_id, completed_at, started_at")
      .eq("status", "completed")
      .is("deleted_at", null)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    sessionRows.push(...((data ?? []) as SessionRow[]));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const [profilesRes, settingsRes] = await Promise.all([
    admin.from("profiles").select("id, timezone"),
    admin.from("notification_settings").select("user_id, morning_brief"),
  ]);
  const queryError = [profilesRes, settingsRes].find((r) => r.error)?.error;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const completedAtsByUser = new Map<string, Date[]>();
  const startedAtsByUser = new Map<string, Date[]>();
  for (const row of sessionRows) {
    const list = completedAtsByUser.get(row.user_id) ?? [];
    list.push(new Date(row.completed_at));
    completedAtsByUser.set(row.user_id, list);
    // started_at은 옛 행에 없을 수 있다. 없으면 추정에서 빠질 뿐 스트릭엔 영향이 없다.
    if (row.started_at) {
      const starts = startedAtsByUser.get(row.user_id) ?? [];
      starts.push(new Date(row.started_at));
      startedAtsByUser.set(row.user_id, starts);
    }
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
    startedAts: startedAtsByUser.get(p.id) ?? [],
    morningBrief: settings.get(p.id) ?? true,
  }));

  const { briefings, skipped } = buildBriefings(
    users,
    completedAtsByUser,
    now,
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

  const bugReports = await remindPendingBugReports(admin, new Date());

  return NextResponse.json({
    sent,
    alreadySent,
    skipped,
    errors,
    bugReports,
    challengeTransitions,
  });
}
