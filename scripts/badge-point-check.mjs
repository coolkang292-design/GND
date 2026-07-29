// 0031·0032 검증: 배지 판정 + 포인트 지급
// 실행: node scripts/badge-point-check.mjs
// 사전조건: 0031·0032 적용.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// 삭제 가드 — 실행 시작 시점에 있던 계정은 절대 지우지 않는다.
const _guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // 본문 없음
  }
  return { status: res.status, json };
}

async function anonUser(nick) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  const user = { token: json.access_token, id: json.user.id };
  await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: `${nick}-${RUN}`,
    weekly_goal: 3,
  });
  return user;
}

const deleteAuthUser = (id) => _guard.deleteIfCreatedThisRun(id);

/** 지정한 종목·세트로 세션을 만들고 완료까지 */
async function runWorkout(user, exercises) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    timezone: "Asia/Seoul",
    visibility: "private",
  });
  const session = draft.json?.[0];
  if (!session) throw new Error("세션 생성 실패: " + JSON.stringify(draft.json));

  for (const [i, ex] of exercises.entries()) {
    const created = await api(user.token, "POST", "/rest/v1/workout_exercises", {
      session_id: session.id,
      exercise_name: ex.name,
      exercise_type: ex.type,
      sort_order: i,
    });
    const exercise = created.json?.[0];
    for (const [j, set] of ex.sets.entries()) {
      await api(user.token, "POST", "/rest/v1/workout_sets", {
        workout_exercise_id: exercise.id,
        set_number: j + 1,
        weight_kg: set.weight_kg ?? null,
        reps: set.reps ?? null,
        duration_seconds: set.duration_seconds ?? null,
        distance_meters: set.distance_meters ?? null,
        is_completed: true,
      });
    }
  }
  await api(user.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: session.id,
  });
  const done = await api(user.token, "POST", "/rest/v1/rpc/complete_workout_v2", {
    p_session_id: session.id,
  });
  return { session, done };
}

/** 100kg × 10회 × 3세트 = 3,000kg — volume_1t 통과, 5t 미달 */
const W3 = [
  { weight_kg: 100, reps: 10 },
  { weight_kg: 100, reps: 10 },
  { weight_kg: 100, reps: 10 },
];

const kstToday = () =>
  new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

let users = [];

try {
  // ── 1) 첫 운동 → 배지·포인트 ──
  const A = await anonUser("bpA");
  users.push(A);
  const r1 = await runWorkout(A, [{ name: "스쿼트", type: "weight", sets: W3 }]);

  check(
    "첫 운동에 포인트 100 지급 (불꽃 1일 → 배수 1.0)",
    r1.done.json?.pointsAwarded === 100 && Number(r1.done.json?.pointMultiplier) === 1,
    JSON.stringify({ p: r1.done.json?.pointsAwarded, m: r1.done.json?.pointMultiplier }),
  );

  const keys = (r1.done.json?.newBadges ?? []).map((b) => b.badgeKey).sort();
  check(
    "첫 운동 배지 = workout_1 · volume_1t",
    JSON.stringify(keys) === JSON.stringify(["volume_1t", "workout_1"]),
    JSON.stringify(keys),
  );

  const wallet = await api(A.token, "GET", "/rest/v1/user_wallet?select=balance,lifetime_earned");
  check(
    "지갑 = 운동 100 + 배지 300×2 = 700 P",
    wallet.json?.[0]?.balance === 700,
    JSON.stringify(wallet.json),
  );

  // ── 2) 같은 날 2번째 운동 → 포인트 0, 그러나 배지는 누적으로 판정된다 ──
  // 누적 볼륨이 3,000 → 6,000kg이 되므로 여기서 volume_5t가 열린다.
  const r2 = await runWorkout(A, [{ name: "벤치", type: "weight", sets: W3 }]);
  check(
    "같은 날 2번째 운동은 포인트 0 (XP와 같은 제한)",
    r2.done.json?.pointsAwarded === 0,
    JSON.stringify(r2.done.json?.pointsAwarded),
  );
  check(
    "포인트를 못 받아도 배지 판정은 돈다 — 누적 6t → volume_5t",
    (r2.done.json?.newBadges ?? []).some((b) => b.badgeKey === "volume_5t"),
    JSON.stringify((r2.done.json?.newBadges ?? []).map((b) => b.badgeKey)),
  );

  // ── 3) 멱등 — 임계값을 더 넘길 게 없으면 아무것도 안 준다 ──
  const before = await api(A.token, "GET", "/rest/v1/point_transactions?select=id");
  const r3 = await runWorkout(A, [{ name: "데드", type: "weight", sets: W3 }]);
  const after = await api(A.token, "GET", "/rest/v1/point_transactions?select=id");
  check(
    "3번째 운동은 새 배지 0개 (누적 9t으로 20t 미달)",
    (r3.done.json?.newBadges ?? []).length === 0,
    JSON.stringify((r3.done.json?.newBadges ?? []).map((b) => b.badgeKey)),
  );
  check(
    "포인트 원장이 늘지 않는다 — 중복 지급 없음",
    after.json.length === before.json.length,
    `tx ${before.json.length}→${after.json.length}`,
  );

  // ── 4) 불꽃 5일 → 반복 배지 + 배수 1.5 ──
  const B = await anonUser("bpB");
  users.push(B);
  for (let i = 4; i >= 1; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString();
    await api(SERVICE_KEY, "POST", "/rest/v1/workout_sessions", {
      user_id: B.id, timezone: "Asia/Seoul", visibility: "private",
      status: "completed", started_at: day, completed_at: day, duration_minutes: 30,
    });
  }
  const rB = await runWorkout(B, [{ name: "스쿼트", type: "weight", sets: W3 }]);
  const bKeys = (rB.done.json?.newBadges ?? []).map((b) => b.badgeKey);
  check(
    "불꽃 5일 → streak_5 획득",
    bKeys.includes("streak_5") && rB.done.json?.streakDays === 5,
    `streak=${rB.done.json?.streakDays} keys=${JSON.stringify(bKeys)}`,
  );
  check(
    "불꽃 5일 → 배수 1.5 적용 (100 × 1.5 = 150)",
    rB.done.json?.pointsAwarded === 150,
    JSON.stringify(rB.done.json?.pointsAwarded),
  );

  // ── 5) 반복 배지의 period_key는 달성한 날짜다 ──
  const rows = await api(B.token, "GET",
    "/rest/v1/user_badges?select=badge_key,period_key&badge_key=eq.streak_5");
  check(
    "streak_5의 period_key = 오늘 날짜 (사슬이 끊겨 다시 채우면 다른 행이 된다)",
    rows.json?.[0]?.period_key === kstToday(),
    JSON.stringify(rows.json),
  );

  // ── 6) 위조 차단 ──
  const forgeBadge = await api(A.token, "POST", "/rest/v1/user_badges", {
    user_id: A.id, badge_key: "volume_250t", period_key: "lifetime",
  });
  check("배지 직접 insert 차단", forgeBadge.status >= 400,
    `${forgeBadge.status} ${JSON.stringify(forgeBadge.json)}`);

  const forgePoint = await api(A.token, "POST", "/rest/v1/point_transactions", {
    user_id: A.id, amount: 99999, transaction_type: "earn",
    reason: "admin_adjustment", source_type: "hack", source_id: "1", balance_after: 0,
  });
  check("포인트 직접 insert 차단", forgePoint.status >= 400,
    `${forgePoint.status} ${JSON.stringify(forgePoint.json)}`);

  const otherWallet = await api(B.token, "GET",
    `/rest/v1/user_wallet?select=balance&user_id=eq.${A.id}`);
  check("타인 지갑 조회 0건", otherWallet.json?.length === 0,
    JSON.stringify(otherWallet.json));

  // ── 7) 카탈로그는 전원 읽기 ──
  const cat = await api(A.token, "GET", "/rest/v1/badge_definitions?select=badge_key");
  check("배지 카탈로그 30종 조회 가능", cat.json?.length === 30, `${cat.json?.length}종`);
} finally {
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
