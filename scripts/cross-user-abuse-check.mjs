/**
 * Cross-user 공격 회귀 — 계정 A가 계정 B의 것을 읽거나 바꿀 수 있는가.
 *
 * 배포 B(권한 전수 감사)의 증거 수집용. `anon-capability-probe.mjs`가 "익명이
 * 무엇을 할 수 있나"를 보는 것과 짝을 이룬다. 이쪽은 **정식 사용자끼리**의
 * 경계를 본다 — 로그인만 하면 남의 기록·알림·포인트를 건드릴 수 있는지.
 *
 * 실행: node scripts/cross-user-abuse-check.mjs
 *
 * ⚠️ 안전 설계 — 이 스크립트는 운영 DB에 붙는다. 그래서:
 *   1. **계정을 만들지 않는다.** 상설 픽스처 A·B로만 돈다 (익명 가입 rate limit 없음)
 *   2. **쓰기 시도는 전부 "현재 값과 같은 값"을 쓴다.** 공격이 막히면 0행이고,
 *      뚫려도 내용이 안 바뀐다. 어느 쪽이든 데이터가 상하지 않는다
 *   3. **DELETE는 시도하지 않는다.** 뚫려 있으면 실데이터가 사라지기 때문이다.
 *      DELETE 경계는 정책 정적 감사로 본다 (docs/security/public-beta-rpc-audit.md §4)
 *   4. service_role은 **대상 id를 찾는 읽기에만** 쓴다. 공격은 전부 A의 사용자 토큰
 *
 * ⚠️ 실패 = 발견이다. 이 스크립트의 실패는 "스크립트가 낡았다"가 아니라
 *    "그 경로가 실제로 열려 있다"는 뜻이다. 빨개지면 감사 문서를 먼저 봐라.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const PW = env.DEV_FIXTURE_PASSWORD;
if (!URL_ || !ANON || !SVC || !PW) {
  throw new Error(".env.local 설정이 없습니다 (DEV_FIXTURE_PASSWORD 포함)");
}

const SVCH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const RANDOM_UUID = "00000000-0000-4000-8000-000000000000";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  OK  ${name}`);
  } else {
    fail++;
    failures.push(`${name} — ${detail}`);
    console.log(`  XX  ${name}\n        ${detail}`);
  }
}

async function login(email) {
  const j = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  }).then((r) => r.json());
  if (!j.access_token) {
    throw new Error(`${email} 로그인 실패: ${JSON.stringify(j).slice(0, 200)}`);
  }
  const claims = JSON.parse(Buffer.from(j.access_token.split(".")[1], "base64url").toString());
  return { token: j.access_token, id: claims.sub };
}

async function svcGet(path) {
  const j = await (await fetch(`${URL_}/rest/v1/${path}`, { headers: SVCH })).json();
  if (!Array.isArray(j)) throw new Error(`service_role 조회 실패 ${path}: ${JSON.stringify(j).slice(0, 160)}`);
  return j;
}

/** A의 사용자 토큰으로 REST 호출 (service_role을 쓰지 않는다). */
async function asUser(token, path, method = "GET", body, prefer = "return=representation") {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* 빈 응답 */
  }
  return { status: r.status, ok: r.ok, body: j, raw: t.slice(0, 150) };
}

async function rpc(token, name, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* 빈 응답 */
  }
  return { status: r.status, ok: r.ok, body: j, raw: t.slice(0, 150) };
}

const rejected = (res) => !res.ok;
const rowsOf = (res) => (Array.isArray(res.body) ? res.body.length : res.ok ? 1 : 0);

const A = await login("dev-fixture-a@gnd.local");
const B = await login("dev-fixture-b@gnd.local");
console.log(`공격자 A=${A.id}`);
console.log(`피해자 B=${B.id}\n`);

// ── 대상 찾기 (service_role, 읽기 전용) ──────────────────────────────────
const [bProfile] = await svcGet(`profiles?select=id,nickname&id=eq.${B.id}`);
const [bSession] = await svcGet(
  `workout_sessions?select=id,title,status&user_id=eq.${B.id}&order=created_at.desc&limit=1`,
);
const bEx = bSession
  ? (await svcGet(`workout_exercises?select=id,session_id&session_id=eq.${bSession.id}&limit=1`))[0]
  : null;
const bSet = bEx
  ? (await svcGet(`workout_sets?select=id,workout_exercise_id&workout_exercise_id=eq.${bEx.id}&limit=1`))[0]
  : null;
const [bNotif] = await svcGet(`notifications?select=id,user_id,read_at&user_id=eq.${B.id}&limit=1`);
const [otherChallenge] = await svcGet(
  `challenges?select=id,created_by,status&created_by=neq.${A.id}&limit=1`,
);
const strangers = await svcGet(`profiles?select=id&id=neq.${A.id}&id=neq.${B.id}&limit=40`);
const strangerIds = strangers.map((s) => s.id).join(",");
console.log(
  `대상 — 세션:${bSession?.id ?? "-"} 종목:${bEx?.id ?? "-"} 세트:${bSet?.id ?? "-"} ` +
    `알림:${bNotif?.id ?? "-"} 남의챌린지:${otherChallenge?.id ?? "-"} 제3자:${strangers.length}명\n`,
);

// ── 1. 프로필 ───────────────────────────────────────────────────────────
console.log("[1] 프로필");
{
  const r = await asUser(A.token, `profiles?id=eq.${B.id}`, "PATCH", { nickname: bProfile.nickname });
  check("A가 B의 프로필을 수정하지 못한다", rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)} ${r.raw}`);

  const seen = await asUser(A.token, `profiles?select=id&id=in.(${strangerIds})`);
  check(
    "A는 크루/그룹 밖 제3자의 프로필을 전부 보지는 못한다",
    rowsOf(seen) < strangers.length,
    `A가 본 것 ${rowsOf(seen)} / 제3자 ${strangers.length}`,
  );
}

// ── 2. 운동 세션 ────────────────────────────────────────────────────────
console.log("[2] 운동 세션");
if (bSession) {
  const r = await asUser(A.token, `workout_sessions?id=eq.${bSession.id}`, "PATCH", {
    title: bSession.title,
  });
  check("A가 B의 세션을 수정하지 못한다", rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)} ${r.raw}`);

  for (const fn of ["complete_workout", "cancel_workout", "start_workout"]) {
    const x = await rpc(A.token, fn, { p_session_id: bSession.id });
    check(`A가 B의 세션에 ${fn}을 못 건다`, rejected(x), `status=${x.status} ${x.raw}`);
  }
  const mv = await rpc(A.token, "mark_record_beaten", { p_session_id: bSession.id, p_note: "x" });
  check("A가 B의 세션에 mark_record_beaten을 못 건다", rejected(mv), `status=${mv.status} ${mv.raw}`);

  const sv = await rpc(A.token, "set_workout_verification", {
    p_session_id: bSession.id,
    p_source: "camera",
    p_client_captured_at: new Date().toISOString(),
  });
  check("A가 B의 세션 인증상태를 못 바꾼다", rejected(sv), `status=${sv.status} ${sv.raw}`);

  const av = await rpc(A.token, "award_workout_photo_xp", { p_session_id: bSession.id });
  check("A가 B의 세션으로 사진 XP를 못 받는다", rejected(av), `status=${av.status} ${av.raw}`);
}

// ── 3. 종목·세트 ────────────────────────────────────────────────────────
console.log("[3] 종목·세트");
if (bEx) {
  const r = await asUser(A.token, `workout_exercises?id=eq.${bEx.id}`, "PATCH", {
    session_id: bEx.session_id,
  });
  check("A가 B의 종목을 수정하지 못한다", rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)} ${r.raw}`);
}
if (bSet) {
  const r = await asUser(A.token, `workout_sets?id=eq.${bSet.id}`, "PATCH", {
    workout_exercise_id: bSet.workout_exercise_id,
  });
  check("A가 B의 세트를 수정하지 못한다", rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)} ${r.raw}`);
}

// ── 4. 크루 ─────────────────────────────────────────────────────────────
console.log("[4] 크루");
{
  for (const fn of ["accept_crew_request", "reject_crew_request", "cancel_crew_request"]) {
    const x = await rpc(A.token, fn, { p_request_id: RANDOM_UUID });
    check(`A가 남의 크루요청에 ${fn}을 못 건다`, rejected(x), `status=${x.status} ${x.raw}`);
  }
  const all = await svcGet("crew_requests?select=id&limit=200");
  const seen = await asUser(A.token, "crew_requests?select=id,requester_id,addressee_id&limit=200");
  const leaked = (seen.body ?? []).filter((r) => r.requester_id !== A.id && r.addressee_id !== A.id);
  check(
    "A는 자기와 무관한 크루요청을 못 본다",
    leaked.length === 0,
    `${leaked.length}건 노출 (전체 ${all.length})`,
  );
}

// ── 5. 챌린지 ───────────────────────────────────────────────────────────
console.log("[5] 챌린지");
if (otherChallenge) {
  for (const fn of [
    "start_challenge",
    "cancel_challenge",
    "finalize_challenge",
    "approve_challenge_goals",
    "unapprove_challenge_goals",
    "issue_challenge_invite_code",
  ]) {
    const x = await rpc(A.token, fn, { p_challenge_id: otherChallenge.id });
    check(`A가 남의 챌린지에 ${fn}을 못 건다`, rejected(x), `status=${x.status} ${x.raw}`);
  }
  const inv = await rpc(A.token, "invite_to_challenge", {
    p_challenge_id: otherChallenge.id,
    p_target_id: B.id,
  });
  check("A가 남의 챌린지에 B를 초대하지 못한다", rejected(inv), `status=${inv.status} ${inv.raw}`);
}
{
  const x = await rpc(A.token, "join_challenge_as_newcomer", { p_code: "ZZZZZZZZ", p_inviter: B.id });
  check("A가 위조 코드+타인 inviter로 챌린지에 못 들어간다", rejected(x), `status=${x.status} ${x.raw}`);
}

// ── 6. 알림 ─────────────────────────────────────────────────────────────
console.log("[6] 알림");
{
  const seen = await asUser(A.token, `notifications?select=id,user_id&user_id=eq.${B.id}&limit=5`);
  check("A는 B의 알림을 못 읽는다", rejected(seen) || rowsOf(seen) === 0, `status=${seen.status} rows=${rowsOf(seen)}`);

  if (bNotif) {
    const r = await asUser(A.token, `notifications?id=eq.${bNotif.id}`, "PATCH", {
      read_at: bNotif.read_at,
    });
    check("A는 B의 알림을 못 바꾼다", rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)} ${r.raw}`);
  }
  const n = await rpc(A.token, "notify", {
    p_user_id: B.id,
    p_actor_id: A.id,
    p_title: "x",
    p_body: "x",
    p_type: "x",
    p_reference_id: RANDOM_UUID,
  });
  check("A가 notify로 B에게 알림을 위조하지 못한다", rejected(n), `status=${n.status} ${n.raw}`);

  const pk = await rpc(A.token, "notify_challenge_peek_unlock", { p_user_id: B.id });
  check(
    "A가 notify_challenge_peek_unlock으로 B에게 알림을 못 건다",
    rejected(pk),
    `status=${pk.status} ${pk.raw}`,
  );
}

// ── 7. 응원·댓글·리액션 ─────────────────────────────────────────────────
console.log("[7] 응원·댓글·리액션");
{
  const c = await asUser(
    A.token,
    "cheers",
    "POST",
    {
      sender_id: B.id,
      receiver_id: A.id,
      session_id: bSession?.id ?? RANDOM_UUID,
      cheer_type: "clap",
    },
    "return=minimal",
  );
  check("A가 B 이름으로 응원을 못 넣는다", rejected(c), `status=${c.status} ${c.raw}`);

  const rx = await asUser(
    A.token,
    "reactions",
    "POST",
    { user_id: B.id, session_id: bSession?.id ?? RANDOM_UUID, reaction_type: "like" },
    "return=minimal",
  );
  check("A가 B 이름으로 리액션을 못 넣는다", rejected(rx), `status=${rx.status} ${rx.raw}`);

  const ed = await rpc(A.token, "edit_session_comment", { p_comment_id: RANDOM_UUID, p_body: "x" });
  check("A가 남의 댓글을 못 고친다", rejected(ed), `status=${ed.status} ${ed.raw}`);
}

// ── 8. analytics_events ─────────────────────────────────────────────────
console.log("[8] analytics_events");
{
  const e = await asUser(
    A.token,
    "analytics_events",
    "POST",
    { user_id: B.id, event_name: "funnel_signup" },
    "return=minimal",
  );
  check("A가 B 이름으로 퍼널 이벤트를 못 위조한다", rejected(e), `status=${e.status} ${e.raw}`);

  const r = await asUser(A.token, "analytics_events?select=id&limit=1", "GET");
  check("A는 analytics_events를 못 읽는다", rejected(r) || rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)}`);
}

// ── 9. 포인트·XP ────────────────────────────────────────────────────────
console.log("[9] 포인트·XP");
{
  const ap = await rpc(A.token, "award_points", {
    p_user_id: A.id,
    p_amount: 999,
    p_reason: "x",
    p_source_type: "x",
    p_source_id: RANDOM_UUID,
    p_multiplier: 1,
    p_metadata: {},
  });
  check("A가 award_points로 포인트를 못 만든다", rejected(ap), `status=${ap.status} ${ap.raw}`);

  const xp = await rpc(A.token, "apply_xp_and_progress", {
    p_user_id: A.id,
    p_amount: 999,
    p_reason: "x",
    p_reward_group: "x",
    p_source_type: "x",
    p_source_id: "x",
    p_effective_date: "2026-09-01",
    p_metadata: {},
  });
  check("A가 apply_xp_and_progress로 XP를 못 만든다", rejected(xp), `status=${xp.status} ${xp.raw}`);

  const pt = await asUser(
    A.token,
    "point_transactions",
    "POST",
    { user_id: A.id, amount: 999, transaction_type: "earn", reason: "x" },
    "return=minimal",
  );
  check("A가 point_transactions에 직접 못 넣는다", rejected(pt), `status=${pt.status} ${pt.raw}`);

  for (const t of ["point_transactions", "xp_transactions", "user_wallet", "user_progress"]) {
    const r = await asUser(A.token, `${t}?select=user_id&user_id=eq.${B.id}&limit=5`, "GET");
    check(`A는 B의 ${t}를 못 읽는다`, rejected(r) || rowsOf(r) === 0, `status=${r.status} rows=${rowsOf(r)}`);
  }
}

// ── 10. RPC 인자 우회 (남의 id를 인자로 넣는다) ─────────────────────────
console.log("[10] RPC 인자 우회");
{
  const st = await rpc(A.token, "current_streak_days", { p_user_id: B.id });
  check("A가 current_streak_days로 B의 스트릭을 못 읽는다", rejected(st), `status=${st.status} 값=${st.raw}`);

  const bm = await rpc(A.token, "badge_metrics", { p_user_id: B.id });
  check("A가 badge_metrics로 B의 지표를 못 읽는다", rejected(bm), `status=${bm.status} ${bm.raw}`);

  const eb = await rpc(A.token, "evaluate_badges", { p_user_id: B.id });
  check("A가 evaluate_badges를 B에게 못 돌린다", rejected(eb), `status=${eb.status} ${eb.raw}`);

  const ib = await rpc(A.token, "is_blocked_between", {
    p_a: B.id,
    p_b: strangers[0]?.id ?? RANDOM_UUID,
  });
  check("A가 남 둘의 차단 관계를 못 캔다", rejected(ib), `status=${ib.status} 값=${ib.raw}`);
}

// ── 11. 크루 스트릭 — 뒷문은 닫히고 기능은 살아 있는가 ──────────────────
//
// ⚠️⚠️ **이 절의 목적은 "숨기는 것"이 아니다.** 크루끼리 서로의 스트릭을 보는 것은
//    GND의 핵심 기능이고 절대 없애면 안 된다 (사용자 지시 2026-09-02).
//    0096 STEP 1이 닫은 것은 **관계 검사를 우회하는 직접 RPC 경로** 하나뿐이다:
//
//      authenticated A → current_streak_days(p_user_id = 아무 B) → 관계가 없어도 값 반환
//
//    화면이 그리는 스트릭은 이 RPC를 **한 번도 부르지 않는다.** 홈 크루 카드와
//    MemberProfileSheet의 `🔥 연속 N일`은 RLS가 허용한 B의 workout_sessions 행을
//    받아 src/lib/domain/streak.ts 의 currentStreak()로 **앱에서 계산**한다
//    (friend-board.ts:132). `grep -rn current_streak_days src/` → 0건.
//
//    그래서 여기서는 **양방향**을 단언한다. 막힌 것만 세면 기능을 죽여도 초록이다.
console.log("[11] 크루 스트릭 — 기능 보존 + 뒷문 차단");
{
  // A의 크루가 정말 누구인지 service_role로 먼저 확정한다(픽스처가 바뀌어도 안 흔들리게).
  const links = await svcGet(
    `crew_links?select=user_a,user_b&or=(user_a.eq.${A.id},user_b.eq.${A.id})`,
  );
  const crewOfA = new Set(links.map((l) => (l.user_a === A.id ? l.user_b : l.user_a)));
  check("픽스처 전제 — A와 B는 크루다", crewOfA.has(B.id), `A의 크루 ${crewOfA.size}명`);

  // 비크루이면서 완료 세션이 있는 사람. 없으면 아래 경계 단언이 무의미해진다.
  let outsider = null;
  for (const s of strangers) {
    if (crewOfA.has(s.id)) continue;
    const done = await svcGet(
      `workout_sessions?select=id&user_id=eq.${s.id}&status=eq.completed&limit=1`,
    );
    if (done.length) {
      outsider = s.id;
      break;
    }
  }
  check("픽스처 전제 — 완료 기록이 있는 비크루가 있다", outsider !== null, `outsider=${outsider}`);

  // ① 기능 보존 — 크루의 스트릭 재료가 온전한가.
  //    ⚠️ "0이어야 한다"가 아니라 **"service_role이 보는 수와 같아야 한다"** 로 단언한다.
  //    0으로 두면 RLS가 통째로 막혀도 통과한다 (CLAUDE.md §테스트가 진짜 테스트인지).
  // ⚠️ **정책과 똑같은 조건으로 진실값을 만든다.** 처음엔 status=completed만 걸었다가
  //    19/21로 빨개졌는데, 원인은 회귀가 아니라 B의 세션 2개가 **소프트 삭제**된 것이었다
  //    (sessions_select_own_or_crew = visibility='group' AND status='completed'
  //     AND deleted_at IS NULL AND is_crew_with). 진실값이 정책보다 느슨하면
  //    "정상 동작"을 고장으로 신고한다 — CLAUDE.md §회귀 스크립트를 고칠 때.
  const truthRows = await svcGet(
    `workout_sessions?select=id&user_id=eq.${B.id}&status=eq.completed` +
      `&visibility=eq.group&deleted_at=is.null`,
  );
  const seenByA = await asUser(
    A.token,
    `workout_sessions?select=id&user_id=eq.${B.id}&status=eq.completed`,
    "GET",
  );
  check(
    "크루 A는 B의 완료 세션을 전부 본다 (홈 크루 카드·프로필 🔥 연속 N일의 재료)",
    truthRows.length > 0 && rowsOf(seenByA) === truthRows.length,
    `A가 본 것 ${rowsOf(seenByA)} / 실제 ${truthRows.length} — 어긋나면 스트릭이 화면에서 줄거나 사라진다`,
  );

  // 덤 — 삭제한 기록은 크루에게도 안 보여야 한다(위 19/21의 나머지 2개).
  const deletedRows = await svcGet(
    `workout_sessions?select=id&user_id=eq.${B.id}&deleted_at=not.is.null&limit=5`,
  );
  if (deletedRows.length) {
    const peekDeleted = await asUser(
      A.token,
      `workout_sessions?select=id&id=eq.${deletedRows[0].id}`,
      "GET",
    );
    check(
      "크루라도 B가 삭제한 기록은 못 본다",
      rejected(peekDeleted) || rowsOf(peekDeleted) === 0,
      `status=${peekDeleted.status} rows=${rowsOf(peekDeleted)}`,
    );
  }

  // ② 내부 경로 생존 — SECURITY DEFINER 안에서의 호출은 그대로여야 한다.
  //    badge_metrics · complete_workout_v2 가 이걸 부른다 = 배지·XP·운동 완료가 여기 걸려 있다.
  const svcStreak = await rpc(SVC, "current_streak_days", { p_user_id: B.id });
  check(
    "내부 경로 생존 — service_role은 current_streak_days를 여전히 부른다 (배지·XP·운동완료)",
    svcStreak.ok && svcStreak.raw !== "" && svcStreak.raw !== "null",
    `status=${svcStreak.status} 값=${svcStreak.raw}`,
  );

  // ③ 뒷문 차단 — 크루여도 직접 RPC는 막힌다. 회수가 롤 단위라 비크루는 자동 포함이다.
  const backdoorCrew = await rpc(A.token, "current_streak_days", { p_user_id: B.id });
  check(
    "뒷문 차단 — 크루인 A조차 current_streak_days를 직접 못 부른다",
    rejected(backdoorCrew),
    `status=${backdoorCrew.status} ${backdoorCrew.raw}`,
  );

  const backdoorOutsider = await rpc(A.token, "current_streak_days", {
    p_user_id: outsider ?? RANDOM_UUID,
  });
  check(
    "뒷문 차단 — 비크루의 스트릭도 직접 못 부른다",
    rejected(backdoorOutsider),
    `status=${backdoorOutsider.status} ${backdoorOutsider.raw}`,
  );

  // ④ 경계 — 비크루의 운동 데이터는 애초에 안 보인다(앱 계산 경로로도 스트릭이 안 새어야 한다).
  if (outsider) {
    const peek = await asUser(
      A.token,
      `workout_sessions?select=id&user_id=eq.${outsider}&limit=5`,
      "GET",
    );
    check(
      "경계 — A는 비크루의 운동 세션을 못 읽는다",
      rejected(peek) || rowsOf(peek) === 0,
      `status=${peek.status} rows=${rowsOf(peek)}`,
    );
  }
}

console.log(`\n${pass} 통과 / ${fail} 실패`);
if (fail) {
  console.log("\n■ 열린 경로 (= 이번 감사의 발견):");
  for (const f of failures) console.log(`   · ${f}`);
  process.exitCode = 1;
}
