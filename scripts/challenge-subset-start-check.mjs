// 그룹 3명 중 2명만 참가한 챌린지가 시작되는가 — 0045·0046 회귀 방지.
// 실행: node scripts/challenge-subset-start-check.mjs
//
// 같은 버그가 두 번 나갔다. 챌린지 RPC들이 "참가자"를 group_members로 세는
// 전제를 공유했는데, 0045가 start_challenge만 고쳐서 approve_challenge_goals가
// 여전히 막았다(동의가 영원히 0 → consent_incomplete). 0046이 나머지를 고쳤다.
//
// 이 스크립트가 지키는 것: **그룹의 부분집합만으로 챌린지를 돌릴 수 있는가.**
// 어느 RPC 하나라도 group_members로 되돌아가면 여기서 깨진다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";
import { makePermanent } from "./_permanent-user.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const guard = await createDeleteGuard({ url: URL_, serviceKey: SERVICE });

let passed = 0, failed = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : ` — ${d}`}`);
  if (ok) passed++;
  else failed++;
};

async function api(token, method, path, body) {
  const r = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: token === SERVICE ? SERVICE : KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* 본문 없음 */ }
  return { status: r.status, json };
}
const rpc = (t, fn, args) => api(t, "POST", `/rest/v1/rpc/${fn}`, args);

async function anon(nick) {
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(j));
  // 0094: 익명은 크루 요청·초대 발행·챌린지 생성이 막힌다. 실사용자는 온보딩에서
  //       카카오·구글을 먼저 거치므로 **정식 계정이 정상 상태**다.
  j.access_token = await makePermanent(j);
  const u = { token: j.access_token, id: j.user.id };
  await api(u.token, "POST", "/rest/v1/profiles", {
    id: u.id, nickname: `${nick}-${Date.now().toString(36).slice(-5)}`, weekly_goal: 3,
  });
  return u;
}

const users = [];
let groupId = null;
const today = new Date();
const start = today.toISOString().slice(0, 10);
const end = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

try {
  const a = await anon("subA"); // 방장 · 참가
  const b = await anon("subB"); // 초대받아 참가
  const c = await anon("subC"); // **그룹에는 있지만 챌린지엔 없음**
  users.push(a, b, c);

  const g = await rpc(a.token, "create_group", { p_name: `부분참가-${Date.now().toString(36).slice(-4)}` });
  const grp = Array.isArray(g.json) ? g.json[0] : g.json;
  groupId = grp.id;
  for (const u of [b, c]) await rpc(u.token, "join_group_with_code", { p_code: grp.invite_code });

  const gm = await api(SERVICE, "GET", `/rest/v1/group_members?select=user_id&group_id=eq.${groupId}`);
  check("픽스처: 그룹 멤버 3명", (gm.json ?? []).length === 3, JSON.stringify(gm.json?.length));

  const ch = await rpc(a.token, "create_challenge_room", {
    p_name: "부분 참가 챌린지", p_start_date: start, p_end_date: end,
  });
  const chId = ch.json?.id;
  check("챌린지 생성 (방장만 참가자)", ch.status === 200 && Boolean(chId), `${ch.status} ${JSON.stringify(ch.json)}`);

  await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: b.id });
  const acc = await rpc(b.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("B 수락 → 참가자 2명", acc.status === 200, `${acc.status} ${JSON.stringify(acc.json)}`);

  const parts = await api(SERVICE, "GET", `/rest/v1/challenge_participants?select=user_id,status&challenge_id=eq.${chId}`);
  const joined = (parts.json ?? []).filter((p) => p.status === "joined");
  check("참가자 2명 · 그룹은 3명 (C는 참가 안 함)", joined.length === 2 && !joined.some((p) => p.user_id === c.id), JSON.stringify(parts.json));

  // A만 목표 → kpi_incomplete가 /2로 나와야 한다 (0045 전에는 /3)
  await api(a.token, "POST", "/rest/v1/user_goals", {
    user_id: a.id, challenge_id: chId, group_id: groupId,
    goal_type: "weight_days", target_value: 5, planned_days: 3, qualifier: 3,
  });
  const partial = await rpc(a.token, "start_challenge", { p_challenge_id: chId });
  const msg = JSON.stringify(partial.json);
  check("A만 목표 → kpi_incomplete:1/2 (분모가 그룹 3이 아니라 참가자 2)", msg.includes("kpi_incomplete:1/2"), msg);

  await api(b.token, "POST", "/rest/v1/user_goals", {
    user_id: b.id, challenge_id: chId, group_id: groupId,
    goal_type: "cardio_distance", target_value: 10, planned_days: 3,
  });
  const noConsent = await rpc(a.token, "start_challenge", { p_challenge_id: chId });
  check("목표 2/2 · 동의 0 → consent_incomplete:0/2", JSON.stringify(noConsent.json).includes("consent_incomplete:0/2"), JSON.stringify(noConsent.json));

  await rpc(a.token, "approve_challenge_goals", { p_challenge_id: chId });
  await rpc(b.token, "approve_challenge_goals", { p_challenge_id: chId });

  const started = await rpc(a.token, "start_challenge", { p_challenge_id: chId });
  check(
    "🎯 그룹 3명 중 참가자 2명만으로 시작 성공 (0045의 본체)",
    started.status === 200 && started.json?.status === "active",
    `${started.status} ${JSON.stringify(started.json)}`,
  );

  // C(그룹 멤버지만 비참가자)는 시작 자격도 없어야 한다
  const ch2 = await rpc(c.token, "create_challenge_room", {
    p_name: "C의 방", p_start_date: start, p_end_date: end,
  });
  const outsider = await rpc(c.token, "start_challenge", { p_challenge_id: chId });
  check(
    "비참가자는 남의 챌린지를 시작할 수 없다 (challenge_not_found)",
    outsider.status >= 400 && JSON.stringify(outsider.json).includes("challenge_not_found"),
    JSON.stringify(outsider.json),
  );
  if (ch2.json?.id) await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${ch2.json.id}`);
  await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`);
} finally {
  if (groupId) await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const u of users) await guard.deleteIfCreatedThisRun(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
