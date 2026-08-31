// 0041 검증: 응원 포인트 — 하루 1회 상한·예외 격리·반환값·회귀.
// 실행: node scripts/cheer-points-check.mjs
// 사전조건: 0041이 적용되어 있어야 한다.
//
// 쿨다운(10초)은 기다리지 않고 service_role로 cheers.created_at을 과거로
// 당겨 통과시킨다. 기다리면 실행이 1분을 넘고, 그건 검증이 아니라 대기다.
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

const hasCode = (r, code) =>
  r.status >= 400 && JSON.stringify(r.json ?? {}).includes(code);

// 삭제는 가드를 통해서만 한다 (_safe-delete.mjs). 실행 시작 시점에 있던
// 계정은 무슨 일이 있어도 지우지 않는다 — 프로덕션에 붙어 도는 스크립트다.
const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });

async function anonUser(tag) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  }
  // 0094: 익명은 크루 요청·초대 발행·챌린지 생성이 막힌다. 실사용자는 온보딩에서
  //       카카오·구글을 먼저 거치므로 **정식 계정이 정상 상태**다.
  json.access_token = await makePermanent(json);
  const user = {
    id: json.user.id,
    token: json.access_token,
    nickname: `치어${RUN}${tag}`,
  };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: user.nickname,
    avatar_url: "📣",
    weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  guard.register(user.id);
  return user;
}

/** 두 사람을 상호 크루로 만든다 (0038 RPC). */
async function linkCrew(from, to) {
  await rpc(from.token, "send_crew_request", { p_target_id: to.id });
  const inbox = await rpc(to.token, "get_incoming_crew_requests", {});
  const req = (inbox.json ?? [])[0];
  if (!req) throw new Error(`크루 요청이 받은함에 없음: ${JSON.stringify(inbox.json)}`);
  await rpc(to.token, "accept_crew_request", { p_request_id: req.request_id });
}

/**
 * 진행 중(active) 세션을 만들고 id를 돌려준다.
 *
 * ⚠ 유저당 동시 active 세션은 1개다(workout_sessions_one_active). 이 함수를
 *   같은 사람에게 연속으로 부르기 전에 반드시 finish()로 이전 세션을 닫는다.
 */
async function activeSession(owner) {
  const created = await api(owner.token, "POST", "/rest/v1/workout_sessions", {
    user_id: owner.id,
    visibility: "group",
    timezone: "Asia/Seoul",
  });
  const id = created.json?.[0]?.id;
  if (!id) throw new Error(`세션 생성 실패: ${JSON.stringify(created.json)}`);
  const started = await rpc(owner.token, "start_workout", { p_session_id: id });
  if (started.status >= 400) {
    throw new Error(`start_workout 실패(이전 세션이 열려 있나?): ${JSON.stringify(started.json)}`);
  }
  return id;
}

/**
 * 세션을 완료한다. withWork=true면 운동·완료 세트를 먼저 넣어 XP가 나오게 한다
 * (XP 0이면 포인트도 0이라 workout_completed 원장이 안 생긴다).
 *
 * ⚠ is_valid_workout(0024:35-42)은 weight/bodyweight 종목에서 완료 세트
 *   3개 이상을 요구한다(v_completed_sets >= 3). 1개만 넣으면 v_valid=false가
 *   되어 XP·포인트가 모두 0으로 조용히 죽는다 — 세트는 반드시 3개.
 */
async function finish(owner, sessionId, withWork = false) {
  if (withWork) {
    const ex = await api(owner.token, "POST", "/rest/v1/workout_exercises", {
      session_id: sessionId,
      exercise_name: "벤치프레스",
      exercise_type: "weight",
      sort_order: 0,
    });
    const exerciseId = ex.json?.[0]?.id;
    for (let setNumber = 1; setNumber <= 3; setNumber++) {
      await api(owner.token, "POST", "/rest/v1/workout_sets", {
        workout_exercise_id: exerciseId,
        set_number: setNumber,
        weight_kg: 50,
        reps: 10,
        is_completed: true,
      });
    }
  }
  // 포인트를 주는 것은 v2다. 구버전 complete_workout은 원장을 남기지 않는다.
  return rpc(owner.token, "complete_workout_v2", { p_session_id: sessionId });
}

/**
 * 쿨다운 회피 — 이 발신자의 응원 행을 전부 1분 전으로 당긴다.
 *
 * 쿨다운과 세션당 3회 상한은 둘 다 (session_id, sender_id)로 세므로, 세션이
 * 바뀌면 원래 초기화된다. 즉 같은 세션에 다시 응원할 때만 이게 필요하다.
 * 새 세션 앞에서 불러도 무해하니 방어적으로 둔다.
 */
async function rewindCheers(senderId) {
  const past = new Date(Date.now() - 60_000).toISOString();
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/cheers?sender_id=eq.${senderId}`,
    { created_at: past },
    "return=minimal",
  );
}

/** 지갑 잔액 (행이 없으면 0). */
async function balanceOf(user) {
  const r = await api(user.token, "GET", "/rest/v1/user_wallet?select=balance");
  return r.json?.[0]?.balance ?? 0;
}

/**
 * SQL의 (now() at time zone 'Asia/Seoul')::date와 같은 값을 돌려준다.
 * Asia/Seoul은 DST가 없어 항상 UTC+9로 고정이라 이렇게 계산해도 안전하다.
 */
function kstDay(offsetMs = 0) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetMs)
    .toISOString()
    .slice(0, 10);
}
const kstToday = () => kstDay();
const kstYesterday = () => kstDay(-86_400_000);

try {
  // 계정 등록은 anonUser()가 생성 직후 guard.register()로 한다. 여기서 배열에
  // 따로 모으지 않는 이유는 장부가 둘이 되면 갈라지기 때문이다 — 중간에
  // anonUser()가 실패해도 그때까지 만들어진 계정은 이미 가드에 등록돼 있다.
  const a = await anonUser("a"); // 세션 주인 (응원 받는 사람)
  const b = await anonUser("b"); // 응원 보내는 사람
  const c = await anonUser("c"); // 두 번째 대상
  const d = await anonUser("d"); // 비크루
  const e = await anonUser("e"); // [17] 전용 — 아직 한 번도 응원받지 않은 상대

  await linkCrew(b, a);
  await linkCrew(b, c);
  await linkCrew(b, e);

  // ── 1회차 세션: 지급·쿨다운·재응원 ──
  const sA = await activeSession(a);

  const before = await balanceOf(b);
  let r = await rpc(b.token, "send_cheer", {
    p_session_id: sA,
    p_cheer_type: "fire",
  });
  check("[1] 크루 세션 응원 성공", r.status === 200, JSON.stringify(r.json));
  check(
    "[13] 첫 응원 반환값 points_awarded=10",
    r.json?.points_awarded === 10,
    JSON.stringify(r.json),
  );
  check(
    "[1b] 지갑 +10P",
    (await balanceOf(b)) === before + 10,
    `${before} → ${await balanceOf(b)}`,
  );
  check(
    "[21a] 반환값에 cheer 객체가 들어 있다",
    r.json?.cheer?.cheer_type === "fire",
    JSON.stringify(r.json?.cheer),
  );

  // ── 쿨다운 (회귀) ──
  r = await rpc(b.token, "send_cheer", { p_session_id: sA, p_cheer_type: "clap" });
  check("[6] 10초 이내 재응원은 cheer_cooldown", hasCode(r, "cheer_cooldown"));

  // ── 같은 날 같은 상대 재응원 → 응원은 성공, 지급 0 ──
  await rewindCheers(b.id);
  const mid = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA, p_cheer_type: "clap" });
  check("[2] 쿨다운 후 같은 날 재응원 성공", r.status === 200, JSON.stringify(r.json));
  check("[14] 재응원 points_awarded=0", r.json?.points_awarded === 0, JSON.stringify(r.json));
  check("[2b] 지갑 변화 없음", (await balanceOf(b)) === mid, `${mid} → ${await balanceOf(b)}`);
  check("[3] 두 번째 응원도 cheers 행 생성", Boolean(r.json?.cheer?.id));

  const notif = await api(
    a.token,
    "GET",
    "/rest/v1/notifications?type=eq.cheer_received&select=id",
  );
  check("[15] 지급 0이어도 알림은 생성", (notif.json ?? []).length === 2, `${notif.json?.length}건`);

  // ⚠ 다음 세션을 열기 전에 반드시 닫는다 (active 1개 제약).
  //    withWork=true — [11]에서 볼 workout_completed 원장을 여기서 만든다.
  await finish(a, sA, true);

  // ── 2회차 세션: 같은 상대의 다른 세션도 당일 1회만 ──
  const sA2 = await activeSession(a);
  await rewindCheers(b.id);
  const beforeS2 = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA2, p_cheer_type: "fire" });
  check(
    "[19] 같은 상대의 다른 세션도 당일 1회만 지급",
    r.status === 200 && r.json?.points_awarded === 0 && (await balanceOf(b)) === beforeS2,
    JSON.stringify(r.json),
  );
  await finish(a, sA2);

  // ── 다른 상대에게는 지급 ──
  const sC = await activeSession(c);
  await rewindCheers(b.id);
  const beforeC = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sC, p_cheer_type: "fire" });
  check(
    "[4][20] 다른 상대에게는 각각 10P",
    r.json?.points_awarded === 10 && (await balanceOf(b)) === beforeC + 10,
    JSON.stringify(r.json),
  );
  await finish(c, sC);

  // ── 원장 확인 ──
  const ledger = await api(
    b.token,
    "GET",
    "/rest/v1/point_transactions?reason=eq.cheer_sent&select=amount,source_type,source_id",
  );
  check("[10] cheer_sent 원장 2건", (ledger.json ?? []).length === 2, JSON.stringify(ledger.json));
  check(
    "[10b] source_id는 받는사람:KST날짜",
    (ledger.json ?? []).every((t) => /^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/.test(t.source_id)),
    JSON.stringify(ledger.json),
  );

  // ── 동시 호출해도 당일 중복 지급 없음 ──
  // 같은 사용자의 두 기기를 흉내 내려면 토큰이 둘이어야 하지만, 검증 대상은
  // 토큰이 아니라 원장의 유니크 인덱스다. 같은 토큰으로 병렬 호출해도 두 요청은
  // 서로 다른 트랜잭션이라 경쟁 조건은 동일하게 재현된다.
  //
  // ⚠ 상대는 반드시 **아직 한 번도 응원받지 않은** e여야 한다. 이미 지급된
  //   상대(c)를 쓰면 두 호출 다 "이미 지급됨" 경로로 빠져서 경쟁 자체가
  //   일어나지 않고, 합계 0이 보장돼 [14]·[19]와 같은 것만 또 본다. 더 나쁜 건
  //   그 형태면 **RPC가 통째로 깨져 둘 다 4xx여도 합계가 0이라 PASS**한다는
  //   점이다 — 마이그레이션 판정 게이트가 판정을 포기하는 셈이다.
  //   합계를 10으로 기대해야 "정확히 한 번 지급"을 보고, 고장은 0 ≠ 10으로 잡힌다.
  const sE = await activeSession(e);
  const beforeRace = await balanceOf(b);
  const [r1, r2] = await Promise.all([
    rpc(b.token, "send_cheer", { p_session_id: sE, p_cheer_type: "fire" }),
    rpc(b.token, "send_cheer", { p_session_id: sE, p_cheer_type: "clap" }),
  ]);
  // 느린 쪽이 유니크 인덱스가 아니라 10초 쿨다운에 걸려도 결과는 같다 — 어느
  // 경로든 정확히 10P만 움직여야 한다.
  const total =
    (r1.json?.points_awarded ?? 0) + (r2.json?.points_awarded ?? 0);
  check(
    "[17] 동시 호출해도 정확히 한 번만 지급",
    total === 10 && (await balanceOf(b)) === beforeRace + 10,
    `total=${total} ${JSON.stringify([r1.json, r2.json])}`,
  );
  await finish(e, sE);

  // ── 회귀: 세션당 3회 상한 ──
  const sA3 = await activeSession(a);
  for (let i = 0; i < 3; i++) {
    await rewindCheers(b.id);
    await rpc(b.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  }
  await rewindCheers(b.id);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[5] 세션당 3회 상한 (cheer_limit)", hasCode(r, "cheer_limit"));

  // ── 회귀: 권한·상태 (예외 격리가 이것들을 삼키면 안 된다) ──
  r = await rpc(a.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[7] 본인 세션은 own_session", hasCode(r, "own_session"));

  r = await rpc(d.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[8] 비크루는 session_not_found", hasCode(r, "session_not_found"));

  await finish(a, sA3);
  // ⚠ 계획서 원안은 c.token을 썼지만 c는 a와 크루가 아니다(b만 a와 링크됨).
  //   그러면 is_crew_with 관문에서 session_not_found로 먼저 걸려 not_active
  //   분기에 도달하지 못한다. status 검사는 crew 검사 다음이므로, a와 실제로
  //   크루인 b로 보내야 not_active를 제대로 겨냥한다. status 검사가 카운트
  //   검사보다 먼저이므로 b가 이미 이 세션에서 상한(3회)에 도달했어도 무해하다.
  await rewindCheers(b.id);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA3, p_cheer_type: "fire" });
  check("[9] 완료된 세션은 not_active", hasCode(r, "not_active"), JSON.stringify(r.json));

  // ── 회귀: 기존 workout_completed 지급이 CHECK 변경 후에도 동작 ──
  // 위 finish(a, sA, true)가 운동·완료 세트를 넣고 complete_workout_v2를 불렀다.
  const wc = await api(
    a.token,
    "GET",
    "/rest/v1/point_transactions?reason=eq.workout_completed&select=amount",
  );
  check(
    "[11] workout_completed 지급 정상 (CHECK 변경 무해)",
    wc.status === 200 && (wc.json ?? []).length >= 1,
    JSON.stringify(wc.json),
  );

  // ── KST 날짜 경계 ──
  // 어제 날짜로 원장을 옮겨 두면 오늘 다시 지급돼야 한다.
  //
  // ⚠ 이 시점에 b는 cheer_sent 행을 2건 갖고 있다(a 앞, c 앞). source_id까지
  //   필터에 넣지 않으면 이 PATCH가 둘 다 건드려 c 앞 원장도 함께 어제
  //   날짜로 밀려난다 — 지금은 그 값을 아무도 다시 읽지 않아 무해하지만,
  //   순서가 바뀌면 조용히 깨진다. a 앞으로 만든 행 하나만 정확히 겨냥한다.
  // 두 날짜 모두 KST 기준으로 뽑는다. 하나만 UTC로 뽑아도 33시간 차라 판정이
  // 틀리진 않지만, 날짜 정확성이 주제인 검증에서 기준이 섞여 있으면 읽는 사람이
  // 매번 다시 확인하게 된다.
  const yesterday = kstYesterday();
  const todayForA = `${a.id}:${kstToday()}`;
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/point_transactions?user_id=eq.${b.id}&reason=eq.cheer_sent&source_id=eq.${todayForA}`,
    { source_id: `${a.id}:${yesterday}` },
    "return=minimal",
  );
  const sA4 = await activeSession(a);
  await rewindCheers(b.id);
  const beforeDay = await balanceOf(b);
  r = await rpc(b.token, "send_cheer", { p_session_id: sA4, p_cheer_type: "fire" });
  check(
    "[12][18] 날짜가 바뀌면 같은 상대에게 다시 10P",
    r.json?.points_awarded === 10 && (await balanceOf(b)) === beforeDay + 10,
    JSON.stringify(r.json),
  );
  await finish(a, sA4);

  // ── [16] 지급 강제 실패는 자동화하지 않는다 ──
  // 공용 테이블에 제약을 넣었다 빼는 것은 다른 세션이 동시에 돌 때 실서비스를
  // 망가뜨린다. Task 4 Step 4의 수동 절차로 확인한다.
  console.log("\n  ⚠ [16] 예외 격리(지급 실패해도 응원 유지)는 이 스크립트가 검증하지 않는다.");
  console.log("     계획서 Task 4 Step 4의 수동 절차를 반드시 수행할 것.");
} finally {
  // ⚠ 정리만 한다. try에서 던진 예외가 있으면 이 finally를 통과한 뒤
  //   그대로 다시 던져져야 한다 — 여기서 process.exit()을 부르면 그 예외가
  //   조용히 삼켜지고(스택트레이스도 메시지도 없이) failed===0인 채 exit 0으로
  //   끝난다. 이 스크립트는 0041이 제대로 적용됐는지 판정하는 게이트이므로
  //   "마이그레이션 미적용"이나 "엔드포인트 다운"이 "정상"으로 보이면 안 된다.
  await guard.cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
