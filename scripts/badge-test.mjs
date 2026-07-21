// 0020 검증: 배지 지급 — 임계값 도달·중복 방지·위조 차단·본인 알림.
// 실행: node scripts/badge-test.mjs
// 사전조건: 0016·0018·0020이 적용되어 있어야 한다.
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

async function anonUser() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  return { id: json.user.id, token: json.access_token };
}

async function deleteAuthUser(userId) {
  return fetch(`${URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** 완료 상태 세션 1개를 만들고 id를 돌려준다 */
async function completedSession(user, groupId) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    group_id: groupId,
    timezone: "Asia/Seoul",
  });
  const sessionId = draft.json?.[0]?.id;
  if (!sessionId) throw new Error(`세션 생성 실패: ${JSON.stringify(draft.json)}`);
  await api(user.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: sessionId,
  });
  const done = await api(user.token, "POST", "/rest/v1/rpc/complete_workout", {
    p_session_id: sessionId,
  });
  if (done.status !== 200) throw new Error(`완료 실패: ${JSON.stringify(done.json)}`);
  return sessionId;
}

let userA = null;
let userB = null;
let groupId = null;

try {
  console.log("-- 0020 badge verification --");
  userA = await anonUser();
  userB = await anonUser();

  for (const [user, nick] of [
    [userA, `배지A${RUN}`],
    [userB, `배지B${RUN}`],
  ]) {
    const profile = await api(user.token, "POST", "/rest/v1/profiles", {
      id: user.id,
      nickname: nick,
      avatar_url: "🧔",
      weekly_goal: 3,
    });
    if (profile.status !== 201) {
      throw new Error(`프로필 생성 실패: ${JSON.stringify(profile.json)}`);
    }
  }

  const group = await api(userA.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `배지크루${RUN}`,
  });
  groupId = group.json?.id;
  if (!groupId) throw new Error(`크루 생성 실패: ${JSON.stringify(group.json)}`);
  const join = await api(userB.token, "POST", "/rest/v1/rpc/join_group_with_code", {
    p_code: group.json.invite_code,
  });
  if (join.status !== 200) throw new Error("크루 참여 실패");

  // ── 1회차 갱신 → record_beaten_1 지급 ──
  const first = await completedSession(userA, groupId);
  const mark1 = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: first,
    p_note: "벤치프레스를 1회 더 하셨어요",
  });
  check(
    "1회차 마킹 성공",
    mark1.status === 204 || mark1.status === 200,
    JSON.stringify(mark1.json),
  );

  const afterFirst = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "첫 갱신에 record_beaten_1 지급",
    afterFirst.status === 200 &&
      afterFirst.json?.length === 1 &&
      afterFirst.json[0].badge_key === "record_beaten_1",
    JSON.stringify(afterFirst.json),
  );

  const badgeNotif = await api(
    userA.token,
    "GET",
    "/rest/v1/notifications?type=eq.badge_earned&select=title,body",
  );
  check(
    "본인에게 badge_earned 알림 1건",
    badgeNotif.status === 200 && badgeNotif.json?.length === 1,
    JSON.stringify(badgeNotif.json),
  );

  const praise = await api(
    userB.token,
    "GET",
    `/rest/v1/notifications?type=eq.record_beaten&reference_id=eq.${first}&select=title,body`,
  );
  check(
    "크루원에게 칭찬 요청 알림",
    praise.status === 200 &&
      praise.json?.length === 1 &&
      praise.json[0].title.includes("칭찬해주세요") &&
      praise.json[0].body.includes("님이 벤치프레스를 1회 더 하셨어요"),
    JSON.stringify(praise.json),
  );

  // ── 2~4회차: 새 배지 없음 (중복 지급·중복 알림 방지) ──
  for (let i = 2; i <= 4; i++) {
    const sessionId = await completedSession(userA, groupId);
    await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
      p_session_id: sessionId,
      p_note: `스쿼트를 ${i}회 더 하셨어요`,
    });
  }

  const afterFour = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "4회차까지는 배지가 1개 그대로",
    afterFour.json?.length === 1,
    JSON.stringify(afterFour.json),
  );

  const notifAfterFour = await api(
    userA.token,
    "GET",
    "/rest/v1/notifications?type=eq.badge_earned&select=id",
  );
  check(
    "이미 가진 배지는 알림을 다시 보내지 않음",
    notifAfterFour.json?.length === 1,
    JSON.stringify(notifAfterFour.json),
  );

  // ── 5회차 → record_beaten_5 추가 지급 ──
  const fifth = await completedSession(userA, groupId);
  await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: fifth,
    p_note: "러닝을 5분 더 뛰었어요",
  });

  const afterFive = await api(
    userA.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key&order=badge_key",
  );
  check(
    "5회차에 record_beaten_5 추가 지급",
    afterFive.json?.length === 2 &&
      afterFive.json.some((b) => b.badge_key === "record_beaten_5"),
    JSON.stringify(afterFive.json),
  );

  // ── 위조·격리 ──
  const forged = await api(userB.token, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_10",
  });
  check(
    "직접 insert 차단",
    forged.status >= 400,
    `${forged.status} ${JSON.stringify(forged.json)}`,
  );

  const otherBadges = await api(
    userB.token,
    "GET",
    "/rest/v1/user_badges?select=badge_key",
  );
  check(
    "타인 배지는 보이지 않음",
    otherBadges.status === 200 && otherBadges.json?.length === 0,
    JSON.stringify(otherBadges.json),
  );
} finally {
  if (groupId) {
    await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  }
  if (userA) await deleteAuthUser(userA.id);
  if (userB) await deleteAuthUser(userB.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
