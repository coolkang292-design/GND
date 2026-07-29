// XP·레벨 시스템 실 DB 통합·RLS 테스트 (계획 Task 7)
// 사전조건: 0022_xp_level_system.sql 적용됨.
// 실행: node scripts/xp-test.mjs
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

// 삭제 가드 — 실행 시작 시점에 있던 계정은 절대 지우지 않는다.
const _guard = await createDeleteGuard({ url: URL_, serviceKey: SERVICE });
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

async function api(token, method, path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  return { token: json.access_token, id: json.user.id };
}
const adminHeaders = SERVICE ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" } : null;
async function adminPatch(path, body) {
  return fetch(`${URL_}${path}`, { method: "PATCH", headers: { ...adminHeaders, Prefer: "return=representation" }, body: JSON.stringify(body) });
}

// 계획대로 세션을 만들고 완료까지 (웨이트 3세트) — v2 결과 반환
async function completeWeightWorkout(u, { sets = 3, reps = 10 } = {}) {
  const draft = await api(u.token, "POST", "/rest/v1/workout_sessions", { user_id: u.id, timezone: "Asia/Seoul", visibility: "private" });
  const session = draft.json?.[0];
  const ex = await api(u.token, "POST", "/rest/v1/workout_exercises", { session_id: session.id, exercise_name: "벤치프레스", exercise_type: "weight", sort_order: 0 });
  const exercise = ex.json?.[0];
  for (let i = 1; i <= sets; i++) {
    await api(u.token, "POST", "/rest/v1/workout_sets", { workout_exercise_id: exercise.id, set_number: i, weight_kg: 50, reps, is_completed: true });
  }
  await api(u.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session.id });
  const done = await api(u.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: session.id });
  return { session, done };
}

console.log("── 픽스처: 유저 A, B ──");
const A = await anonUser();
const B = await anonUser();
await api(A.token, "POST", "/rest/v1/profiles", { id: A.id, nickname: `xpA-${Date.now().toString(36)}`, weekly_goal: 3 });
await api(B.token, "POST", "/rest/v1/profiles", { id: B.id, nickname: `xpB-${Date.now().toString(36)}`, weekly_goal: 3 });

console.log("\n── 1) 첫 유효 운동 → XP 지급 ──");
const r1 = await completeWeightWorkout(A);
check("awarded=true, xpAwarded>=110", r1.done.status === 200 && r1.done.json?.awarded === true && r1.done.json?.xpAwarded >= 110, JSON.stringify(r1.done.json));
check("newLevel 1 (110 XP)", r1.done.json?.newLevel === 1);

console.log("\n── 2) 같은 날 2번째 운동 → XP 0 ──");
const r2 = await completeWeightWorkout(A);
check("2번째 xpAwarded=0", r2.done.json?.awarded === false && (r2.done.json?.xpAwarded ?? 0) === 0, JSON.stringify(r2.done.json));

console.log("\n── 3) 멱등: 완료된 세션 재호출 → idempotentReplay ──");
const replay = await api(A.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: r1.session.id });
check("idempotentReplay=true", replay.json?.idempotentReplay === true && replay.json?.rejectionReason === "XP_ALREADY_AWARDED", JSON.stringify(replay.json));
const txns = await api(A.token, "GET", `/rest/v1/xp_transactions?source_id=eq.${r1.session.id}&reason=eq.workout_completed`);
check("동일 세션 workout_completed 거래 1건", txns.status === 200 && txns.json.length === 1, `${txns.json?.length}건`);

console.log("\n── 4) RLS 경계 ──");
const bReadA = await api(B.token, "GET", `/rest/v1/user_progress?user_id=eq.${A.id}`);
check("B는 A의 user_progress 조회 불가", bReadA.status === 200 && bReadA.json.length === 0);
const bReadTx = await api(B.token, "GET", `/rest/v1/xp_transactions?user_id=eq.${A.id}`);
check("B는 A의 xp_transactions 조회 불가", bReadTx.status === 200 && bReadTx.json.length === 0);
const patchProg = await api(A.token, "PATCH", `/rest/v1/user_progress?user_id=eq.${A.id}`, { total_xp: 999999 });
check("user_progress 직접 수정 불가", patchProg.status >= 400 || (patchProg.json ?? []).length === 0, `status=${patchProg.status}`);
const insTx = await api(A.token, "POST", "/rest/v1/xp_transactions", { user_id: A.id, amount: 99999, transaction_type: "earn", reason: "workout_completed", source_type: "workout", source_id: "x", effective_date: "2026-07-23" });
check("xp_transactions 직접 insert 불가", insTx.status >= 400, `status=${insTx.status}`);

console.log("\n── 5) level_definitions: 조회 O, 수정 X ──");
const defs = await api(A.token, "GET", "/rest/v1/level_definitions?select=level,required_total_xp,stage_index,stage_key,stage_name,character_path&order=level.asc");
check("level_definitions 35행 조회", defs.status === 200 && defs.json.length === 35, `${defs.json?.length}행`);
const patchDef = await api(A.token, "PATCH", "/rest/v1/level_definitions?level=eq.1", { required_total_xp: 1 });
check("level_definitions 수정 불가", patchDef.status >= 400 || (patchDef.json ?? []).length === 0, `status=${patchDef.status}`);

console.log("\n── 6) 타바타: 세트 없이 완료 → XP 100 ──");
// B로 타바타(당일 첫 운동) — B는 아직 XP 없음
const tB = await api(B.token, "POST", "/rest/v1/workout_sessions", { user_id: B.id, timezone: "Asia/Seoul", tabata_minutes: 16, visibility: "private" });
const tSession = tB.json?.[0];
await api(B.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: tSession.id });
const tDone = await api(B.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: tSession.id });
check("타바타 awarded=true, xpAwarded=100", tDone.json?.awarded === true && tDone.json?.xpAwarded === 100, JSON.stringify(tDone.json));

console.log("\n── 7) DB ↔ TS 미러 일치 ──");
// TS와 동일 공식으로 기대값 생성 (progression.ts 미러)
const CUTS = [0,200,400,600,800,1000,1400,1800,2200,2600,3000,3600,4200,4800,5400,6000,6800,7600,8400,9200,10000,11000,12000,13000,14000,15000,16200,17400,18600,19800,21000,22250,23500,24750,26000];
const STAGE_KEYS = ["gaenodap","nuntteotgae","ildanhagae","mulgogagae","michyeobogae","paneuljjagae","jeonseorigae"];
const STAGE_NAMES = ["개노답","눈떴개","일단하개","물고가개","미쳐보개","판을짜개","전설이개"];
let mismatch = 0;
for (const d of defs.json) {
  const i = d.level - 1;
  const si = Math.ceil(d.level / 5);
  if (d.required_total_xp !== CUTS[i] || d.stage_index !== si ||
      d.stage_key !== STAGE_KEYS[si - 1] || d.stage_name !== STAGE_NAMES[si - 1] ||
      d.character_path !== `/characters/char-${si}.png`) {
    mismatch++;
    console.log(`    불일치 Lv.${d.level}: ${JSON.stringify(d)}`);
  }
}
check("35레벨 DB↔TS 전 필드 일치", mismatch === 0, `${mismatch}개 불일치`);

console.log("\n── 8) 360분+ → XP 거부 ──");
if (adminHeaders) {
  const d = await api(A.token, "POST", "/rest/v1/workout_sessions", { user_id: A.id, timezone: "Asia/Seoul", visibility: "private" });
  const s = d.json?.[0];
  const ex = await api(A.token, "POST", "/rest/v1/workout_exercises", { session_id: s.id, exercise_name: "스쿼트", exercise_type: "weight", sort_order: 0 });
  for (let i = 1; i <= 3; i++) await api(A.token, "POST", "/rest/v1/workout_sets", { workout_exercise_id: ex.json[0].id, set_number: i, weight_kg: 40, reps: 10, is_completed: true });
  await api(A.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: s.id });
  // started_at을 7시간 전으로 (service_role)
  await adminPatch(`/rest/v1/workout_sessions?id=eq.${s.id}`, { started_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString() });
  const done = await api(A.token, "POST", "/rest/v1/rpc/complete_workout_v2", { p_session_id: s.id });
  check("360분+ → xpAwarded 0 (완료는 됨)", done.json?.awarded === false && (done.json?.xpAwarded ?? 0) === 0, JSON.stringify(done.json));
} else {
  console.log("  ⏭ SERVICE 키 없음 — 360분 테스트 생략");
}

console.log("\n── 9) 내부 함수 is_valid_workout 직접 호출 불가 ──");
const ivw = await api(A.token, "POST", "/rest/v1/rpc/is_valid_workout", { p_session_id: r1.session.id });
check("is_valid_workout 직접 실행 거부", ivw.status >= 400, `status=${ivw.status}`);

// ── 정리 ──
console.log("\n── 정리 ──");
if (adminHeaders) {
  for (const u of [A, B]) {
    const res = await _guard.deleteIfCreatedThisRun(u.id);
    if (!res.ok) console.log(`정리 실패(${u.id.slice(0, 8)}): ${res.status}`);
  }
  console.log("픽스처 정리 완료");
} else {
  console.log("SUPABASE_SERVICE_ROLE_KEY 없음 — 정리 생략(수동 삭제 필요)");
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
