// 0028·0029 검증: 콕 발신자 게이트 + 레벨업 크루 알림
// 실행: node scripts/poke-levelup-check.mjs
// 사전조건: 0028·0029 적용.
import { readFileSync } from "node:fs";

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
  const response = await fetch(`${URL}${path}`, {
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
    json = await response.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: response.status, json };
}

async function anonUser(nick) {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  const user = { token: json.access_token, id: json.user.id };
  await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: `${nick}-${RUN}`,
    weekly_goal: 3,
  });
  return user;
}

async function deleteAuthUser(userId) {
  return fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** 웨이트 3세트 운동 1건을 완료한다 */
async function completeWorkout(user, groupId) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    group_id: groupId,
    timezone: "Asia/Seoul",
    visibility: "group",
  });
  const session = draft.json?.[0];
  const created = await api(user.token, "POST", "/rest/v1/workout_exercises", {
    session_id: session.id,
    exercise_name: "스쿼트",
    exercise_type: "weight",
    sort_order: 0,
  });
  const exercise = created.json?.[0];
  for (let i = 1; i <= 3; i++) {
    await api(user.token, "POST", "/rest/v1/workout_sets", {
      workout_exercise_id: exercise.id,
      set_number: i,
      weight_kg: 50,
      reps: 10,
      is_completed: true,
    });
  }
  await api(user.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: session.id,
  });
  return api(user.token, "POST", "/rest/v1/rpc/complete_workout_v2", {
    p_session_id: session.id,
  });
}

/** 원장을 건드리지 않고 진행 캐시만 세팅 — 레벨업 직전 상태를 만든다 */
async function seedProgress(userId, totalXp, level, stage) {
  await api(SERVICE_KEY, "POST", "/rest/v1/user_progress", {
    user_id: userId,
    total_xp: totalXp,
    current_level: level,
    current_stage: stage,
  });
}

let users = [];
let groupId = null;

try {
  const A = await anonUser("pkA"); // 콕 발신자
  const B = await anonUser("pkB"); // 콕 수신자 · 알림 관찰자
  const C = await anonUser("pkC"); // 레벨업 대상
  const D = await anonUser("pkD"); // 단계 진화 대상
  users = [A, B, C, D];

  const group = await api(A.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `콕테스트-${RUN}`,
  });
  const g = Array.isArray(group.json) ? group.json[0] : group.json;
  groupId = g.id;
  for (const u of [B, C, D]) {
    await api(u.token, "POST", "/rest/v1/rpc/join_group_with_code", {
      p_code: g.invite_code,
    });
  }

  // ── 0028: 콕 발신자 게이트 ────────────────────────────────
  const before = await api(A.token, "POST", "/rest/v1/rpc/poke_user", {
    p_target_id: B.id,
  });
  check(
    "오늘 운동 전에는 콕 거부(poke_requires_workout)",
    before.status >= 400 &&
      JSON.stringify(before.json).includes("poke_requires_workout"),
    `${before.status} ${JSON.stringify(before.json)}`,
  );

  await completeWorkout(A, groupId);

  const after = await api(A.token, "POST", "/rest/v1/rpc/poke_user", {
    p_target_id: B.id,
  });
  check(
    "오늘 운동 후에는 콕 성공",
    after.status < 400,
    `${after.status} ${JSON.stringify(after.json)}`,
  );

  const pokes = await api(
    B.token,
    "GET",
    `/rest/v1/notifications?select=type,actor_id&type=eq.poke&actor_id=eq.${A.id}`,
  );
  check(
    "수신자에게 콕 알림 1건",
    pokes.json?.length === 1,
    JSON.stringify(pokes.json),
  );

  const twice = await api(A.token, "POST", "/rest/v1/rpc/poke_user", {
    p_target_id: B.id,
  });
  check(
    "같은 사람 재찌르기는 여전히 차단(poke_cooldown)",
    twice.status >= 400 && JSON.stringify(twice.json).includes("poke_cooldown"),
    `${twice.status} ${JSON.stringify(twice.json)}`,
  );

  // ── 0029: 레벨업 크루 알림 ────────────────────────────────
  // Lv.2 컷은 200 XP. 190에서 운동 1건(≥110)이면 반드시 넘는다.
  await seedProgress(C.id, 190, 1, 1);
  const cDone = await completeWorkout(C, groupId);
  check(
    "레벨업 발생 확인 (Lv.1 → Lv.2)",
    cDone.json?.levelUp === true && cDone.json?.newLevel === 2,
    JSON.stringify(cDone.json),
  );

  const levelUps = await api(
    B.token,
    "GET",
    `/rest/v1/notifications?select=type,title,body,actor_id&type=eq.level_up&actor_id=eq.${C.id}`,
  );
  check(
    "크루에게 레벨업 알림 1건",
    levelUps.json?.length === 1,
    JSON.stringify(levelUps.json),
  );
  check(
    "레벨업 문구에 이전→현재 레벨이 담긴다",
    (levelUps.json?.[0]?.body ?? "").includes("Lv.1 → Lv.2"),
    JSON.stringify(levelUps.json?.[0]),
  );

  const selfNotified = await api(
    C.token,
    "GET",
    `/rest/v1/notifications?select=type&type=eq.level_up&actor_id=eq.${C.id}`,
  );
  check(
    "본인에게는 레벨업 알림을 보내지 않는다",
    selfNotified.json?.length === 0,
    JSON.stringify(selfNotified.json),
  );

  // ── 0029: 단계 진화는 문구가 다르다 ───────────────────────
  // Lv.6 컷 = 1000 XP(2단계 눈떴개). 990에서 운동 1건이면 넘는다.
  await seedProgress(D.id, 990, 5, 1);
  const dDone = await completeWorkout(D, groupId);
  check(
    "단계 진화 발생 확인 (1단계 → 2단계)",
    dDone.json?.stageUp === true && dDone.json?.newStage === 2,
    JSON.stringify(dDone.json),
  );

  const stageUps = await api(
    B.token,
    "GET",
    `/rest/v1/notifications?select=title,body&type=eq.level_up&actor_id=eq.${D.id}`,
  );
  check(
    "단계 진화 알림은 '진화' 문구를 쓴다",
    (stageUps.json?.[0]?.title ?? "").includes("진화") &&
      (stageUps.json?.[0]?.body ?? "").includes("단계로 진화"),
    JSON.stringify(stageUps.json?.[0]),
  );
} finally {
  if (groupId) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
