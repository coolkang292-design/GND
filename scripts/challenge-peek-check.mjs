// 0040 검증: 챌린지 성과 열람 지정 — 선택 고정·본인/비참가자 차단·직접 쓰기 차단.
// 실행: node scripts/challenge-peek-check.mjs
// 사전조건: 0040이 적용되어 있어야 한다.
//
// 챌린지 픽스처는 service_role로 직접 심는다. start_challenge RPC는 0025의
// 전원 동의 게이트를 통과해야 해서, 이 스크립트가 검증하려는 것과 무관한
// 셋업이 길어진다. 여기서 볼 것은 pick_challenge_peek의 판정뿐이다.
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
const NOBODY = "00000000-0000-0000-0000-000000000000";
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
    // 본문 없는 응답
  }
  return { status: res.status, json };
}

const rpc = (token, name, args) =>
  api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});

async function anonUser(tag) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  const user = { id: json.user.id, token: json.access_token, nickname: `핍${RUN}${tag}` };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id, nickname: user.nickname, avatar_url: "🎯", weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  return user;
}

const deleteAuthUser = (id) => _guard.deleteIfCreatedThisRun(id);

const hasCode = (r, code) =>
  r.status >= 400 && JSON.stringify(r.json ?? {}).includes(code);

let users = [];
let groupId = null;

try {
  const a = await anonUser("a"); // 보는 사람
  const b = await anonUser("b"); // 고를 대상
  const c = await anonUser("c"); // 참가자이지만 안 고를 사람
  const d = await anonUser("d"); // 그룹엔 있으나 목표 없음 = 비참가자
  users = [a, b, c, d];

  // ── 픽스처: 그룹 + active 챌린지 + 목표 3인 ──
  const g = await rpc(a.token, "create_group", { p_name: `핍테스트-${RUN}` });
  groupId = (Array.isArray(g.json) ? g.json[0] : g.json)?.id;
  const code = (Array.isArray(g.json) ? g.json[0] : g.json)?.invite_code;
  for (const u of [b, c, d]) {
    await rpc(u.token, "join_group_with_code", { p_code: code });
  }

  const today = new Date().toISOString().slice(0, 10);
  const ch = await api(SERVICE_KEY, "POST", "/rest/v1/challenges", {
    group_id: groupId,
    name: `핍챌린지-${RUN}`,
    start_date: today,
    end_date: today,
    status: "active",
    created_by: a.id,
  });
  const challengeId = ch.json?.[0]?.id;
  check("픽스처: active 챌린지 생성", Boolean(challengeId), JSON.stringify(ch.json));

  for (const u of [a, b, c]) {
    await api(SERVICE_KEY, "POST", "/rest/v1/user_goals", {
      user_id: u.id, challenge_id: challengeId, group_id: groupId,
      goal_type: "volume", target_value: 100, unit: "kg", planned_days: 5,
    });
  }
  // d는 일부러 목표를 만들지 않는다 — 비참가자 차단을 검증하기 위해서다.

  // ── 1. 지정 ──
  let r = await rpc(a.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: b.id,
  });
  check(
    "[1] 지정: 성공하고 고른 사람을 돌려준다",
    r.status === 200 && r.json?.targetId === b.id && r.json?.locked === false,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 2. 고정 — 다른 사람으로 다시 고를 수 없다 ──
  r = await rpc(a.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: c.id,
  });
  check(
    "[2] 고정: 다른 사람을 골라도 처음 고른 사람이 돌아온다 (locked=true)",
    r.status === 200 && r.json?.targetId === b.id && r.json?.locked === true,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 3. 같은 사람을 다시 고르면 locked=false (조회처럼 동작) ──
  r = await rpc(a.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: b.id,
  });
  check(
    "[3] 재호출: 같은 사람이면 locked=false — 새로고침이 오작동하지 않는다",
    r.status === 200 && r.json?.targetId === b.id && r.json?.locked === false,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 4. 본인 지정 차단 ──
  r = await rpc(a.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: a.id,
  });
  check("[4] 차단: 본인은 self_pick", hasCode(r, "self_pick"), `${r.status} ${JSON.stringify(r.json)}`);

  // ── 5. 비참가자(목표 없음) 지정 차단 ──
  r = await rpc(b.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: d.id,
  });
  check(
    "[5] 차단: 목표 없는 사람은 target_not_participant",
    hasCode(r, "target_not_participant"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 6. 비참가자가 고르는 것도 차단 ──
  r = await rpc(d.token, "pick_challenge_peek", {
    p_challenge_id: challengeId, p_target_id: a.id,
  });
  check(
    "[6] 차단: 목표 없는 사람은 고를 수도 없다 (not_participant)",
    hasCode(r, "not_participant"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 7. 없는/비활성 챌린지 차단 ──
  r = await rpc(a.token, "pick_challenge_peek", {
    p_challenge_id: NOBODY, p_target_id: b.id,
  });
  check(
    "[7] 차단: 없는 챌린지는 challenge_not_active",
    hasCode(r, "challenge_not_active"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 8. RLS: 본인 선택만 보인다 ──
  r = await api(a.token, "GET", "/rest/v1/challenge_peek_picks?select=viewer_id,target_id");
  check(
    "[8] RLS: 내 선택 1건만 보인다",
    r.status === 200 && (r.json ?? []).length === 1 && r.json[0].target_id === b.id,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(c.token, "GET", "/rest/v1/challenge_peek_picks?select=viewer_id,target_id");
  check(
    "[9] RLS: 남의 선택은 안 보인다",
    r.status === 200 && (r.json ?? []).length === 0,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 10. 직접 쓰기 차단 ──
  r = await api(c.token, "POST", "/rest/v1/challenge_peek_picks", {
    viewer_id: c.id, challenge_id: challengeId,
    pick_date: today, target_id: a.id,
  });
  check("[10] RLS: 직접 insert 차단", r.status >= 400, `status=${r.status} ${JSON.stringify(r.json)}`);
} finally {
  if (groupId) await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
