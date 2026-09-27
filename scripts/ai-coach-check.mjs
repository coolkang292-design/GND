// AI 코치 V1 (0112) 경계 검증 — 익명→정식 픽스처 A·B로 RLS·권한·라우트를 본다.
//
// 실행:
//   node scripts/ai-coach-check.mjs                        # DB 계층만 (0112 적용 후)
//   node scripts/ai-coach-check.mjs --route http://localhost:3000   # + 라우트 (pnpm dev 켠 상태)
//
// ⚠️ 운영 DB에 픽스처 계정 2개를 만들고 **끝나면 지운다**(_safe-delete 가드).
// ⚠️ --route는 A의 세션으로 AI를 **최대 1회** 부른다. OPENROUTER_API_KEY(또는 DEEPSEEK_API_KEY)가 없으면
//    not_configured 실패로 끝나고, 그것도 "중복 호출 방지" 검증에는 충분하다.
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
if (!URL_ || !KEY || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

const routeIndex = process.argv.indexOf("--route");
const ROUTE_BASE = routeIndex > 0 ? process.argv[routeIndex + 1] : null;

// ⚠ 첫 가입보다 **앞에서** 만든다 — 뒤에서 만들면 이 실행의 픽스처가 "기존 계정"으로 잡힌다
const _guard = await createDeleteGuard({ url: URL_, serviceKey: SERVICE });

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(token, method, path, body, apikey = KEY, prefer = "return=representation") {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}
const admin = (method, path, body) => api(SERVICE, method, path, body, SERVICE);
const rows = (r) => (Array.isArray(r.json) ? r.json : []);

async function user() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("가입 실패: " + JSON.stringify(json));
  json.access_token = await makePermanent(json);
  // 실사용자는 온보딩에서 프로필이 생긴다. 없으면 start_workout이 workout_events FK(→profiles)에서 409로 죽는다
  const profile = await api(json.access_token, "POST", "/rest/v1/profiles", {
    id: json.user.id,
    nickname: `aic-${Math.random().toString(36).slice(2, 8)}`,
    weekly_goal: 3,
  });
  if (profile.status !== 201) throw new Error("프로필 생성 실패: " + JSON.stringify(profile.json));
  return { token: json.access_token, id: json.user.id };
}

/** 완료된 세션 하나 — 세트 3개, 기기 완료 시각 포함 */
async function completedSession(u) {
  const draft = await api(u.token, "POST", "/rest/v1/workout_sessions", {
    user_id: u.id,
    timezone: "Asia/Seoul",
  });
  const session = draft.json?.[0];
  const start = await api(u.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session.id });
  const ex = await api(u.token, "POST", "/rest/v1/workout_exercises", {
    session_id: session.id,
    exercise_name: "벤치프레스",
    exercise_type: "weight",
    sort_order: 0,
  });
  const t0 = Date.now() - 10 * 60_000;
  const sets = await api(
    u.token,
    "POST",
    "/rest/v1/workout_sets",
    [0, 1, 2].map((i) => ({
      workout_exercise_id: ex.json[0].id,
      set_number: i + 1,
      weight_kg: 60,
      reps: 10,
      is_completed: true,
      client_completed_at: new Date(t0 + i * 120_000).toISOString(),
    })),
  );
  const done = await api(u.token, "POST", "/rest/v1/rpc/complete_workout_v2", {
    p_session_id: session.id,
    p_paused_seconds: 0,
  });
  return {
    id: session.id,
    setsStatus: sets.status,
    setsJson: sets.json,
    doneStatus: done.status,
    doneJson: done.json,
    start: [start.status, start.json?.status ?? start.json],
  };
}

let A;
let B;
try {
  console.log("── 픽스처: 정식 계정 A, B ──");
  A = await user();
  B = await user();

  console.log("\n── ① 세트 기기 완료 시각 (client_completed_at) ──");
  const sA = await completedSession(A);
  const sB = await completedSession(B);
  check("A가 client_completed_at 포함 세트 저장 (컬럼 grant)", sA.setsStatus === 201, JSON.stringify(sA.setsJson));
  const savedSets = rows(await api(A.token, "GET", `/rest/v1/workout_sets?select=client_completed_at,workout_exercises!inner(session_id)&workout_exercises.session_id=eq.${sA.id}`));
  check(
    "저장된 값이 그대로 남는다 (서버 completed_at과 별개)",
    savedSets.length === 3 && savedSets.every((r) => r.client_completed_at),
    JSON.stringify(savedSets),
  );
  check(
    "complete_workout_v2 정상 (AI와 무관)",
    sA.doneStatus === 200 && sB.doneStatus === 200,
    JSON.stringify({ A: [sA.start, sA.doneStatus, sA.doneJson], B: [sB.start, sB.doneStatus, sB.doneJson] }),
  );

  console.log("\n── ② training_profiles ──");
  const profile = {
    user_id: A.id,
    primary_goal: "hypertrophy",
    experience_level: "beginner",
    sessions_per_week: 3,
    session_minutes: 45,
    training_location: "gym",
    priority_body_parts: ["어깨"],
  };
  const pIns = await api(A.token, "POST", "/rest/v1/training_profiles", profile);
  check("A가 자기 프로필 저장", pIns.status === 201, JSON.stringify(pIns.json));
  check(
    "A가 자기 프로필 조회",
    rows(await api(A.token, "GET", `/rest/v1/training_profiles?user_id=eq.${A.id}`)).length === 1,
  );
  check(
    "B는 A 프로필 조회 0행",
    rows(await api(B.token, "GET", `/rest/v1/training_profiles?user_id=eq.${A.id}`)).length === 0,
  );
  const bPatch = await api(B.token, "PATCH", `/rest/v1/training_profiles?user_id=eq.${A.id}`, {
    primary_goal: "strength",
  });
  check("B는 A 프로필 수정 불가 (0행)", bPatch.status < 300 && rows(bPatch).length === 0, JSON.stringify(bPatch.json));
  const bFake = await api(B.token, "POST", "/rest/v1/training_profiles", { ...profile, user_id: A.id });
  check("B는 A 명의 프로필 생성 불가", bFake.status >= 400);
  const badGoal = await api(B.token, "POST", "/rest/v1/training_profiles", {
    ...profile,
    user_id: B.id,
    primary_goal: "bulk",
  });
  check("목표 값 check 제약", badGoal.status === 400);

  console.log("\n── ③ workout_session_feedback ──");
  const fIns = await api(A.token, "POST", "/rest/v1/workout_session_feedback", {
    session_id: sA.id,
    user_id: A.id,
    overall_effort: "heavy",
    flags: ["pain"],
  });
  check("A가 자기 완료 세션에 체감 저장", fIns.status === 201, JSON.stringify(fIns.json));
  const fDup = await api(A.token, "POST", "/rest/v1/workout_session_feedback", {
    session_id: sA.id,
    user_id: A.id,
    overall_effort: "light",
  });
  check("두 번째 insert는 23505 (클라가 update로 넘어간다)", fDup.json?.code === "23505", JSON.stringify(fDup.json));
  const fUpd = await api(A.token, "PATCH", `/rest/v1/workout_session_feedback?session_id=eq.${sA.id}`, {
    overall_effort: "light",
  });
  check("A가 체감 수정", fUpd.status === 200 && rows(fUpd)[0]?.overall_effort === "light", JSON.stringify(fUpd.json));
  const fMove = await api(A.token, "PATCH", `/rest/v1/workout_session_feedback?session_id=eq.${sA.id}`, {
    session_id: sB.id,
  });
  check("session_id를 남의 세션으로 옮기기 불가 (update grant 없음)", fMove.status >= 400, JSON.stringify(fMove.json));
  const bOnA = await api(B.token, "POST", "/rest/v1/workout_session_feedback", {
    session_id: sA.id,
    user_id: B.id,
    overall_effort: "light",
  });
  check("B는 A의 세션에 체감 저장 불가", bOnA.status >= 400, JSON.stringify(bOnA.json));
  check(
    "B는 A의 체감(통증) 조회 0행",
    rows(await api(B.token, "GET", `/rest/v1/workout_session_feedback?session_id=eq.${sA.id}`)).length === 0,
  );
  const badFlag = await api(B.token, "POST", "/rest/v1/workout_session_feedback", {
    session_id: sB.id,
    user_id: B.id,
    flags: ["hack"],
  });
  check("플래그 check 제약", badFlag.status === 400);
  const draftB = await api(B.token, "POST", "/rest/v1/workout_sessions", { user_id: B.id, timezone: "Asia/Seoul" });
  const onDraft = await api(B.token, "POST", "/rest/v1/workout_session_feedback", {
    session_id: draftB.json?.[0]?.id,
    user_id: B.id,
  });
  check("완료 안 된 세션에는 체감 저장 불가", onDraft.status >= 400);

  console.log("\n── ④ workout_ai_feedback ──");
  const aiIns = await api(A.token, "POST", "/rest/v1/workout_ai_feedback", {
    session_id: sA.id,
    user_id: A.id,
    status: "completed",
    feedback: { summary: "fake" },
    generated_at: new Date().toISOString(),
    prompt_version: "x",
    algorithm_version: "x",
  });
  check("클라이언트는 AI 결과를 직접 쓸 수 없다", aiIns.status >= 400, JSON.stringify(aiIns.json));
  const svc = await admin("POST", "/rest/v1/workout_ai_feedback", {
    session_id: sB.id,
    user_id: B.id,
    status: "failed",
    error_code: "check",
    prompt_version: "workout_feedback_v1",
    algorithm_version: "progression_v1",
  });
  check("서버(service role)는 쓸 수 있다", svc.status === 201, JSON.stringify(svc.json));
  check(
    "B는 자기 AI 결과 조회",
    rows(await api(B.token, "GET", `/rest/v1/workout_ai_feedback?session_id=eq.${sB.id}`)).length === 1,
  );
  check(
    "A는 B의 AI 결과 조회 0행",
    rows(await api(A.token, "GET", `/rest/v1/workout_ai_feedback?session_id=eq.${sB.id}`)).length === 0,
  );
  const bUpd = await api(B.token, "PATCH", `/rest/v1/workout_ai_feedback?session_id=eq.${sB.id}`, {
    status: "completed",
  });
  check("본인도 AI 결과 수정 불가", bUpd.status >= 400, JSON.stringify(bUpd.json));
  const anon = await api(null, "GET", `/rest/v1/workout_ai_feedback?session_id=eq.${sB.id}`);
  check("비로그인은 AI 결과 조회 불가", anon.status >= 400 || rows(anon).length === 0, JSON.stringify(anon.json));
  const badState = await admin("PATCH", `/rest/v1/workout_ai_feedback?session_id=eq.${sB.id}`, {
    status: "completed",
  });
  check("completed인데 feedback 없으면 check 제약이 막는다", badState.status === 400, JSON.stringify(badState.json));

  console.log("\n── ⑤ analytics_events ──");
  // 앱처럼 return=minimal로 넣는다 — analytics_events는 SELECT가 막혀 있어서
  // representation을 달라고 하면 insert가 아니라 SELECT 권한에서 42501이 난다
  const ev = await api(
    A.token,
    "POST",
    "/rest/v1/analytics_events",
    { user_id: A.id, event_name: "ai_coach_onboarding_started" },
    KEY,
    "return=minimal",
  );
  check("ai_coach_onboarding_started 허용", ev.status === 201, JSON.stringify(ev.json));

  if (ROUTE_BASE) {
    console.log(`\n── ⑥ 라우트 ${ROUTE_BASE}/api/workout-feedback ──`);
    const call = async (token, body) => {
      const res = await fetch(`${ROUTE_BASE}/api/workout-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    check("비로그인 401", (await call(null, { sessionId: sA.id })).status === 401);
    const bola = await call(A.token, { sessionId: sB.id });
    check("A가 B의 세션 → 404, B 데이터 없음", bola.status === 404 && !JSON.stringify(bola.json).includes("벤치"), JSON.stringify(bola.json));
    check("UUID 아님 → 400", (await call(A.token, { sessionId: "1 or 1=1" })).status === 400);
    const noProfile = await call(B.token, { sessionId: sB.id });
    // B는 프로필이 없다. 위 ④에서 service role로 failed 행을 넣어 뒀으므로 그 행이 먼저 보인다
    check("B(프로필 없음, 기존 failed 행) → 재시도 없이 failed 그대로", noProfile.json?.status === "failed", JSON.stringify(noProfile.json));

    const first = await call(A.token, { sessionId: sA.id });
    check("A 첫 호출 → completed 또는 failed(키 없음 등)", ["completed", "failed"].includes(first.json?.status), JSON.stringify(first.json));
    for (let i = 0; i < 4; i++) await call(A.token, { sessionId: sA.id });
    const row = rows(await admin("GET", `/rest/v1/workout_ai_feedback?session_id=eq.${sA.id}&select=attempt_count,status,model,prompt_version,algorithm_version,metrics`))[0];
    check("같은 세션 5회 호출 → attempt_count 1 (AI 1회)", row?.attempt_count === 1, JSON.stringify(row && { ...row, metrics: undefined }));
    check("버전 기록", row?.prompt_version === "workout_feedback_v1" && row?.algorithm_version === "progression_v1");
    check("계산값(metrics) 저장", !!row?.metrics?.exercises, "");
    // ③에서 A는 flags: ["pain"]을 남겼다 → 이 세션은 증량 후보가 막혀야 한다
    check("통증 신고 세션 — 증량 차단이 계산값에 남는다", row?.metrics?.safety?.progressionBlocked === true);
    check(
      "통증 신고 세션 — 어떤 종목도 증량 후보가 아니다",
      (row?.metrics?.exercises ?? []).every((e) => e.action !== "increase_candidate"),
    );
  }
} finally {
  for (const u of [A, B]) {
    if (!u?.id) continue;
    const res = await _guard.deleteIfCreatedThisRun(u.id);
    if (!res.ok) console.log(`정리 실패(${u.id.slice(0, 8)}): ${res.status}`);
  }
  console.log("픽스처 정리 완료");
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed !== 0) process.exit(1);
