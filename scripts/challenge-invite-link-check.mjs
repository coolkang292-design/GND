// 0049 초대 링크 검증 — 코드 발급·참가·경계.
// 실행: node scripts/challenge-invite-link-check.mjs  (사전조건: 0049·0061~0063 적용)
//
// 지키는 것: 크루 밖 사람이 링크만으로 챌린지에 들어올 수 있는가, 그리고
// 들어오면 안 되는 경우(active·잘못된 코드·비host 발급)가 실제로 막히는가.
//
// 2026-08-08에 0061~0063 단언이 붙었다. **`🎯` 표시가 붙은 것들이 핵심선이다** —
// 특히 "0051 회귀: 기존 사용자가 링크를 눌러도 방장 크루는 신입 1명 그대로다".
// 그게 깨지면 2026-07-31에 사용자가 신고한 D5(다른 챌린지 멤버가 크루에 섞임)가
// 되살아난 것이다.
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
/** 0062가 자동 생성하는 개인 그룹 — 안 지우면 그 계정 삭제가 500으로 실패한다 */
const extraGroups = [];
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

  // ══ 0063 — 신입만 방장과 친구가 된다 ═══════════════════════════
  //
  // ⚠️⚠️ 이 블록이 2026-07-31 사고(D5)의 재발 방지선이다. `D5`는 링크 참가자
  //      **전원**을 crew_links로 묶었고, 사용자가 "다른 챌린지 멤버가 내 크루에
  //      섞였다"고 신고해서 0051이 지웠다. 0063은 **신입만·방장 한 사람만** 묶는다.
  //      아래 두 가드 단언 중 하나라도 지우면 그 순간 D5가 되살아난다.
  //      `supabase/migrations/0063_newcomer_challenge_crew_link.sql` 헤더 참조.

  const crewCount = async (id) => {
    const r = await api(
      SERVICE,
      "GET",
      `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${id},user_b.eq.${id})`,
    );
    return Array.isArray(r.json) ? r.json.length : -1;
  };

  const hostCrewBefore = await crewCount(host.id);
  check("픽스처: 방장은 아직 크루가 0명이다", hostCrewBefore === 0, `${hostCrewBefore}`);

  // ① 신입 — 참가 0 · 크루 0. 정의상 다른 챌린지에 있을 수 없는 사람.
  const newbie = await anon("lnkN");
  users.push(newbie);
  const asNew = await rpc(newbie.token, "join_challenge_as_newcomer", { p_code: code });
  check(
    "🎯 신입이 링크로 참가하면 방장과 친구가 된다 (crewLinked=1)",
    asNew.status === 200 &&
      asNew.json?.crewLinked === 1 &&
      asNew.json?.hostId === host.id &&
      typeof asNew.json?.hostNickname === "string",
    `${asNew.status} ${JSON.stringify(asNew.json)}`,
  );

  const hostCrew = await rpc(host.token, "get_my_crew");
  check(
    "방장의 get_my_crew에 그 신입이 1명으로 보인다 (0이 아니라 1)",
    (hostCrew.json ?? []).filter((m) => m.id === newbie.id).length === 1,
    JSON.stringify(hostCrew.json),
  );
  const hostCrewAfterNewbie = await crewCount(host.id);
  check("방장 크루가 정확히 1명이 됐다", hostCrewAfterNewbie === 1, `${hostCrewAfterNewbie}`);

  // ② crew_links 가드 — 이미 친구가 있는 사람 = 기존 사용자.
  //    참가는 0건인 계정으로 잡아 **친구 가드 하나만** 재게 한다.
  const vetLink = await anon("lnkV");
  users.push(vetLink);
  const newbieCode = await rpc(newbie.token, "issue_my_invite_code");
  await rpc(vetLink.token, "accept_friend_invite", { p_code: newbieCode.json });
  check(
    "픽스처: vetLink는 친구가 1명 있다 (참가는 0건)",
    (await crewCount(vetLink.id)) === 1,
    `code=${JSON.stringify(newbieCode.json)}`,
  );
  const vetLinkTry = await rpc(vetLink.token, "join_challenge_as_newcomer", { p_code: code });
  check(
    "🎯 이미 친구가 있는 사람은 not_newcomer로 막힌다 (crew_links 가드)",
    vetLinkTry.status >= 400 && JSON.stringify(vetLinkTry.json).includes("not_newcomer"),
    `${vetLinkTry.status} ${JSON.stringify(vetLinkTry.json)}`,
  );

  // ③ challenge_participants 가드 — 이미 챌린지에 있는 사람.
  //    2026-07-31에 사용자가 신고한 바로 그 경우다. `outsider`는 위에서
  //    crew_links 0건임을 확인했으므로 **참가 가드 하나만** 재게 된다.
  const outsiderTry = await rpc(outsider.token, "join_challenge_as_newcomer", { p_code: code });
  check(
    "🎯 이미 챌린지에 있는 계정은 not_newcomer로 막힌다 (participants 가드)",
    outsiderTry.status >= 400 && JSON.stringify(outsiderTry.json).includes("not_newcomer"),
    `${outsiderTry.status} ${JSON.stringify(outsiderTry.json)}`,
  );

  // ⚠️ 이 한 줄이 0051 회귀 단언이다. 가드가 무너지면 여기가 1이 아니라 2·3이 된다.
  const hostCrewAfterVets = await crewCount(host.id);
  check(
    "🎯 0051 회귀: 기존 사용자가 링크를 눌러도 방장 크루는 신입 1명 그대로다",
    hostCrewAfterVets === 1,
    `${hostCrewAfterVets} (신입 직후 ${hostCrewAfterNewbie})`,
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
  // ⚠️ 신입(0063)도 이제 참가자다. 목표·동의를 빼면 start_challenge가
  //    kpi_incomplete:2/3으로 막혀 아래 시작 단언이 통째로 죽는다.
  await api(newbie.token, "POST", "/rest/v1/user_goals", {
    user_id: newbie.id, challenge_id: chId, group_id: groupId,
    goal_type: "cardio_time", target_value: 60, planned_days: 3,
  });
  await rpc(host.token, "approve_challenge_goals", { p_challenge_id: chId });
  await rpc(outsider.token, "approve_challenge_goals", { p_challenge_id: chId });
  await rpc(newbie.token, "approve_challenge_goals", { p_challenge_id: chId });
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

  // ── 0063 실패 원자성 ──
  //
  // `other`는 크루 0 · 참가 0이라 가드는 통과하지만, 참가가 invalid_status로
  // 막힌다. ⚠️ 이때 친구 연결만 남으면 **챌린지에 못 들어갔는데 친구는 된**
  // 상태가 생긴다. 0063이 join_challenge_with_code를 같은 트랜잭션에서 부르는
  // 이유가 이것이고, 이 단언이 그 성질을 잰다.
  const lateNew = await rpc(other.token, "join_challenge_as_newcomer", { p_code: code });
  check(
    "시작한 뒤에는 신입도 못 들어온다 (invalid_status — not_newcomer가 아니다)",
    lateNew.status >= 400 && JSON.stringify(lateNew.json).includes("invalid_status"),
    `${lateNew.status} ${JSON.stringify(lateNew.json)}`,
  );
  const otherCrew = await crewCount(other.id);
  const hostCrewFinal = await crewCount(host.id);
  check(
    "🎯 참가가 실패했으면 친구 연결도 안 남는다 — 방장 크루는 신입 1명 그대로",
    otherCrew === 0 && hostCrewFinal === 1,
    `other=${otherCrew} host=${hostCrewFinal}`,
  );

  await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`);

  // ══ 0062 — 그룹이 없어도 챌린지를 만들 수 있다 ═════════════════
  //
  // 옛 create_challenge_room은 그룹이 없으면 `no_group_yet`으로 막았다. 초대
  // 링크로 처음 온 사람은 그룹이 없으므로 자기 챌린지를 하나도 못 만들었다.
  const solo = await anon("lnkG");
  users.push(solo);
  const soloCh = await rpc(solo.token, "create_challenge_room", {
    p_name: "그룹없는 챌린지",
    p_start_date: start,
    p_end_date: end,
  });
  check(
    "🎯 그룹 없는 계정이 챌린지를 만든다 (no_group_yet으로 막히지 않는다)",
    soloCh.status === 200 && Boolean(soloCh.json?.id),
    `${soloCh.status} ${JSON.stringify(soloCh.json)}`,
  );
  const soloGm = await api(
    SERVICE,
    "GET",
    `/rest/v1/group_members?select=group_id&user_id=eq.${solo.id}`,
  );
  const soloGroups = Array.isArray(soloGm.json) ? soloGm.json : [];
  check(
    "개인 그룹이 자동으로 생겨 group_members에 정확히 1행이 된다",
    soloGroups.length === 1,
    JSON.stringify(soloGm.json),
  );
  for (const row of soloGroups) extraGroups.push(row.group_id);
  if (soloCh.json?.id) {
    await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${soloCh.json.id}`);
  }
} finally {
  // 그룹 먼저, 유저 나중 — `groups.owner_id`가 cascade가 아니라 그룹이 남으면
  // 방장 계정 삭제가 500으로 실패한다 (CLAUDE.md 회귀 스크립트 규약).
  if (groupId) await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const gid of extraGroups) {
    await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${gid}`);
  }
  for (const u of users) await guard.deleteIfCreatedThisRun(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
