// "주 N회" 기본 목표(`workout_days`, 0108)만으로 챌린지가 도는가 — 0108·0110 회귀 방지.
// 실행: node scripts/challenge-simple-goal-check.mjs
//
// 2026-09-18 개편으로 **목표 하나면 참가가 끝난다.** 예전에는 분류별 KPI를
// 세워야 시작이 됐다. 그래서 다음 세 가지가 조용히 깨질 수 있다:
//
//   1) `user_goals_goal_type_check`(0108)에서 `workout_days`가 빠지면
//      **저장 자체가** 23514로 막힌다 — 새 참가자가 아무도 준비를 못 끝낸다.
//      ⚠️ CHECK 제약은 `pnpm db:snapshot`에 담기지 않는다. 그래서 여기서 본다.
//   2) `start_challenge`가 목표를 분류별로 세는 전제로 돌아가면
//      `workout_days` 한 줄만 가진 사람이 `kpi_incomplete`로 막힌다.
//   3) `notify_challenge_goal_ready`(0110)의 dedupe가 풀리면 목표를 고칠 때마다
//      "시작돼요" 알림이 다시 간다 — 화면에는 안 보이고 알림함만 더러워진다.
//
// 그리고 세부 목표와의 공존: 같은 사람이 `workout_days` + `cardio_distance`를
// 동시에 가질 수 있어야 한다((사람·챌린지·지표) 유일 제약에 걸리지 않는다).
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
  // 0094: 익명은 챌린지 생성·초대 발행이 막힌다. 실사용자는 온보딩에서 정식 계정이 된다.
  j.access_token = await makePermanent(j);
  const u = { token: j.access_token, id: j.user.id };
  await api(u.token, "POST", "/rest/v1/profiles", {
    id: u.id, nickname: `${nick}-${Date.now().toString(36).slice(-5)}`, weekly_goal: 3,
  });
  return u;
}

const users = [];
let groupId = null;
let chId = null;
// ⚠️ 시작일을 **내일**로 둔다. 오늘로 두면 `autostart_due_challenges`나 화면 진입이
//    중간에 시작시켜 `notify_challenge_goal_ready`가 `not_setup`을 돌려준다.
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const end = new Date(Date.now() + 29 * 86400000).toISOString().slice(0, 10);
/** 주 3회 × 4주 = 12일 — 화면이 저장하는 값과 같은 계산 */
const WEEKLY = 3;
const PERIOD_DAYS = 12;

try {
  const host = await anon("simpleA");
  const member = await anon("simpleB");
  users.push(host, member);

  const g = await rpc(host.token, "create_group", {
    p_name: `주N회-${Date.now().toString(36).slice(-4)}`,
  });
  const grp = Array.isArray(g.json) ? g.json[0] : g.json;
  groupId = grp?.id;
  await rpc(member.token, "join_group_with_code", { p_code: grp.invite_code });
  check("픽스처: 그룹 2명", Boolean(groupId), JSON.stringify(g.json));

  const ch = await rpc(host.token, "create_challenge_room", {
    p_name: "주N회 회귀", p_start_date: tomorrow, p_end_date: end,
  });
  chId = ch.json?.id;
  check(
    "챌린지 생성 · 시작일은 내일이라 setup",
    ch.status === 200 && ch.json?.status === "setup",
    `${ch.status} ${JSON.stringify(ch.json)}`,
  );

  // 초대 링크 코드로 참가 — 0091부터 참가자 누구나 링크를 뿌린다
  const code = await rpc(host.token, "issue_challenge_invite_code", { p_challenge_id: chId });
  const joined = await rpc(member.token, "join_challenge_with_code", { p_code: code.json });
  check(
    "멤버가 초대 코드로 참가 → joined",
    joined.status === 200,
    `${joined.status} ${JSON.stringify(joined.json)}`,
  );

  // ── 1) `workout_days` 한 줄만 저장된다 (0108의 CHECK 제약) ──────────────
  const saves = [];
  for (const u of [host, member]) {
    saves.push(
      await api(u.token, "POST", "/rest/v1/user_goals", {
        user_id: u.id, challenge_id: chId, group_id: groupId,
        goal_type: "workout_days", target_value: PERIOD_DAYS, planned_days: WEEKLY,
      }),
    );
  }
  check(
    "🎯 workout_days 저장 성공 (0108 CHECK 제약 — 스냅샷에 안 담기는 것)",
    saves.every((s) => s.status === 201),
    saves.map((s) => `${s.status} ${JSON.stringify(s.json)}`).join(" | "),
  );

  const rows = await api(SERVICE, "GET",
    `/rest/v1/user_goals?select=user_id,goal_type,target_value,planned_days&challenge_id=eq.${chId}`);
  check(
    "목표는 사람당 한 줄 · planned_days는 주 N회 그대로",
    (rows.json ?? []).length === 2 &&
      (rows.json ?? []).every((r) => r.goal_type === "workout_days" &&
        Number(r.target_value) === PERIOD_DAYS && r.planned_days === WEEKLY),
    JSON.stringify(rows.json),
  );

  // ── 2) 0110 알림 — 1행, 재호출은 0행 ────────────────────────────────────
  const first = await rpc(host.token, "notify_challenge_goal_ready", { p_challenge_id: chId });
  check(
    "notify_challenge_goal_ready → sent:true",
    first.status === 200 && first.json?.sent === true,
    `${first.status} ${JSON.stringify(first.json)}`,
  );
  const again = await rpc(host.token, "notify_challenge_goal_ready", { p_challenge_id: chId });
  check(
    "🎯 같은 챌린지 재호출 → sent:false (목표를 고쳐도 알림은 한 번)",
    again.status === 200 && again.json?.sent === false,
    `${again.status} ${JSON.stringify(again.json)}`,
  );
  const notes = await api(SERVICE, "GET",
    `/rest/v1/notifications?select=user_id,type,dedupe_key&dedupe_key=like.challenge_goal_ready:${chId}*`);
  check(
    "알림 1행 · 유형은 기존 challenge_starting_soon 재사용",
    (notes.json ?? []).length === 1 && notes.json[0].type === "challenge_starting_soon",
    JSON.stringify(notes.json),
  );

  // 남의 챌린지·비참가자는 존재 자체를 모른다
  const outsider = await anon("simpleC");
  users.push(outsider);
  const stolen = await rpc(outsider.token, "notify_challenge_goal_ready", { p_challenge_id: chId });
  check(
    "비참가자 호출 → challenge_not_found",
    stolen.status >= 400 && JSON.stringify(stolen.json).includes("challenge_not_found"),
    `${stolen.status} ${JSON.stringify(stolen.json)}`,
  );

  // ── 3) 세부 목표와 공존 ────────────────────────────────────────────────
  const detail = await api(member.token, "POST", "/rest/v1/user_goals", {
    user_id: member.id, challenge_id: chId, group_id: groupId,
    goal_type: "cardio_distance", target_value: 40, planned_days: WEEKLY,
  });
  check(
    "🎯 workout_days + cardio_distance 동시 저장 (유일 제약은 지표별)",
    detail.status === 201,
    `${detail.status} ${JSON.stringify(detail.json)}`,
  );

  // ── 4) workout_days 한 줄만으로 start_challenge가 통과한다 ─────────────
  const noConsent = await rpc(host.token, "start_challenge", { p_challenge_id: chId });
  check(
    "목표 2/2 · 동의 0 → consent_incomplete:0/2 (kpi_incomplete가 아니다)",
    JSON.stringify(noConsent.json).includes("consent_incomplete:0/2"),
    `${noConsent.status} ${JSON.stringify(noConsent.json)}`,
  );
  for (const u of [host, member]) {
    await rpc(u.token, "approve_challenge_goals", { p_challenge_id: chId });
  }
  const started = await rpc(host.token, "start_challenge", { p_challenge_id: chId });
  check(
    "🎯 workout_days 한 줄만으로 시작 성공 (분류별 KPI를 요구하지 않는다)",
    started.status === 200 && started.json?.status === "active",
    `${started.status} ${JSON.stringify(started.json)}`,
  );

  // 시작한 뒤에는 "며칠부터 시작해요"가 거짓말이라 보내지 않는다
  const afterStart = await rpc(member.token, "notify_challenge_goal_ready", { p_challenge_id: chId });
  check(
    "시작 뒤 호출 → sent:false · reason:not_setup (오류가 아니다)",
    afterStart.status === 200 && afterStart.json?.sent === false &&
      afterStart.json?.reason === "not_setup",
    `${afterStart.status} ${JSON.stringify(afterStart.json)}`,
  );
} finally {
  if (chId) await api(SERVICE, "DELETE", `/rest/v1/challenges?id=eq.${chId}`);
  if (groupId) await api(SERVICE, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
  for (const u of users) await guard.deleteIfCreatedThisRun(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
