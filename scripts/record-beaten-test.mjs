// 0018 검증: mark_record_beaten — 본인 완료 세션 1회 마킹 + 크루 알림, 위조 차단.
// 실행: node scripts/record-beaten-test.mjs
// 사전조건: 0016·0018이 적용되어 있어야 한다.
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
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
}

let userA = null;
let userB = null;
let groupId = null;

try {
  console.log("-- 0018 record beaten verification --");
  userA = await anonUser();
  userB = await anonUser();

  for (const [user, nick] of [
    [userA, "갱신A"],
    [userB, "갱신B"],
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
    p_name: "갱신테스트크루",
  });
  groupId = group.json?.id;
  if (!groupId) throw new Error(`크루 생성 실패: ${JSON.stringify(group.json)}`);
  const join = await api(userB.token, "POST", "/rest/v1/rpc/join_group_with_code", {
    p_code: group.json.invite_code,
  });
  if (join.status !== 200) throw new Error("크루 참여 실패");

  const draft = await api(userA.token, "POST", "/rest/v1/workout_sessions", {
    user_id: userA.id,
    group_id: groupId,
    timezone: "Asia/Seoul",
  });
  const sessionId = draft.json?.[0]?.id;
  if (!sessionId) throw new Error("세션 생성 실패");

  const early = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "벤치프레스를 2회 더 하셨어요",
  });
  check(
    "미완료 세션 마킹 거절 (invalid_status)",
    early.status >= 400 && JSON.stringify(early.json).includes("invalid_status"),
    JSON.stringify(early.json),
  );

  await api(userA.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: sessionId,
  });
  const done = await api(userA.token, "POST", "/rest/v1/rpc/complete_workout", {
    p_session_id: sessionId,
  });
  if (done.status !== 200) throw new Error(`완료 실패: ${JSON.stringify(done.json)}`);

  const forged = await api(userB.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "볼륨 +10kg",
  });
  check(
    "타인 세션 마킹 거절 (not_owner)",
    forged.status >= 400 && JSON.stringify(forged.json).includes("not_owner"),
    JSON.stringify(forged.json),
  );

  const badNote = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "",
  });
  check(
    "빈 문구 거절 (invalid_note)",
    badNote.status >= 400 && JSON.stringify(badNote.json).includes("invalid_note"),
    JSON.stringify(badNote.json),
  );

  const tooLong = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "가".repeat(81),
  });
  check(
    "80자 초과 문구 거절 (invalid_note)",
    tooLong.status >= 400 && JSON.stringify(tooLong.json).includes("invalid_note"),
    JSON.stringify(tooLong.json),
  );

  const mark = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "벤치프레스를 2회 더 하셨어요",
  });
  check("본인 완료 세션 마킹 성공", mark.status === 204 || mark.status === 200, JSON.stringify(mark.json));

  const row = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_sessions?id=eq.${sessionId}&select=record_note`,
  );
  check(
    "record_note 저장 확인",
    row.json?.[0]?.record_note === "벤치프레스를 2회 더 하셨어요",
    JSON.stringify(row.json),
  );

  const again = await api(userA.token, "POST", "/rest/v1/rpc/mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "스쿼트를 1세트 더 하셨어요",
  });
  check(
    "재마킹 거절 (already_marked)",
    again.status >= 400 && JSON.stringify(again.json).includes("already_marked"),
    JSON.stringify(again.json),
  );

  const notifs = await api(
    userB.token,
    "GET",
    `/rest/v1/notifications?type=eq.record_beaten&reference_id=eq.${sessionId}&select=title,body,user_id`,
  );
  check(
    "크루원(B)에게 칭찬 요청 알림 생성",
    notifs.status === 200 &&
      notifs.json?.length === 1 &&
      notifs.json[0].body.includes("님이 벤치프레스를 2회 더 하셨어요") &&
      notifs.json[0].body.includes("칭찬 한마디") &&
      notifs.json[0].title.includes("칭찬해주세요"),
    JSON.stringify(notifs.json),
  );

  const selfNotif = await api(
    userA.token,
    "GET",
    `/rest/v1/notifications?type=eq.record_beaten&reference_id=eq.${sessionId}&select=id`,
  );
  check(
    "본인에게는 알림 없음",
    selfNotif.status === 200 && selfNotif.json?.length === 0,
    JSON.stringify(selfNotif.json),
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
