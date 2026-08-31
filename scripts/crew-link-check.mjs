// 0038 검증: 크루 연결 그래프 — 검색·요청·수락·역방향 자동수락·거절·취소·해제·RLS.
// 실행: node scripts/crew-link-check.mjs
// 사전조건: 0038이 적용되어 있어야 한다.
//
// 시나리오 33건은 계획서 Task 3 / 인수인계서 §4의 목록과 1:1로 대응한다.
// 출력의 [n]이 그 번호다.
//
// 정리: 익명 가입으로 만든 계정만 id로 지운다(저장소 관례). 실계정은 이 스크립트가
// 알지도 못하는 id라 건드릴 수 없다. profiles → crew_links/crew_requests가 전부
// on delete cascade라, auth 계정을 지우면 이 스크립트가 만든 행은 함께 사라진다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";
import { makePermanent } from "./_permanent-user.mjs";

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

async function rpc(token, name, args) {
  return api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});
}

async function anonUser(tag) {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  // 0094: 익명은 크루 요청·초대 발행·챌린지 생성이 막힌다. 실사용자는 온보딩에서
  //       카카오·구글을 먼저 거치므로 **정식 계정이 정상 상태**다.
  json.access_token = await makePermanent(json);
  const user = { id: json.user.id, token: json.access_token, nickname: `링크${RUN}${tag}` };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: user.nickname,
    avatar_url: "🐤",
    weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  return user;
}

const deleteAuthUser = (id) => _guard.deleteIfCreatedThisRun(id);

/** RPC 실패 응답이 기대한 에러 코드를 담고 있는가 */
function hasCode(result, code) {
  return result.status >= 400 && JSON.stringify(result.json ?? {}).includes(code);
}

let users = [];

try {
  const a = await anonUser("a");
  const b = await anonUser("b");
  const c = await anonUser("c");
  const d = await anonUser("d");
  const e = await anonUser("e");
  users = [a, b, c, d, e];

  // ── 검색 ────────────────────────────────────────────────────
  let r = await rpc(a.token, "search_profile_by_nickname", { p_nickname: b.nickname });
  check(
    "[1] 검색: 정확 일치 1명",
    r.status === 200 && r.json?.length === 1 && r.json[0].id === b.id,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  check(
    "[2] 검색: relation=none · request_id=null",
    r.json?.[0]?.relation === "none" && r.json?.[0]?.request_id === null,
    JSON.stringify(r.json?.[0]),
  );

  r = await rpc(a.token, "search_profile_by_nickname", {
    p_nickname: b.nickname.slice(0, 2),
  });
  check(
    "[3] 검색: 앞 2글자로는 0행 (앞글자 검색 없음)",
    r.status === 200 && (r.json ?? []).length === 0,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(a.token, "search_profile_by_nickname", {
    p_nickname: `  ${b.nickname.toUpperCase()}  `,
  });
  check(
    "[4] 검색: 대소문자·공백 달라도 같은 1명",
    r.status === 200 && r.json?.length === 1 && r.json[0].id === b.id,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(a.token, "search_profile_by_nickname", { p_nickname: `없는사람${RUN}` });
  check(
    "[5] 검색: 없는 닉네임은 0행이고 에러 아님",
    r.status === 200 && (r.json ?? []).length === 0,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 요청 ────────────────────────────────────────────────────
  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check(
    "[6] 요청: status=pending 으로 생성",
    r.status === 200 && r.json?.status === "pending" && Boolean(r.json?.requestId),
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  const reqAB = r.json?.requestId;

  r = await rpc(a.token, "search_profile_by_nickname", { p_nickname: b.nickname });
  check(
    "[7] 요청: 보낸 쪽은 relation=request_sent · request_id 채워짐",
    r.json?.[0]?.relation === "request_sent" && r.json?.[0]?.request_id === reqAB,
    JSON.stringify(r.json?.[0]),
  );

  r = await rpc(b.token, "search_profile_by_nickname", { p_nickname: a.nickname });
  check(
    "[8] 요청: 받는 쪽은 relation=request_received · 같은 request_id",
    r.json?.[0]?.relation === "request_received" && r.json?.[0]?.request_id === reqAB,
    JSON.stringify(r.json?.[0]),
  );

  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check("[9] 요청: 중복은 request_exists", hasCode(r, "request_exists"), `${r.status} ${JSON.stringify(r.json)}`);

  r = await rpc(a.token, "send_crew_request", { p_target_id: a.id });
  check("[10] 요청: 자기 자신은 self_request", hasCode(r, "self_request"), `${r.status} ${JSON.stringify(r.json)}`);

  r = await rpc(a.token, "send_crew_request", { p_target_id: NOBODY });
  check(
    "[11] 요청: 없는 uuid는 target_not_found",
    hasCode(r, "target_not_found"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 받은함 · 수락 ───────────────────────────────────────────
  r = await rpc(b.token, "get_incoming_crew_requests");
  check(
    "[12] 받은함: 1건이고 보낸 사람이 A",
    r.json?.length === 1 && r.json[0].request_id === reqAB && r.json[0].requester_id === a.id,
    JSON.stringify(r.json),
  );

  r = await rpc(c.token, "accept_crew_request", { p_request_id: reqAB });
  check(
    "[13] 수락: 제3자는 not_addressee",
    hasCode(r, "not_addressee"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(b.token, "accept_crew_request", { p_request_id: reqAB });
  check(
    "[14] 수락: 성공",
    r.status === 200 && r.json?.status === "accepted",
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(b.token, "accept_crew_request", { p_request_id: reqAB });
  check(
    "[15] 수락: 이미 수락된 것 재수락은 not_pending",
    hasCode(r, "not_pending"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  const crewA = await rpc(a.token, "get_my_crew");
  const crewB = await rpc(b.token, "get_my_crew");
  check(
    "[16] 목록: 양쪽 get_my_crew에 서로가 보인다",
    (crewA.json ?? []).some((m) => m.id === b.id) &&
      (crewB.json ?? []).some((m) => m.id === a.id),
    `A=${JSON.stringify(crewA.json)} B=${JSON.stringify(crewB.json)}`,
  );

  r = await rpc(a.token, "search_profile_by_nickname", { p_nickname: b.nickname });
  check(
    "[17] 수락 후: relation=crew · request_id=null",
    r.json?.[0]?.relation === "crew" && r.json?.[0]?.request_id === null,
    JSON.stringify(r.json?.[0]),
  );

  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check(
    "[18] 요청: 이미 크루면 already_crew",
    hasCode(r, "already_crew"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 역방향 자동 수락 ────────────────────────────────────────
  await rpc(a.token, "send_crew_request", { p_target_id: c.id });
  r = await rpc(c.token, "send_crew_request", { p_target_id: a.id });
  check(
    "[19] 역방향: A→C pending 상태에서 C→A 는 즉시 accepted",
    r.status === 200 && r.json?.status === "accepted",
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(c.token, "get_incoming_crew_requests");
  check(
    "[20] 역방향: 자동 수락된 요청은 C 받은함에 안 남는다",
    !(r.json ?? []).some((x) => x.requester_id === a.id),
    JSON.stringify(r.json),
  );

  // ── 거절 · 쿨다운 ───────────────────────────────────────────
  const sentAD = await rpc(a.token, "send_crew_request", { p_target_id: d.id });
  const reqAD = sentAD.json?.requestId;
  r = await rpc(d.token, "reject_crew_request", { p_request_id: reqAD });
  check(
    "[21] 거절: 성공",
    r.status === 200 && r.json?.status === "rejected",
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(a.token, "send_crew_request", { p_target_id: d.id });
  check(
    "[22] 거절: 직후 재요청은 request_exists (7일 쿨다운)",
    hasCode(r, "request_exists"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(a.token, "GET", `/rest/v1/notifications?actor_id=eq.${d.id}&select=id,type`);
  check(
    "[23] 거절: 요청자에게 알림을 만들지 않는다",
    r.status === 200 && (r.json ?? []).length === 0,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 취소 ────────────────────────────────────────────────────
  const sentAE = await rpc(a.token, "send_crew_request", { p_target_id: e.id });
  const reqAE = sentAE.json?.requestId;
  r = await rpc(a.token, "cancel_crew_request", { p_request_id: reqAE });
  check(
    "[24] 취소: 성공",
    r.status === 200 && r.json?.status === "canceled",
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // 수신자는 상태와 무관하게 not_requester에서 먼저 걸린다(권한 검사가 앞선다).
  r = await rpc(e.token, "cancel_crew_request", { p_request_id: reqAE });
  check(
    "[25] 취소: 수신자가 취소하면 not_requester",
    hasCode(r, "not_requester"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(e.token, "get_incoming_crew_requests");
  check(
    "[26] 취소: 받은함에서 사라진다",
    !(r.json ?? []).some((x) => x.request_id === reqAE),
    JSON.stringify(r.json),
  );

  // ── 알림 ────────────────────────────────────────────────────
  r = await api(b.token, "GET", "/rest/v1/notifications?type=eq.crew_request&select=id,actor_id");
  check(
    "[27] 알림: crew_request 도달",
    r.status === 200 && (r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(a.token, "GET", "/rest/v1/notifications?type=eq.crew_accepted&select=id,actor_id");
  check(
    "[28] 알림: crew_accepted 도달",
    r.status === 200 && (r.json ?? []).some((n) => n.actor_id === b.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 직접 쓰기 차단 ──────────────────────────────────────────
  const [ua, ub] = a.id < d.id ? [a.id, d.id] : [d.id, a.id];
  r = await api(a.token, "POST", "/rest/v1/crew_links", { user_a: ua, user_b: ub });
  check("[29] RLS: crew_links 직접 insert 차단", r.status >= 400, `status=${r.status} ${JSON.stringify(r.json)}`);

  r = await api(a.token, "POST", "/rest/v1/crew_requests", {
    requester_id: a.id,
    addressee_id: d.id,
  });
  check("[30] RLS: crew_requests 직접 insert 차단", r.status >= 400, `status=${r.status} ${JSON.stringify(r.json)}`);

  // ── 해제 ────────────────────────────────────────────────────
  r = await rpc(a.token, "remove_crew", { p_target_id: b.id });
  check(
    "[31] 해제: 성공",
    r.status === 200 && r.json?.status === "removed",
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(a.token, "get_my_crew");
  check(
    "[32] 해제: 목록에서 사라진다",
    !(r.json ?? []).some((m) => m.id === b.id),
    JSON.stringify(r.json),
  );

  r = await rpc(a.token, "remove_crew", { p_target_id: b.id });
  check(
    "[33] 해제: 크루가 아니면 not_crew",
    hasCode(r, "not_crew"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ══════════════════════════════════════════════════════════
  // 0039 회귀 — 여기부터는 0039가 적용된 뒤에만 통과한다.
  // 0038까지만 적용된 상태에서 돌리면 [34]~[47]이 무더기로 FAIL한다(정상).
  //
  // 이 시점의 관계: a↔c 는 크루(역방향 자동수락으로 맺음), a↔d 는 비크루.
  // a는 어떤 그룹에도 속하지 않는다 = 혼자모드. 그룹 없이도 크루에게 알림이
  // 가는지가 0039의 핵심이다.
  // ══════════════════════════════════════════════════════════
  console.log("\n-- 0039 회귀 (0038까지만 적용됐다면 아래는 실패가 정상) --");

  // group_id 없이 세션을 만든다. visibility는 0004에서 기본값이 'group'이다.
  const draft = await api(a.token, "POST", "/rest/v1/workout_sessions", {
    user_id: a.id,
    timezone: "Asia/Seoul",
  });
  const sessionId = draft.json?.[0]?.id;
  check("[34] 세션 생성 (혼자모드 — group_id 없음)", Boolean(sessionId), JSON.stringify(draft.json));

  await rpc(a.token, "start_workout", { p_session_id: sessionId });

  r = await api(c.token, "GET", "/rest/v1/notifications?type=eq.workout_started&select=id,actor_id");
  check(
    "[35] 팬아웃①: 크루(C)에게 운동시작 도달 — 그룹 없이도",
    (r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(d.token, "GET", "/rest/v1/notifications?type=eq.workout_started&select=id,actor_id");
  check(
    "[36] 팬아웃①: 비크루(D)에게는 안 간다",
    !(r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // 응원 — 0039가 send_cheer의 그룹 관문을 크루로 바꿨는지
  r = await rpc(c.token, "send_cheer", { p_session_id: sessionId, p_cheer_type: "fire" });
  check("[37] 응원: 크루(C)는 보낼 수 있다", r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

  r = await rpc(d.token, "send_cheer", { p_session_id: sessionId, p_cheer_type: "fire" });
  check(
    "[38] 응원: 비크루(D)는 session_not_found",
    hasCode(r, "session_not_found"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // 본인 응원은 own_session이어야 한다. 판정을 한 덩어리로 두면 session_not_found로
  // 새고 own_session이 죽은 코드가 된다(rls-test.mjs:403이 이걸 잡는다).
  r = await rpc(a.token, "send_cheer", { p_session_id: sessionId, p_cheer_type: "fire" });
  check(
    "[39] 응원: 본인 세션은 own_session (session_not_found로 새면 안 된다)",
    hasCode(r, "own_session"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  await rpc(a.token, "complete_workout", { p_session_id: sessionId });

  await rpc(a.token, "mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "벤치프레스 지난 기록을 넘었어요",
  });

  r = await api(c.token, "GET", "/rest/v1/notifications?type=eq.record_beaten&select=id,actor_id");
  check(
    "[40] 팬아웃②: 크루(C)에게 기록갱신 도달",
    (r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(d.token, "GET", "/rest/v1/notifications?type=eq.record_beaten&select=id,actor_id");
  check(
    "[41] 팬아웃②: 비크루(D)에게는 안 간다",
    !(r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // 세션 열람 RLS
  r = await api(c.token, "GET", `/rest/v1/workout_sessions?id=eq.${sessionId}&select=id`);
  check("[42] 열람: 크루(C)는 완료 세션이 보인다", (r.json ?? []).length === 1, `${r.status} ${JSON.stringify(r.json)}`);

  r = await api(d.token, "GET", `/rest/v1/workout_sessions?id=eq.${sessionId}&select=id`);
  check("[43] 열람: 비크루(D)에게는 안 보인다", (r.json ?? []).length === 0, `${r.status} ${JSON.stringify(r.json)}`);

  // ⚠ 여기 3건이 DB 리뷰가 잡은 블로커를 지킨다.
  // 옛 판정 is_group_member(s.group_id, auth.uid())는 세션 주인 본인에게 true였다.
  // is_crew_with는 crew_links의 check (user_a < user_b) 때문에 자기 자신에겐
  // 구조적으로 항상 false다. workout_session_crew_visible에 자기접근 분기를
  // 남기지 않으면 reactions 정책 두 개가 뒤집힌다 — 거기 user_id는 세션 주인이
  // 아니라 "반응을 누른 사람"이라 앞단 self 분기가 없기 때문이다(0011:124·128).
  r = await api(a.token, "POST", "/rest/v1/reactions", {
    session_id: sessionId, user_id: a.id, reaction_type: "fire",
  });
  check("[44] 반응: 본인 세션에 본인이 남길 수 있다", r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);

  r = await api(c.token, "POST", "/rest/v1/reactions", {
    session_id: sessionId, user_id: c.id, reaction_type: "clap",
  });
  check("[45] 반응: 크루(C)가 남길 수 있다", r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);

  r = await api(a.token, "GET", `/rest/v1/reactions?session_id=eq.${sessionId}&select=user_id,reaction_type`);
  check(
    "[46] 반응: 내 카드에서 크루가 누른 반응이 보인다 (0으로 뭉개지면 안 된다)",
    (r.json ?? []).some((x) => x.user_id === c.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // 비크루 차단 3종
  r = await rpc(d.token, "get_crew_member_profile", { p_target_id: a.id });
  check("[47] 차단: 비크루(D) 프로필 조회", hasCode(r, "not_crew"), `${r.status} ${JSON.stringify(r.json)}`);

  r = await rpc(c.token, "get_crew_member_profile", { p_target_id: a.id });
  check("[48] 허용: 크루(C) 프로필 조회", r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

  r = await rpc(d.token, "poke_user", { p_target_id: a.id });
  check(
    "[49] 차단: 비크루(D) 콕 찌르기",
    hasCode(r, "not_crew") || hasCode(r, "poke_requires_workout"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await rpc(d.token, "view_record", { p_target_id: a.id });
  check(
    "[50] 차단: 비크루(D) 성과 열람",
    hasCode(r, "not_crew") || hasCode(r, "not_eligible"),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // ── 팬아웃③ 레벨업 ─────────────────────────────────────────
  // 정상 운동 경로로는 재현할 수 없다 — Lv.2가 200 XP인데 하루 최대 획득이
  // 150(기본 100 + 보너스)이고 같은 날 두 번째 운동은 0 XP다.
  //
  // 대신 apply_xp_and_progress를 service_role로 직접 부른다. 0029/0039가
  // public·anon·authenticated에서만 회수했고 service_role은 회수 대상이 아니다.
  // XP를 한 번에 크게 주면 레벨이 올라가 팬아웃이 그대로 돈다.
  const xp = await api(SERVICE_KEY, "POST", "/rest/v1/rpc/apply_xp_and_progress", {
    p_user_id: a.id,
    p_amount: 500, // Lv.1(0) → Lv.3 이상. 컷은 level_definitions가 원천
    // reason은 0022가 허용 목록으로 제약한다. 임의 문자열은 23514로 막힌다.
    p_reason: "admin_adjustment",
    p_reward_group: "test",
    p_source_type: "test",
    p_source_id: `crewlink-${RUN}-levelup`,
    p_effective_date: new Date().toISOString().slice(0, 10),
    p_metadata: {},
  });
  check(
    "[51] 팬아웃③ 사전: 레벨업이 실제로 일어났다",
    xp.status === 200 && xp.json?.levelUp === true,
    `${xp.status} ${JSON.stringify(xp.json)}`,
  );

  r = await api(c.token, "GET", "/rest/v1/notifications?type=eq.level_up&select=id,actor_id");
  check(
    "[52] 팬아웃③: 크루(C)에게 레벨업 도달",
    (r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await api(d.token, "GET", "/rest/v1/notifications?type=eq.level_up&select=id,actor_id");
  check(
    "[53] 팬아웃③: 비크루(D)에게는 안 간다",
    !(r.json ?? []).some((n) => n.actor_id === a.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );
} finally {
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
