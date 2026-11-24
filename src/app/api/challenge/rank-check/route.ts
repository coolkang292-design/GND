import { NextResponse } from "next/server";
import {
  GOAL_TYPE_META,
  getActiveChallengeStanding,
} from "@/lib/challenge";
import {
  filterByRanksSetting,
  planRankChange,
  type RankRow,
} from "@/lib/domain/rank-change";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PrevRow = { user_id: string; rank: number; notified_at: string | null };

/**
 * 운동 완료 트리거(0122)가 호출하는 등수 변동 알림 엔드포인트.
 *
 * `/api/push/notify`와 같은 신뢰 모델이다 — 인증 헤더 대신 **DB 재조회가 진실**.
 * 위조 호출이 와도 (1) 실제로 완료된 세션만 대상이고 (2) 순위가 실제로 바뀐 경우에만
 * 알림이 만들어지며 (3) 스냅샷 선점(`claim_rank_snapshot`)이 원자적이라 중복이 없다.
 *
 * 순위는 챌린지 화면과 **같은 함수**(`getActiveChallengeStanding`)로 잰다.
 * 대상은 **진행 중 + 실시간 랭킹을 켠 방**뿐이다 — 꺼진 방은 순위가 진행 중 비공개다.
 */
export async function POST(req: Request) {
  let sessionId: unknown;
  try {
    ({ session_id: sessionId } = (await req.json()) as { session_id?: unknown });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("workout_sessions")
    .select("user_id, status, deleted_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session || session.status !== "completed" || session.deleted_at) {
    return NextResponse.json({ skipped: "not_completed" });
  }

  // 이 사람이 참가 중인 진행 중 + 실시간 랭킹 방
  const { data: memberships, error: memberError } = await admin
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", session.user_id as string)
    .eq("status", "joined");
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  const challengeIds = (memberships ?? []).map((m) => m.challenge_id as string);
  if (challengeIds.length === 0) return NextResponse.json({ rooms: 0, sent: 0 });

  const { data: rooms, error: roomError } = await admin
    .from("challenges")
    .select("id")
    .in("id", challengeIds)
    .eq("status", "active")
    .eq("live_ranking", true);
  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  let sent = 0;
  for (const room of rooms ?? []) {
    const challengeId = room.id as string;
    const standing = await getActiveChallengeStanding(challengeId, admin);
    if (!standing) continue;

    const joined = new Set(standing.joinedUserIds);
    const next: RankRow[] = standing.list
      .filter((r) => joined.has(r.userId))
      .map((r) => ({ userId: r.userId, rank: r.rank }));
    if (next.length === 0) continue;

    // 새 순위를 저장하고 직전 순위를 받는다 (원자적 — 동시 호출 중복 방지)
    const { data: prevData, error: claimError } = await admin.rpc(
      "claim_rank_snapshot",
      {
        p_challenge_id: challengeId,
        p_next: next.map((r) => ({ user_id: r.userId, rank: r.rank })),
      },
    );
    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    const prevRows = (prevData ?? []) as PrevRow[];

    // "○○님이 1위 됐어요"에 쓸 닉네임 — 같은 방 참가자만 조회한다
    const { data: profileRows, error: profileError } = await admin
      .from("profiles")
      .select("id, nickname")
      .in(
        "id",
        next.map((r) => r.userId),
      );
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    const nicknames: Record<string, string> = {};
    for (const p of profileRows ?? []) {
      if (typeof p.nickname === "string" && p.nickname.trim()) {
        nicknames[p.id as string] = p.nickname.trim();
      }
    }

    const plan = planRankChange({
      nicknames,
      // 분 단위 시각 — 같은 입력이면 같은 문구(재현 가능), 알림마다 변형이 돈다
      variantSeed: Math.floor(Date.now() / 60_000),
      challengeName: standing.name,
      prev: prevRows.map((p) => ({ userId: p.user_id, rank: p.rank })),
      next,
      lastNotifiedAt: Object.fromEntries(
        prevRows.map((p) => [p.user_id, p.notified_at]),
      ),
      now: new Date(),
      inputs: standing.inputs,
      describeGoal: (type) => GOAL_TYPE_META[type],
    });
    if (plan.notifications.length === 0) continue;

    // 설정의 `순위` 스위치를 끈 사람은 뺀다 (행 없음 = 켜짐)
    const { data: settingRows, error: settingError } = await admin
      .from("notification_settings")
      .select("user_id, ranks")
      .in(
        "user_id",
        plan.notifications.map((n) => n.userId),
      );
    if (settingError) {
      return NextResponse.json({ error: settingError.message }, { status: 500 });
    }
    const toSend = filterByRanksSetting(
      plan.notifications,
      (settingRows ?? []).map((s) => ({
        userId: s.user_id as string,
        ranks: s.ranks as boolean | null,
      })),
    );
    if (toSend.length === 0) continue;

    // 알림 insert → 0016 트리거가 푸시까지 보낸다
    const { error: insertError } = await admin.from("notifications").insert(
      toSend.map((n) => ({
        user_id: n.userId,
        actor_id: null,
        type: n.type,
        reference_id: challengeId,
        title: n.title,
        body: n.body,
        meta: n.meta,
      })),
    );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    sent += toSend.length;

    await admin
      .from("challenge_rank_snapshots")
      .update({ notified_at: new Date().toISOString() })
      .eq("challenge_id", challengeId)
      .in(
        "user_id",
        toSend.map((n) => n.userId),
      );
  }

  return NextResponse.json({ rooms: (rooms ?? []).length, sent });
}
