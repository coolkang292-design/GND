// RLS 2인 픽스처 테스트 (§19) — 익명 유저 A·B를 만들어 경계를 검증한다.
// 실행: node scripts/rls-test.mjs  (사전조건: 0001~0004 마이그레이션 적용됨)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

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

async function api(token, method, path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  return { token: json.access_token, id: json.user.id };
}

console.log("── 픽스처 생성: 익명 유저 A, B ──");
const A = await anonUser();
const B = await anonUser();
console.log(`  A=${A.id.slice(0, 8)}… B=${B.id.slice(0, 8)}…`);

// A: 프로필 + 크루 생성
const pA = await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "유저A", avatar_url: "🧔", weekly_goal: 3,
});
check("A가 본인 프로필 생성", pA.status === 201, JSON.stringify(pA.json));

const gA = await api(A.token, "POST", "/rest/v1/rpc/create_group", { p_name: "RLS테스트크루" });
const group = gA.json;
check("A가 크루 생성(RPC)", gA.status === 200 && group?.invite_code?.startsWith("GND-"), JSON.stringify(group));

// B: 프로필 생성
const pB = await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: "유저B", avatar_url: "👩", weekly_goal: 5,
});
check("B가 본인 프로필 생성", pB.status === 201);

console.log("\n── 참여 전: 비멤버 차단 ──");
const g0 = await api(B.token, "GET", `/rest/v1/groups?id=eq.${group.id}`);
check("B는 그룹 조회 불가", g0.status === 200 && g0.json.length === 0, JSON.stringify(g0.json));

const prof0 = await api(B.token, "GET", `/rest/v1/profiles?id=eq.${A.id}`);
check("B는 A 프로필 조회 불가", prof0.status === 200 && prof0.json.length === 0);

const fake = await api(B.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: "사칭", weekly_goal: 1,
});
check("B는 A 명의 프로필 생성 불가", fake.status === 401 || fake.status === 403 || fake.status === 409);

const sneak = await api(B.token, "POST", "/rest/v1/group_members", {
  group_id: group.id, user_id: B.id, role: "member",
});
check("B는 멤버십 직접 insert 불가(RPC만 허용)", sneak.status === 401 || sneak.status === 403);

const badCode = await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code", { p_code: "GND-XXXXX" });
check("잘못된 초대코드는 거부", badCode.status >= 400);

console.log("\n── 초대코드 참여 후: 크루 내 공개 ──");
const join = await api(B.token, "POST", "/rest/v1/rpc/join_group_with_code", { p_code: group.invite_code });
check("B가 초대코드로 참여(RPC)", join.status === 200, JSON.stringify(join.json));

const g1 = await api(B.token, "GET", `/rest/v1/groups?id=eq.${group.id}`);
check("참여 후 B가 그룹 조회 가능", g1.status === 200 && g1.json.length === 1);

const prof1 = await api(B.token, "GET", `/rest/v1/profiles?id=eq.${A.id}`);
check("참여 후 B가 크루원 A 프로필 조회 가능", prof1.status === 200 && prof1.json.length === 1);

const mem = await api(B.token, "GET", `/rest/v1/group_members?group_id=eq.${group.id}`);
check("멤버 목록 2명", mem.status === 200 && mem.json.length === 2, JSON.stringify(mem.json));

console.log("\n── 쓰기 경계 ──");
const upd = await api(B.token, "PATCH", `/rest/v1/profiles?id=eq.${A.id}`, { nickname: "해킹됨" });
check("B는 A 프로필 수정 불가", upd.status < 300 && (upd.json ?? []).length === 0, JSON.stringify(upd.json));

const gupd = await api(B.token, "PATCH", `/rest/v1/groups?id=eq.${group.id}`, { name: "탈취크루" });
check("B(비owner)는 그룹 수정 불가", gupd.status < 300 && (gupd.json ?? []).length === 0);

const kick = await api(B.token, "DELETE", `/rest/v1/group_members?group_id=eq.${group.id}&user_id=eq.${A.id}`);
check("B는 A를 강퇴 불가", kick.status < 300 && (kick.json ?? []).length === 0);

console.log("\n── Phase 3: 운동 카탈로그 ──");
const cat = await api(A.token, "GET", "/rest/v1/exercise_catalog?select=id,name&limit=5");
check("A가 기본 시드 카탈로그 조회 가능", cat.status === 200 && cat.json.length > 0, JSON.stringify(cat.json));

const customName = `B커스텀_${Date.now()}`;
const cust = await api(B.token, "POST", "/rest/v1/exercise_catalog", {
  name: customName, body_part: "가슴", exercise_type: "weight", is_custom: true, created_by: B.id,
});
check("B가 커스텀 운동 생성", cust.status === 201, JSON.stringify(cust.json));

const custA = await api(A.token, "GET", `/rest/v1/exercise_catalog?name=eq.${encodeURIComponent(customName)}`);
check("A는 B의 커스텀 운동 조회 불가", custA.status === 200 && custA.json.length === 0);

const custFake = await api(B.token, "POST", "/rest/v1/exercise_catalog", {
  name: "사칭커스텀", body_part: "등", exercise_type: "weight", is_custom: true, created_by: A.id,
});
check("B는 A 명의 커스텀 생성 불가", custFake.status >= 400);

console.log("\n── Phase 3: 세션 상태전이 (RPC 전용) ──");
const draft = await api(A.token, "POST", "/rest/v1/workout_sessions", {
  user_id: A.id, group_id: group.id, timezone: "Asia/Seoul",
});
const session = draft.json?.[0];
check("A가 draft 세션 생성", draft.status === 201 && session?.status === "draft", JSON.stringify(draft.json));

const directStatus = await api(A.token, "PATCH", `/rest/v1/workout_sessions?id=eq.${session.id}`, { status: "active" });
check("status 직접 수정 불가 (컬럼 권한)", directStatus.status >= 400, JSON.stringify(directStatus.json));

const directStart = await api(A.token, "PATCH", `/rest/v1/workout_sessions?id=eq.${session.id}`, { started_at: new Date().toISOString() });
check("started_at 직접 수정 불가 (컬럼 권한)", directStart.status >= 400);

const insActive = await api(A.token, "POST", "/rest/v1/workout_sessions", {
  user_id: A.id, group_id: group.id, status: "active",
});
check("active 세션 직접 insert 불가", insActive.status >= 400);

const started = await api(A.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session.id });
check("A가 시작 RPC → active + 서버 started_at", started.status === 200 && started.json?.status === "active" && !!started.json?.started_at, JSON.stringify(started.json));

const draft2 = await api(A.token, "POST", "/rest/v1/workout_sessions", {
  user_id: A.id, group_id: group.id, timezone: "Asia/Seoul",
});
const session2 = draft2.json?.[0];
const dupStart = await api(A.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session2.id });
check("active 중복 시작 차단 (active_session_exists)", dupStart.status >= 400, JSON.stringify(dupStart.json));

console.log("\n── Phase 3: 세션·세트 경계 ──");
const bActive = await api(B.token, "GET", `/rest/v1/workout_sessions?id=eq.${session.id}`);
check("B는 A의 active 세션 조회 불가", bActive.status === 200 && bActive.json.length === 0);

const bPatch = await api(B.token, "PATCH", `/rest/v1/workout_sessions?id=eq.${session.id}`, { memo: "해킹" });
check("B는 A의 세션 수정 불가", bPatch.status < 300 && (bPatch.json ?? []).length === 0, JSON.stringify(bPatch.json));

const ex = await api(A.token, "POST", "/rest/v1/workout_exercises", {
  session_id: session.id, exercise_name: "벤치프레스", exercise_type: "weight", sort_order: 0,
});
const exercise = ex.json?.[0];
check("A가 운동 추가", ex.status === 201, JSON.stringify(ex.json));

const st = await api(A.token, "POST", "/rest/v1/workout_sets", {
  workout_exercise_id: exercise.id, set_number: 1, weight_kg: 50, reps: 10, is_completed: true,
});
check("A가 완료 세트 추가 → completed_at 서버 기록", st.status === 201 && !!st.json?.[0]?.completed_at, JSON.stringify(st.json));

const stClientTime = await api(A.token, "POST", "/rest/v1/workout_sets", {
  workout_exercise_id: exercise.id, set_number: 2, weight_kg: 50, reps: 8,
  is_completed: true, completed_at: "2000-01-01T00:00:00Z",
});
check("completed_at 클라 직접 쓰기 불가 (컬럼 권한)", stClientTime.status >= 400);

const bSet = await api(B.token, "POST", "/rest/v1/workout_sets", {
  workout_exercise_id: exercise.id, set_number: 3, weight_kg: 1, reps: 1,
});
check("B는 A의 운동에 세트 insert 불가", bSet.status >= 400);

const bSets = await api(B.token, "GET", `/rest/v1/workout_sets?workout_exercise_id=eq.${exercise.id}`);
check("B는 A의 active 세트 조회 불가", bSets.status === 200 && bSets.json.length === 0);

console.log("\n── Phase 3: 완료 후 크루 공개 / private 비공개 ──");
const done = await api(A.token, "POST", "/rest/v1/rpc/complete_workout", { p_session_id: session.id });
check("A가 완료 RPC → completed + duration", done.status === 200 && done.json?.status === "completed" && done.json?.duration_minutes >= 1, JSON.stringify(done.json));

const bDone = await api(B.token, "GET", `/rest/v1/workout_sessions?id=eq.${session.id}`);
check("B는 크루 공개 완료 세션 조회 가능", bDone.status === 200 && bDone.json.length === 1, JSON.stringify(bDone.json));

const bDoneSets = await api(B.token, "GET", `/rest/v1/workout_sets?workout_exercise_id=eq.${exercise.id}`);
check("B는 완료 세션의 세트 조회 가능", bDoneSets.status === 200 && bDoneSets.json.length === 1);

const bDonePatch = await api(B.token, "PATCH", `/rest/v1/workout_sessions?id=eq.${session.id}`, { memo: "해킹" });
check("B는 완료 세션도 수정 불가", bDonePatch.status < 300 && (bDonePatch.json ?? []).length === 0);

// draft2를 private으로 바꿔 시작→완료 → B에게 안 보여야 함
await api(A.token, "PATCH", `/rest/v1/workout_sessions?id=eq.${session2.id}`, { visibility: "private" });
await api(A.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: session2.id });
const done2 = await api(A.token, "POST", "/rest/v1/rpc/complete_workout", { p_session_id: session2.id });
check("A가 private 세션 시작→완료", done2.status === 200 && done2.json?.status === "completed");

const bPriv = await api(B.token, "GET", `/rest/v1/workout_sessions?id=eq.${session2.id}`);
check("B는 private 완료 세션 조회 불가", bPriv.status === 200 && bPriv.json.length === 0);

const draft3 = await api(A.token, "POST", "/rest/v1/workout_sessions", {
  user_id: A.id, timezone: "Asia/Seoul",
});
const cancel = await api(A.token, "POST", "/rest/v1/rpc/cancel_workout", { p_session_id: draft3.json?.[0]?.id });
check("A가 취소 RPC → cancelled", cancel.status === 200 && cancel.json?.status === "cancelled");

const bCancelRpc = await api(B.token, "POST", "/rest/v1/rpc/complete_workout", { p_session_id: session2.id });
check("B는 A 세션에 RPC 호출 불가 (session_not_found)", bCancelRpc.status >= 400);

console.log("\n── Phase 4: 인증사진 (workout_images + storage) ──");
// storage 헬퍼 — 바이너리 업로드/다운로드
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
async function storagePut(token, path) {
  const res = await fetch(`${URL_}/storage/v1/object/workout-images/${path}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: fakeJpeg,
  });
  return res.status;
}
async function storageGet(token, path) {
  const res = await fetch(`${URL_}/storage/v1/object/workout-images/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  return res.status;
}

// 인증 없는 세션엔 RPC 거부 (image_not_found)
const noImg = await api(A.token, "POST", "/rest/v1/rpc/set_workout_verification", {
  p_session_id: session.id, p_source: "camera",
});
check("사진 없이 인증 RPC 불가 (image_not_found)", noImg.status >= 400, JSON.stringify(noImg.json));

const imgPath = `${A.id}/${session.id}/test.jpg`;
check("A가 본인 경로에 사진 업로드", (await storagePut(A.token, imgPath)) === 200);
check("B는 A 경로에 업로드 불가", (await storagePut(B.token, `${A.id}/${session.id}/hack.jpg`)) >= 400);

const imgRow = await api(A.token, "POST", "/rest/v1/workout_images", {
  session_id: session.id, user_id: A.id, image_path: imgPath, source: "camera",
});
check("A가 이미지 행 생성", imgRow.status === 201, JSON.stringify(imgRow.json));

const imgFake = await api(A.token, "POST", "/rest/v1/workout_images", {
  session_id: session.id, user_id: A.id, image_path: imgPath, source: "camera",
  server_uploaded_at: "2000-01-01T00:00:00Z",
});
check("server_uploaded_at 클라 직접 쓰기 불가 (컬럼 권한)", imgFake.status >= 400);

const imgB = await api(B.token, "POST", "/rest/v1/workout_images", {
  session_id: session.id, user_id: B.id, image_path: `${B.id}/x/x.jpg`, source: "album",
});
check("B는 A 세션에 이미지 행 생성 불가", imgB.status >= 400);

const verify = await api(A.token, "POST", "/rest/v1/rpc/set_workout_verification", {
  p_session_id: session.id, p_source: "camera",
});
check(
  "A가 인증 RPC → camera_verified + 서버 server_uploaded_at",
  verify.status === 200 && verify.json?.verification_status === "camera_verified" && !!verify.json?.server_uploaded_at,
  JSON.stringify(verify.json),
);

const verifyB = await api(B.token, "POST", "/rest/v1/rpc/set_workout_verification", {
  p_session_id: session.id, p_source: "camera",
});
check("B는 A 세션 인증 RPC 불가", verifyB.status >= 400);

const bImgRow = await api(B.token, "GET", `/rest/v1/workout_images?session_id=eq.${session.id}`);
check("B는 크루 공개 완료 세션의 이미지 행 조회 가능", bImgRow.status === 200 && bImgRow.json.length === 1);
check("B는 크루 공개 세션의 사진 다운로드 가능", (await storageGet(B.token, imgPath)) === 200);

// private 세션(session2) 사진은 크루원에게도 비공개
const privPath = `${A.id}/${session2.id}/priv.jpg`;
check("A가 private 세션 사진 업로드", (await storagePut(A.token, privPath)) === 200);
const privRow = await api(A.token, "POST", "/rest/v1/workout_images", {
  session_id: session2.id, user_id: A.id, image_path: privPath, source: "album",
});
check("A가 private 세션 이미지 행 생성", privRow.status === 201);

const bPrivRow = await api(B.token, "GET", `/rest/v1/workout_images?session_id=eq.${session2.id}`);
check("B는 private 세션 이미지 행 조회 불가", bPrivRow.status === 200 && bPrivRow.json.length === 0);
check("B는 private 세션 사진 다운로드 불가", (await storageGet(B.token, privPath)) >= 400);

console.log("\n── Phase 5: 챌린지 (KPI 게이트·비공개·기록 보존) ──");
const C = await anonUser(); // 비크루 외부인

const chIns = await api(A.token, "POST", "/rest/v1/challenges", {
  group_id: group.id, name: "RLS 챌린지", start_date: "2026-07-01", end_date: "2026-07-14",
});
const challenge = chIns.json?.[0];
check("A가 챌린지 생성 (기본 setup)", chIns.status === 201 && challenge?.status === "setup", JSON.stringify(chIns.json));

const chDup = await api(B.token, "POST", "/rest/v1/challenges", {
  group_id: group.id, name: "중복", start_date: "2026-07-01", end_date: "2026-07-14",
});
check("살아있는 챌린지 중복 생성 차단 (unique)", chDup.status >= 400);

const chStatusHack = await api(A.token, "PATCH", `/rest/v1/challenges?id=eq.${challenge.id}`, { status: "active" });
check("status 직접 수정 불가 (컬럼 권한)", chStatusHack.status >= 400);

const chC = await api(C.token, "GET", `/rest/v1/challenges?id=eq.${challenge.id}`);
check("비크루 C는 챌린지 조회 불가", chC.status === 200 && chC.json.length === 0);

const gateEarly = await api(A.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: challenge.id });
check("KPI 미완 시 시작 차단 (kpi_incomplete)", gateEarly.status >= 400 && JSON.stringify(gateEarly.json).includes("kpi_incomplete"), JSON.stringify(gateEarly.json));

const goalA = await api(A.token, "POST", "/rest/v1/user_goals", {
  user_id: A.id, challenge_id: challenge.id, group_id: group.id,
  goal_type: "volume", target_value: 5000, unit: "kg", planned_days: 5,
});
check("A가 본인 KPI 생성", goalA.status === 201, JSON.stringify(goalA.json));

const goalForge = await api(B.token, "POST", "/rest/v1/user_goals", {
  user_id: A.id, challenge_id: challenge.id, group_id: group.id,
  goal_type: "cardio_distance", target_value: 20, planned_days: 5,
});
check("B는 A 명의 KPI 생성 불가", goalForge.status >= 400);

const goalC = await api(C.token, "POST", "/rest/v1/user_goals", {
  user_id: C.id, challenge_id: challenge.id, group_id: group.id,
  goal_type: "cardio_distance", target_value: 20, planned_days: 5,
});
check("비크루 C는 KPI 생성 불가", goalC.status >= 400);

const goalB = await api(B.token, "POST", "/rest/v1/user_goals", {
  user_id: B.id, challenge_id: challenge.id, group_id: group.id,
  goal_type: "weight_days", target_value: 12, planned_days: 4,
});
check("B가 본인 KPI 생성", goalB.status === 201);

const cancelByB = await api(B.token, "POST", "/rest/v1/rpc/cancel_challenge", { p_challenge_id: challenge.id });
check("비생성자 B는 챌린지 취소 불가", cancelByB.status >= 400);

const started2 = await api(B.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: challenge.id });
check("전원 KPI 완료 후 크루원이 시작 가능 → active", started2.status === 200 && started2.json?.status === "active", JSON.stringify(started2.json));

const goalEditAfter = await api(A.token, "PATCH", `/rest/v1/user_goals?id=eq.${goalA.json[0].id}`, { target_value: 1 });
check("시작 후 KPI 수정 불가 (기록 보존)", goalEditAfter.status < 300 && (goalEditAfter.json ?? []).length === 0, JSON.stringify(goalEditAfter.json));

const goalsSeen = await api(B.token, "GET", `/rest/v1/user_goals?challenge_id=eq.${challenge.id}`);
check("크루원 B는 전체 KPI 조회 가능 (설정 현황·결과용)", goalsSeen.status === 200 && goalsSeen.json.length === 2);

const finEarly = await api(A.token, "POST", "/rest/v1/rpc/finalize_challenge", { p_challenge_id: challenge.id });
check("종료일 전 결과 확정...은 과거 종료일이라 성공해야 함 (ended)", finEarly.status === 200 && finEarly.json?.status === "ended", JSON.stringify(finEarly.json));

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
