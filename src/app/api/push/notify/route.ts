import { NextResponse } from "next/server";
import webpush from "web-push";
import { pushPayloadFor, shouldDispatchPush } from "@/lib/domain/push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 알림 INSERT 트리거(0016)가 호출하는 푸시 발송 엔드포인트.
 * 인증 헤더 대신 DB 재조회가 진실 — 실재하는 미발송 최신 알림만 발송하므로
 * 위조 호출은 아무것도 보낼 수 없고, pushed_at 원자 선점으로 재전송도 무해하다.
 */
export async function POST(req: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "env_missing" }, { status: 500 });
  }

  let id: unknown;
  try {
    ({ id } = (await req.json()) as { id?: unknown });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: notification, error: readError } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, created_at, pushed_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!notification) {
    return NextResponse.json({ skipped: "not_found" });
  }

  if (
    !shouldDispatchPush({
      createdAt: new Date(notification.created_at as string),
      pushedAt: notification.pushed_at
        ? new Date(notification.pushed_at as string)
        : null,
      now: new Date(),
    })
  ) {
    return NextResponse.json({ skipped: "stale_or_pushed" });
  }

  // 원자 선점 — 동시 호출 중 한쪽만 발송한다.
  const { data: claimed, error: claimError } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .select("id");
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ skipped: "already_pushed" });
  }

  const { data: subscriptions, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", notification.user_id);
  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }
  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, removed: 0 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify(
    pushPayloadFor({
      type: notification.type as string,
      title: notification.title as string | null,
      body: notification.body as string | null,
    }),
  );

  let sent = 0;
  const expiredIds: string[] = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          payload,
        );
        sent += 1;
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id as string);
        }
        // 그 외 실패는 집계 없이 무시 — 푸시는 최선 노력(best effort)
      }
    }),
  );

  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return NextResponse.json({ sent, removed: expiredIds.length });
}
