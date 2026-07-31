// 0049 초대 링크 검증 — 코드 발급·참가·경계.
// 실행: node scripts/challenge-invite-link-check.mjs  (사전조건: 0049 적용)
//
// 지키는 것: 크루 밖 사람이 링크만으로 챌린지에 들어올 수 있는가, 그리고
// 들어오면 안 되는 경우(active·잘못된 코드·비host 발급)가 실제로 막히는가.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

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

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

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
  try {
    json = await r.json();
  } catch {
    /* 본문 없음 */
  }
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
  const u = { token: j.access_token, id: j.user.id };
  await api(u.token, "POST", "/rest/v1/profiles", {
    id: u.id,
    nickname: `${nick}-${Date.now().toString(36).slice(-5)}`,
    weekly_goal: 3,
  });
  return u;
}

const users = [];
let groupId = null;
const today = new Date();
const start = today.toISOString().slice(0, 10);
const end = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

try {
  const host = await anon("lnkH"); // 방장
  const outsider = await anon("lnkO"); // **크루 밖 사람** — 링크로만 들어온다
  const other = await anon("lnkX"); // 남의 챌린지에 손대려는 사람
  users.push(host, outsider, other);

  const g = await rpc(host.token, "create_group", {
    p_name: `링크테스트-${Date.now().toString(36).slice(-4)}`,
  });
  groupId = (Array.isArray(g.json) ? g.json[0] : g.json).id;

  const ch = await rpc(host.token, "create_challenge_room", {
    p_name: "링크 초대 챌린지",
    p_start_date: start,
    p_end_date: end,
  });
  const chId = ch.json?.id;
  check("픽스처: 챌린지 생성", ch.status === 200 && Boolean(chId), JSON.stringify(ch.json));

  // ── 발급 ──
  const issued = await rpc(host.token, "issue_challenge_invite_code", {
    p_challenge_id: chId,
  });
  const code = issued.json;
  check(
    "방장이 코드를 발급한다 (GND- 형식)",
    issued.status === 200 && typeof code === "string" && code.startsWith("GND-"),
    `${issued.status} ${JSON.stringify(issued.json)}`,
  );

  const again = await rpc(host.token, "issue_challenge_invite_code", {
    p_challenge_id: chId,
  });
  check(
    "재발급은 같은 코드다 (멱등 — 안 그러면 먼저 보낸 링크가 죽는다)",
    again.json === code,
    `${JSON.stringify(again.json)} vs ${JSON.stringify(code)}`,
  );

  const byOther = await rpc(other.token, "issue_challenge_invite_code", {
    p_challenge_id: chId,
  });
  check(
    "참가자가 아니면 발급 불가 (challenge_not_found)",
    byOther.status >= 400 && JSON.stringify(byOther.json).includes("challenge_not_found"),
    JSON.stringify(byOther.json),
  );

  // ── 참가 ──
  const bad = await rpc(outsider.token, "join_challenge_with_code", { p_code: "GND-ZZZZZ" });
  check(
    "없는 코드는 거부 (invalid_invite_code)",
    bad.status >= 400 && JSON.stringify(bad.json).includes("invalid_invite_code"),
    JSON.stringify(bad.json),
  );

  const joined = await rpc(outsider.token, "join_challenge_with_code", { p_code: code });
  check(
    "🎯 크루 밖 사람이 링크만으로 참가한다",
    joined.status === 200 && joined.json?.status === "joined",
    `${joined.status} ${JSON.stringify(joined.json)}`,
  );

  const parts = await api(
    SERVICE,
    "GET",
    `/rest/v1/challenge_participants?select=user_id,role,status&challenge_id=eq.${chId}`,
  );
  const rows = Array.isArray(parts.json) ? parts.json : [];
  const mine = rows.find((p) => p.user_id === outsider.id);
  check(
    "참가자로 joined·member로 들어간다",
    rows.length === 2 && mine?.status === "joined" && mine?.role === "member",
    JSON.stringify(rows),
  );

  // ── 챌린지 참가와 크루 관계는 별개 ──
  const links = await api(
    SERVICE,
    "GET",
    `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${outsider.id},user_b.eq.${outsider.id})`,
  );
  const linkRows = Array.isArray(links.json) ? links.json : [];
  check(
    "링크 참가 후 crew_links가 생기지 않는다",
    links.status === 200 && Array.isArray(links.json) && linkRows.length === 0,
    JSON.stringify(linkRows),
  );

  const dup = await rpc(outsider.token, "join_challenge_with_code", { p_code: code });
  check(
    "이미 참가했으면 already_joined",
    dup.status >= 400 && JSON.stringify(dup.json).includes("already_joined"),
    JSON.stringify(dup.json),
  );

  // ── 그룹에는 안 들어간다 (챌린지 참가 ≠ 크루 가입) ──
  const gm = await api(
    SERVICE,
    "GET",
    `/rest/v1/group_members?select=user_id&group_id=eq.${groupId}&user_id=eq.${outsider.id}`,
  );
  check(
    "링크 참가자는 그룹 멤버가 되지 않는다 (챌린지만 참가)",
    (Array.isArray(gm.json) ? gm.json : []).length === 0,
    JSON.stringify(gm.json),
  );

  // ── active가 되면 링크가 막힌다 ──
  await api(host.token, "POST", "/rest/v1/user_goals", {
    user_id: host.id, challenge_id: chId, group_id: groupId,
    goal_type: "weight_days", target_value: 5, planned_days: 3, qualifier: 3,
  });
  await api(outsider.token, "POST", "/rest/v1/user_goals", {
    user_id: outsider.id, challenge_id: chId, group_id: groupId,
    goal_type: "cardio_distance", target_value: 10, planned_days: 3,
  });
  await rpc(host.token, "approve_challenge_goals", { p_challenge_id: chId });
  await rpc(outsider.token, "approve_challenge_goals", { p_challenge_id: chId });
  const started = await rpc(host.token, "start_challenge", { p_challenge_id: chId });
  check(
    "링크로 들어온 사람 포함해 시작된다",
    started.status === 200 && started.json?.status === "active",
    `${started.status} ${JSON.stringify(started.json)}`,
  );

  const late = await rpc(other.token, "join_challenge_with_code", { p_code: code });
  check(
    "시작한 뒤에는 링크로 못 들어온다 (invalid_status — 중도 합류 차단)",
    late.status >= 400 && JSON.stringify(late.json).includes("invalid_status"),
    JSON.stringify(late.json),
  );

  const issueAfter = await rpc(host.token, "issue_challenge_invite_code", {
    p_challenge_id: chId,
  });
  check(
    "시작한 뒤에는 발급도 막힌다 (invalid_status)",
    issueAfter.status >= 400 && JSON.stringify(issueAfter.json).includes("invalid_status"),
    JSON.stringify(issueAfter.json),
  );

  await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`);
} finally {
  if (groupId) await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const u of users) await guard.deleteIfCreatedThisRun(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
