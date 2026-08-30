// 차단 · 신고 · 목표 상향 회귀 (0089 · 0090) — 픽스처 A·B로 실제 RPC를 부른다.
// 실행: node scripts/block-report-goal-check.mjs
//
// ⚠️ tier=fixture — 먼저 `node scripts/dev-fixture.mjs create`가 필요하다.
//    익명 계정을 만들지 않으므로 rate limit(§6.5) 영향은 없다.
//
// 왜 이 스크립트가 필요한가
//   차단은 `is_crew_with` **한 함수**에 얹혀 있다. 그 함수는 피드·댓글·응원·
//   프로필·콕찌르기·기록열람·크루목록·검색·모집글 **아홉 곳**이 통과하는
//   길목이라, 누군가 그 함수를 손보면 차단이 조용히 통째로 풀린다.
//   화면으로는 "안 보여야 할 것이 안 보인다"를 확인하기 어렵다 — 부정 확인이라
//   눈으로는 잘 안 잡힌다. 그래서 여기서 못 박는다.
//
//   0090의 트리거 두 개도 **REST로도 스키마 스냅샷으로도 안 보인다.**
//   함수가 있는 것과 트리거가 테이블에 붙어 있는 것은 다른 문제고, 안 붙어
//   있으면 목표를 낮춰도 그냥 저장된다. 실제로 낮춰 보는 것이 유일한 확인이다.
//
// ⚠️ 이 스크립트는 운영 DB를 **쓴다**(차단·신고·모집 토글). 전부 되돌리고,
//    되돌렸는지까지 단언한다. 중간에 죽으면 픽스처 A가 B를 차단한 채로 남을 수
//    있다 — 그때는 다시 돌리면 정리된다(차단은 멱등이고 마지막에 해제한다).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const PW = env.DEV_FIXTURE_PASSWORD;

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function login(email) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`${email} 로그인 실패: ${JSON.stringify(j).slice(0, 200)}`);
  return { token: j.access_token, id: j.user.id };
}

const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const SH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

async function rpc(token, name, args = {}) {
  const r = await fetch(`${U}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.text() };
}
async function svc(path, opts = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: SH, ...opts });
  return { status: r.status, body: await r.text() };
}
async function asUser(token, path) {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H(token) });
  return { status: r.status, body: await r.text() };
}

const A = await login("dev-fixture-a@gnd.local");
const B = await login("dev-fixture-b@gnd.local");
console.log(`A=${A.id.slice(0, 8)} B=${B.id.slice(0, 8)}\n`);

const crewBefore = JSON.parse((await rpc(A.token, "get_my_crew")).body);
check(
  "기준선: A의 크루 목록에 B가 있다",
  crewBefore.some((m) => m.id === B.id),
  "픽스처가 크루로 안 맺어져 있다 — node scripts/dev-fixture.mjs create 필요",
);

console.log("\n── 0089 차단 ──");
let r = await rpc(A.token, "block_user", { p_target_id: B.id });
check("A가 B를 차단한다", r.status === 200, `${r.status} ${r.body.slice(0, 140)}`);

const crewAfter = JSON.parse((await rpc(A.token, "get_my_crew")).body);
check(
  "차단 후 A의 크루 목록에서 B가 빠진다",
  !crewAfter.some((m) => m.id === B.id),
  `여전히 있다 (${crewAfter.length}명)`,
);

// ⚠️ 반대 방향도 봐야 한다 — B는 차단한 쪽이 아니라 당한 쪽이다
const crewB = JSON.parse((await rpc(B.token, "get_my_crew")).body);
check(
  "차단당한 B의 크루 목록에서도 A가 빠진다 (양방향)",
  !crewB.some((m) => m.id === A.id),
  "B에게 A가 그대로 보인다 — is_blocked_between이 한 방향만 본다",
);

r = await rpc(A.token, "send_crew_request", { p_target_id: B.id });
check("A→B 크루 신청이 blocked_by_me로 막힌다", r.body.includes("blocked_by_me"), `${r.status} ${r.body.slice(0, 140)}`);

r = await rpc(B.token, "send_crew_request", { p_target_id: A.id });
check(
  "B→A는 request_exists로 숨겨진다 (차단 사실 은폐)",
  r.body.includes("request_exists") && !r.body.includes("blocked"),
  `${r.status} ${r.body.slice(0, 140)}`,
);

const blocked = JSON.parse((await rpc(A.token, "list_blocked_users")).body);
check(
  "A의 차단 목록에 B가 닉네임과 함께 뜬다",
  blocked.length === 1 && blocked[0].id === B.id && Boolean(blocked[0].nickname),
  JSON.stringify(blocked).slice(0, 180),
);

const blockedB = JSON.parse((await rpc(B.token, "list_blocked_users")).body);
check("B는 자기가 차단당한 것을 못 본다", blockedB.length === 0, JSON.stringify(blockedB).slice(0, 140));

r = await rpc(A.token, "unblock_user", { p_target_id: B.id });
check("차단이 해제된다", r.status === 200, `${r.status} ${r.body.slice(0, 140)}`);

const crewRestored = JSON.parse((await rpc(A.token, "get_my_crew")).body);
check(
  "해제하면 크루 관계가 그대로 돌아온다 (링크를 안 지웠다)",
  crewRestored.some((m) => m.id === B.id),
  "안 돌아왔다 — crew_links가 지워졌을 수 있다",
);

console.log("\n── 0089 신고 ──");
r = await rpc(A.token, "report_user", { p_target_id: B.id, p_reason: "spam", p_note: "자동 검증" });
const rep1 = r.status === 200 ? JSON.parse(r.body) : null;
check("신고가 접수된다", rep1?.status === "received", `${r.status} ${r.body.slice(0, 140)}`);

r = await rpc(A.token, "report_user", { p_target_id: B.id, p_reason: "spam" });
const rep2 = r.status === 200 ? JSON.parse(r.body) : null;
check(
  "같은 상대 재신고는 already_open으로 같은 건을 준다",
  rep2?.status === "already_open" && rep2?.reportId === rep1?.reportId,
  JSON.stringify(rep2),
);

r = await rpc(A.token, "report_user", { p_target_id: B.id, p_reason: "존재하지않는사유" });
check("목록에 없는 사유는 거부된다", r.status !== 200, `${r.status} ${r.body.slice(0, 140)}`);

r = await rpc(A.token, "report_user", { p_target_id: A.id, p_reason: "spam" });
check("자기 자신은 신고 못 한다", r.body.includes("self_report"), `${r.status} ${r.body.slice(0, 140)}`);

const seenByB = JSON.parse((await asUser(B.token, "user_reports?select=id")).body);
check("신고당한 B는 그 신고를 못 읽는다", Array.isArray(seenByB) && seenByB.length === 0, `B가 ${seenByB.length}건을 봤다`);

if (rep1?.reportId) {
  const d = await svc(`user_reports?id=eq.${rep1.reportId}`, { method: "DELETE" });
  check("검증용 신고를 지웠다", d.status === 204 || d.status === 200, `${d.status} ${d.body.slice(0, 120)}`);
}

console.log("\n── 0090 목표 트리거 ──");
const goals = JSON.parse(
  (
    await svc(
      `user_goals?select=id,target_value,challenges!inner(status)&challenges.status=eq.active&user_id=eq.${A.id}`,
    )
  ).body,
);
if (goals.length === 0) {
  console.log("SKIP  A가 진행 중 챌린지에 목표가 없다 — 실데이터로 트리거를 못 본다");
} else {
  const g = goals[0];
  const orig = Number(g.target_value);
  // ⚠️ 트리거가 없으면 이 UPDATE가 성공해서 실제로 낮아진다. 바로 되돌린다.
  const low = await svc(`user_goals?id=eq.${g.id}`, {
    method: "PATCH",
    headers: SH,
    body: JSON.stringify({ target_value: orig - 1 }),
  });
  const rejected = low.status >= 400 && low.body.includes("goal_lowered");
  check("목표 낮추기가 트리거에 막힌다", rejected, `${low.status} ${low.body.slice(0, 180)}`);
  if (!rejected) {
    await svc(`user_goals?id=eq.${g.id}`, {
      method: "PATCH",
      headers: SH,
      body: JSON.stringify({ target_value: orig }),
    });
    console.log(`      ⚠️ 낮아졌던 값을 ${orig}으로 되돌렸다`);
  }

  const typeChange = await svc(`user_goals?id=eq.${g.id}`, {
    method: "PATCH",
    headers: SH,
    body: JSON.stringify({ goal_type: "cardio_distance" }),
  });
  check("목표 종류 변경이 막힌다", typeChange.body.includes("goal_type_locked"), `${typeChange.status} ${typeChange.body.slice(0, 160)}`);

  const days = await svc(`user_goals?id=eq.${g.id}`, {
    method: "PATCH",
    headers: SH,
    body: JSON.stringify({ planned_days: 1 }),
  });
  check("planned_days 낮추기가 막힌다", days.body.includes("goal_planned_days_lowered"), `${days.status} ${days.body.slice(0, 160)}`);

  const after = JSON.parse((await svc(`user_goals?select=target_value,planned_days,goal_type&id=eq.${g.id}`)).body);
  check("검증 뒤 목표가 원래 값 그대로다", Number(after[0].target_value) === orig, `${after[0]?.target_value} vs ${orig}`);
}

console.log("\n── 0089 recruit_opened_at 트리거 ──");
const junk = JSON.parse(
  (await svc("challenges?select=id,name,discoverable,recruit_opened_at&status=eq.cancelled&discoverable=is.true&limit=1"))
    .body,
);
if (junk.length === 0) {
  console.log("SKIP  시험용 취소된 모집 챌린지가 없다");
} else {
  const c = junk[0];
  // cancelled는 list_discoverable_challenges(status='setup')에 안 뜨므로 화면 영향이 없다
  await svc(`challenges?id=eq.${c.id}`, { method: "PATCH", headers: SH, body: JSON.stringify({ discoverable: false }) });
  const off = JSON.parse((await svc(`challenges?select=recruit_opened_at&id=eq.${c.id}`)).body);
  check("공개를 끄면 recruit_opened_at이 비워진다", off[0].recruit_opened_at === null, JSON.stringify(off[0]));

  await svc(`challenges?id=eq.${c.id}`, { method: "PATCH", headers: SH, body: JSON.stringify({ discoverable: true }) });
  const on = JSON.parse((await svc(`challenges?select=recruit_opened_at&id=eq.${c.id}`)).body);
  const fresh = on[0].recruit_opened_at && Date.now() - new Date(on[0].recruit_opened_at).getTime() < 120_000;
  check("다시 켜면 recruit_opened_at이 지금으로 찍힌다 (7일 새로 시작)", Boolean(fresh), JSON.stringify(on[0]));

  await svc(`challenges?id=eq.${c.id}`, {
    method: "PATCH",
    headers: SH,
    body: JSON.stringify({ discoverable: c.discoverable }),
  });
  console.log(`      (${c.name} 을 원래 상태 discoverable=${c.discoverable} 로 되돌렸다)`);
}

// 흔적 정리 — 위 토글이 cancelled 챌린지에 recruit_opened_at을 찍어 놓는다.
// 화면에는 안 뜨지만(status='setup'만 조회된다) 실행할 때마다 값이 바뀌는 것을
// 남기지 않는다. discoverable을 안 건드리므로 트리거가 돌지 않는다.
await svc("challenges?status=eq.cancelled&discoverable=is.true", {
  method: "PATCH",
  headers: SH,
  body: JSON.stringify({ recruit_opened_at: null }),
});

// 공허한 통과 방지 — 단언이 통째로 사라지면 0/0 passed가 되는데, 러너는
// 요약줄만 보므로 그것을 "실패 0"으로 읽는다 (CLAUDE.md §테스트가 진짜 테스트인지).
check(
  "이번 실행이 무언가는 검증했다",
  passed + failed >= 20,
  `단언이 ${passed + failed}건뿐이다 — 사라진 단언이 있다`,
);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
