// 0028·0029 검증: 콕 발신자 게이트 + 레벨업 크루 알림
// 실행: node scripts/poke-levelup-check.mjs
// 사전조건: 0028·0029 적용.
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

const deleteAuthUser = (userId) => _guard.deleteIfCreatedThisRun(userId);

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

/**
 * 두 사람을 상호 크루로 만든다 (0038 RPC).
 *
 * 0039부터 "크루"는 같은 그룹이 아니라 서로 수락한 사이다. 이 스크립트는
 * create_group + join_group_with_code로만 엮어 왔는데, 그래서 poke_user·
 * 레벨업 팬아웃이 전부 not_crew로 막혀 있었다(2026-07-30 기준 7건 실패).
 * 그룹은 세션의 group_id 때문에 그대로 두고 연결만 추가한다.
 */
async function linkCrew(from, to) {
  const req = await api(from.token, "POST", "/rest/v1/rpc/send_crew_request", {
    p_target_id: to.id,
  });
  const requestId = req.json?.requestId;
  if (!requestId) {
    throw new Error(`크루 요청 실패: ${req.status} ${JSON.stringify(req.json)}`);
  }
  const acc = await api(to.token, "POST", "/rest/v1/rpc/accept_crew_request", {
    p_request_id: requestId,
  });
  if (acc.status >= 400) {
    throw new Error(`크루 수락 실패: ${acc.status} ${JSON.stringify(acc.json)}`);
  }
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

  // B가 관찰자다 — 콕은 A→B, 레벨업·진화 팬아웃은 C·D에서 B로 온다.
  // 그래서 B가 A·C·D 셋 다와 크루여야 한다.
  await linkCrew(A, B);
  await linkCrew(C, B);
  await linkCrew(D, B);
  // RPC가 200을 줬다는 것과 행이 생겼다는 것은 다르다. 팬아웃이 읽는 건
  // crew_links 행이므로 그것을 직접 센다 — B 기준 3행(A·C·D)이어야 한다.
  // 0038의 crew_links_mine_select가 본인이 낀 행만 돌려주므로 필터가 필요 없다.
  const myLinks = await api(B.token, "GET", "/rest/v1/crew_links?select=user_a,user_b");
  check(
    "픽스처: B가 A·C·D와 크루 연결 (crew_links 3행)",
    myLinks.status === 200 && myLinks.json?.length === 3,
    `${myLinks.status} ${JSON.stringify(myLinks.json)}`,
  );

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
