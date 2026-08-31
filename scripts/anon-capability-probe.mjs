/**
 * 익명 사용자가 **실제로 무엇을 할 수 있는지** 운영 DB에 대고 확인한다.
 *
 * 왜 필요한가: "익명을 막아야 한다"는 말은 쉽지만, 무엇이 이미 막혀 있고
 * 무엇이 열려 있는지는 **RPC를 직접 때려 봐야** 안다. UI 버튼이 숨겨져 있어도
 * RPC가 열려 있으면 뚫린 것이고, 반대로 이미 막혀 있는 것을 또 막으면
 * 쓸데없이 넓게 막는 것이다.
 *
 * 실행: node scripts/anon-capability-probe.mjs
 *
 * ⚠️ 익명 계정 2개(A·B)를 만들고 끝나면 지운다. 실사용자를 건드리지 않는다.
 * ⚠️ 이 스크립트는 **판정하지 않고 사실을 찍는다.** 무엇을 막을지는 사람이 정한다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function anonUser() {
  const r = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: "{}",
  }).then((x) => x.json());
  if (!r.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(r));
  return { token: r.access_token, refresh: r.refresh_token, id: r.user.id };
}

async function rpc(token, name, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  let body = "";
  try {
    body = (await res.text()).slice(0, 120);
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

/*
  ⚠️ `Prefer: return=representation`은 **SELECT 권한까지 요구한다.** INSERT만
     허용된 테이블(analytics_events)에 그걸 붙이면 42501이 나서 "INSERT가 막혔다"로
     오독하게 된다 — 2026-08-31에 이 프로브가 실제로 그렇게 잘못 읽었다.
     클라이언트(`analytics-events.ts`)는 `.insert()`만 쓰므로 minimal이 맞다.
*/
async function rest(token, path, method, payload, prefer = "return=representation") {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: res.status, body: (await res.text()).slice(0, 120) };
}

const rows = [];
function note(group, what, r) {
  // 2xx = 통과. 4xx 중 권한 거부(401/403/42501)는 막힌 것. 나머지는 인자·상태 문제.
  const ok = r.status >= 200 && r.status < 300;
  const denied =
    r.status === 401 ||
    r.status === 403 ||
    /42501|permission denied|row-level security/i.test(r.body);
  rows.push({
    group,
    what,
    verdict: ok ? "✅ 실행됨" : denied ? "🔒 막힘" : "⚠️ 다른오류",
    detail: `${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 72)}`,
  });
}

let A, B;

try {
  A = await anonUser();
  B = await anonUser();

  // 둘 다 프로필을 만든다 — 익명이지만 온보딩을 끝낸 상태를 재현한다.
  for (const [u, n] of [
    [A, `zzprobe-a-${A.id.slice(0, 5)}`],
    [B, `zzprobe-b-${B.id.slice(0, 5)}`],
  ]) {
    const r = await rest(u.token, "profiles", "POST", {
      id: u.id,
      nickname: n,
      avatar_url: "🦍",
      weekly_goal: 3,
    });
    if (u === A) note("반드시 되어야 함", "프로필 생성 (온보딩 완료)", r);
  }

  /* ── 익명에게 **계속 열려 있어야** 하는 것 ───────────────────────────────── */
  // start_workout은 이미 있는 세션 행을 '시작' 상태로 바꾼다 — 행을 먼저 만든다.
  const draft = await rest(A.token, "workout_sessions", "POST", {
    user_id: A.id,
    status: "draft",
  });
  note("반드시 되어야 함", "운동 세션 만들기 (draft)", draft);
  let sessionRow = null;
  try {
    sessionRow = JSON.parse(draft.body)[0]?.id ?? null;
  } catch {
    /* empty */
  }
  if (sessionRow) {
    note("반드시 되어야 함", "운동 시작 start_workout", await rpc(A.token, "start_workout", { p_session_id: sessionRow }));
    note("반드시 되어야 함", "운동 완료 complete_workout_v2", await rpc(A.token, "complete_workout_v2", { p_session_id: sessionRow }));
  }
  note(
    "반드시 되어야 함",
    "내 운동 계획 읽기 workout_plans",
    await rest(A.token, "workout_plans?select=id&limit=1", "GET"),
  );

  /* ── 사회적 mutation — 여기가 판단 대상이다 ─────────────────────────────── */
  note("사회적 mutation", "초대 코드 발행 issue_my_invite_code", await rpc(A.token, "issue_my_invite_code", {}));
  note("사회적 mutation", "크루 요청 send_crew_request", await rpc(A.token, "send_crew_request", { p_target_id: B.id }));
  note("사회적 mutation", "찌르기 poke_user", await rpc(A.token, "poke_user", { p_target_id: B.id }));
  note("사회적 mutation", "챌린지 방 생성 create_challenge_room", await rpc(A.token, "create_challenge_room", { p_name: "zzprobe", p_start_date: "2026-09-10", p_end_date: "2026-09-20" }));
  note("사회적 mutation", "닉네임 검색 search_profile_by_nickname", await rpc(A.token, "search_profile_by_nickname", { p_nickname: "zzprobe" }));
  note("사회적 mutation", "차단 block_user", await rpc(A.token, "block_user", { p_target_id: B.id }));
  note("사회적 mutation", "신고 report_user", await rpc(A.token, "report_user", { p_target_id: B.id, p_reason: "spam" }));
  note("사회적 mutation", "버그 신고 submit_bug_report", await rpc(A.token, "submit_bug_report", { p_message: "zzprobe" }));

  /* ── 초대로 들어오는 신규 흐름 — 절대 막으면 안 된다 ────────────────────── */
  note("초대 흐름 (막으면 안 됨)", "join_challenge_as_newcomer (잘못된 코드)", await rpc(B.token, "join_challenge_as_newcomer", { p_code: "GND-ZZZZZ" }));
  note("초대 흐름 (막으면 안 됨)", "accept_friend_invite (잘못된 코드)", await rpc(B.token, "accept_friend_invite", { p_code: "GND-ZZZZZ" }));

  /* ── 승격한 정식 계정은 다시 되어야 한다 (0094가 정식을 막으면 안 된다) ── */
  {
    // A를 서버에서 승격시키고 토큰을 갱신한다 — 카카오 연결 뒤와 같은 상태다.
    await admin.auth.admin.updateUserById(A.id, {
      email: `zzprobe-${A.id.slice(0, 8)}@example.com`,
      email_confirm: true,
    });
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: A.refresh }),
    }).then((x) => x.json());

    if (!r.access_token) {
      note("승격 후 (되어야 함)", "토큰 갱신", { status: 500, body: JSON.stringify(r).slice(0, 100) });
    } else {
      const cl = JSON.parse(Buffer.from(r.access_token.split(".")[1], "base64url").toString());
      note("승격 후 (되어야 함)", `갱신 토큰 is_anonymous=${cl.is_anonymous}`, { status: cl.is_anonymous === false ? 200 : 500, body: "" });
      note("승격 후 (되어야 함)", "초대 코드 발행", await rpc(r.access_token, "issue_my_invite_code", {}));
      note("승격 후 (되어야 함)", "크루 요청", await rpc(r.access_token, "send_crew_request", { p_target_id: B.id }));
      note("승격 후 (되어야 함)", "챌린지 방 생성", await rpc(r.access_token, "create_challenge_room", { p_name: "zzprobe2", p_start_date: "2026-09-10", p_end_date: "2026-09-20" }));
    }
  }

  /* ── 계측 (배포 D) — 익명이 써야 성립한다 ──────────────────────────────── */
  note("계측 (익명 허용 필요)", "analytics_events INSERT (자기 것)", await rest(A.token, "analytics_events", "POST", { user_id: A.id, event_name: "onboarding_started" }, "return=minimal"));
  note("계측 (익명 허용 필요)", "⚠️ analytics_events INSERT (남의 것)", await rest(A.token, "analytics_events", "POST", { user_id: B.id, event_name: "onboarding_started" }, "return=minimal"));
  note("계측 (익명 허용 필요)", "⚠️ analytics_events SELECT", await rest(A.token, "analytics_events?select=id&limit=1", "GET"));
} finally {
  for (const u of [A, B].filter(Boolean)) {
    for (const t of ["analytics_events", "crew_links", "bug_reports", "workout_sessions", "challenges", "profiles"]) {
      await admin.from(t).delete().or(t === "crew_links" ? `user_a.eq.${u.id},user_b.eq.${u.id}` : `user_id.eq.${u.id},id.eq.${u.id}`).then(() => {}, () => {});
    }
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }

  let group = "";
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n[${group}]`);
    }
    console.log(`  ${r.verdict}  ${r.what}`);
    console.log(`            ${r.detail}`);
  }
  console.log(`\n${"─".repeat(60)}`);
  console.log("판정하지 않고 사실만 찍었다. 무엇을 막을지는 사람이 정한다.");
}
