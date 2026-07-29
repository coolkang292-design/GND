// 0026 검증: 크루원 프로필 RPC — 권한·데이터·캐시 정합성.
// 실행: node scripts/crew-profile-check.mjs
// 사전조건: 0020·0022·0026이 적용되어 있어야 한다.
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

let users = [];
let groupAB = null;
let groupC = null;

try {
  // ── 픽스처: A·B는 같은 크루, C는 다른 크루 ──
  const userA = await anonUser("cpA");
  const userB = await anonUser("cpB");
  const userC = await anonUser("cpC");
  users = [userA, userB, userC];

  const gAB = await api(userA.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `프로필테스트-${RUN}`,
  });
  const ab = Array.isArray(gAB.json) ? gAB.json[0] : gAB.json;
  groupAB = ab?.id;
  await api(userB.token, "POST", "/rest/v1/rpc/join_group_with_code", {
    p_code: ab?.invite_code,
  });

  // 0039부터 "크루"는 같은 그룹이 아니라 서로 수락한 사이다. get_crew_member_profile의
  // 판정이 is_crew_with로 바뀌었으므로 A·B를 실제로 연결해야 아래 단언이 성립한다.
  // C는 일부러 연결하지 않는다 — "크루가 아니면 not_crew"를 그대로 검증하기 위해서다.
  const linkReq = await api(userA.token, "POST", "/rest/v1/rpc/send_crew_request", {
    p_target_id: userB.id,
  });
  await api(userB.token, "POST", "/rest/v1/rpc/accept_crew_request", {
    p_request_id: linkReq.json?.requestId,
  });

  const gC = await api(userC.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `남의크루-${RUN}`,
  });
  groupC = (Array.isArray(gC.json) ? gC.json[0] : gC.json)?.id;

  // ── 1) 신규 유저(진행 행 없음) → 0 XP·Lv.1 ──
  const fresh = await api(userA.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "진행 행 없으면 0 XP·Lv.1·빈 배지",
    fresh.status === 200 &&
      fresh.json?.totalXp === 0 &&
      fresh.json?.currentLevel === 1 &&
      Array.isArray(fresh.json?.badges) &&
      fresh.json.badges.length === 0,
    JSON.stringify(fresh.json),
  );

  // ── 2) B에게 진행·배지를 심고 조회 ──
  await api(SERVICE_KEY, "POST", "/rest/v1/user_progress", {
    user_id: userB.id,
    total_xp: 7220,
    current_level: 17,
    current_stage: 4,
  });
  await api(SERVICE_KEY, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_1",
  });
  await api(SERVICE_KEY, "POST", "/rest/v1/user_badges", {
    user_id: userB.id,
    badge_key: "record_beaten_5",
  });

  const seen = await api(userA.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "크루원의 누적 XP를 읽는다",
    seen.status === 200 && seen.json?.totalXp === 7220,
    JSON.stringify(seen.json),
  );
  check(
    "크루원의 배지 2개를 획득순으로 읽는다",
    seen.json?.badges?.length === 2 &&
      seen.json.badges[0].badgeKey === "record_beaten_1" &&
      seen.json.badges[1].badgeKey === "record_beaten_5",
    JSON.stringify(seen.json?.badges),
  );

  // ── 3) 캐시 정합성: RPC의 currentLevel이 level_definitions 컷과 일치 ──
  const cut = await api(
    userA.token,
    "GET",
    "/rest/v1/level_definitions?select=level&required_total_xp=lte.7220&order=required_total_xp.desc&limit=1",
  );
  check(
    "currentLevel이 level_definitions 컷과 일치",
    seen.json?.currentLevel === cut.json?.[0]?.level,
    `rpc=${seen.json?.currentLevel} cut=${JSON.stringify(cut.json)}`,
  );

  // ── 4) 권한: 다른 크루는 거부 ──
  const outsider = await api(userC.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "크루가 아니면 not_crew",
    outsider.status >= 400 && JSON.stringify(outsider.json).includes("not_crew"),
    `${outsider.status} ${JSON.stringify(outsider.json)}`,
  );

  // ── 5) 본인 조회는 허용 ──
  const self = await api(userB.token, "POST", "/rest/v1/rpc/get_crew_member_profile", {
    p_target_id: userB.id,
  });
  check(
    "본인 조회 허용",
    self.status === 200 && self.json?.totalXp === 7220,
    JSON.stringify(self.json),
  );

  // ── 6) RPC 밖의 직접 접근은 여전히 막힌다 ──
  const direct = await api(
    userA.token,
    "GET",
    `/rest/v1/user_progress?user_id=eq.${userB.id}&select=total_xp`,
  );
  check(
    "타인 user_progress 직접 select 0건",
    direct.status === 200 && direct.json?.length === 0,
    JSON.stringify(direct.json),
  );

  const directBadges = await api(
    userA.token,
    "GET",
    `/rest/v1/user_badges?user_id=eq.${userB.id}&select=badge_key`,
  );
  check(
    "타인 user_badges 직접 select 0건",
    directBadges.status === 200 && directBadges.json?.length === 0,
    JSON.stringify(directBadges.json),
  );
} finally {
  if (groupAB) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupAB}`);
  if (groupC) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupC}`);
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
