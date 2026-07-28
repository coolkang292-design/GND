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
  id: A.id, nickname: `유저A-${Date.now().toString(36)}`, avatar_url: "🧔", weekly_goal: 3,
});
check("A가 본인 프로필 생성", pA.status === 201, JSON.stringify(pA.json));

const gA = await api(A.token, "POST", "/rest/v1/rpc/create_group", { p_name: "RLS테스트크루" });
const group = gA.json;
check("A가 크루 생성(RPC)", gA.status === 200 && group?.invite_code?.startsWith("GND-"), JSON.stringify(group));

// B: 프로필 생성
const pB = await api(B.token, "POST", "/rest/v1/profiles", {
  id: B.id, nickname: `유저B-${Date.now().toString(36)}`, avatar_url: "👩", weekly_goal: 5,
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

// 0039부터 "크루"는 같은 그룹이 아니라 서로 수락한 사이다. 이 스크립트는 픽스처를
// 그룹으로만 엮어 왔으므로, 아래 단언들이 통과하려면 크루 연결을 따로 맺어야 한다.
// 그룹은 챌린지 몫으로 그대로 두고(Phase 5가 쓴다) 연결만 추가한다.
const linkReq = await api(A.token, "POST", "/rest/v1/rpc/send_crew_request", {
  p_target_id: B.id,
});
check("A가 B에게 크루 요청 (0039 픽스처)", linkReq.status === 200, JSON.stringify(linkReq.json));
const linkAcc = await api(B.token, "POST", "/rest/v1/rpc/accept_crew_request", {
  p_request_id: linkReq.json?.requestId,
});
check("B가 수락 → A·B 크루 연결 (0039 픽스처)", linkAcc.status === 200, JSON.stringify(linkAcc.json));

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

console.log("\n── Phase 6: 소셜 — workout_events (진행 중 카드 원천) ──");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 픽스처: A가 새 크루 공개 세션 시작 (기존 세션은 모두 completed/cancelled)
const d6 = await api(A.token, "POST", "/rest/v1/workout_sessions", {
  user_id: A.id, group_id: group.id, timezone: "Asia/Seoul",
});
const s6 = d6.json?.[0];
const start6 = await api(A.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: s6.id });
check("A가 소셜 픽스처 세션 시작", start6.status === 200 && start6.json?.status === "active", JSON.stringify(start6.json));

const evB = await api(B.token, "GET", `/rest/v1/workout_events?session_id=eq.${s6.id}`);
check("B(크루)는 시작 이벤트 조회 가능", evB.status === 200 && evB.json.length === 1 && evB.json[0].event_type === "workout_started", JSON.stringify(evB.json));
const evC = await api(C.token, "GET", `/rest/v1/workout_events?session_id=eq.${s6.id}`);
check("비크루 C는 이벤트 조회 불가", evC.status === 200 && evC.json.length === 0);
const evPriv = await api(B.token, "GET", `/rest/v1/workout_events?session_id=eq.${session2.id}`);
check("B는 private 세션 이벤트 조회 불가", evPriv.status === 200 && evPriv.json.length === 0);
const evIns = await api(B.token, "POST", "/rest/v1/workout_events", {
  session_id: s6.id, user_id: B.id, event_type: "workout_started",
});
check("이벤트 직접 insert 차단 (RPC만)", evIns.status >= 400);

console.log("\n── Phase 6: 시작 알림 + notifications 경계 ──");
const nStart = await api(B.token, "GET", `/rest/v1/notifications?type=eq.workout_started&reference_id=eq.${s6.id}`);
check("B에게 운동 시작 알림 생성", nStart.status === 200 && nStart.json.length === 1, JSON.stringify(nStart.json));
const nCross = await api(B.token, "GET", `/rest/v1/notifications?user_id=eq.${A.id}`);
check("B는 A의 알림 조회 불가", nCross.status === 200 && nCross.json.length === 0);
const nIns = await api(B.token, "POST", "/rest/v1/notifications", {
  user_id: A.id, type: "poke", title: "위조 알림",
});
check("알림 직접 insert 차단", nIns.status >= 400);

console.log("\n── Phase 6: 응원 (send_cheer 스팸 제한) ──");
const ch1 = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "fire" });
// 0041부터 send_cheer는 {cheer, points_awarded}를 돌려준다 (예전엔 cheers 행 자체).
check("B가 응원 1회 성공", ch1.status === 200 && ch1.json?.cheer?.cheer_type === "fire", JSON.stringify(ch1.json));
const chSelf = await api(A.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "fire" });
check("본인 세션 응원 금지 (own_session)", chSelf.status >= 400 && JSON.stringify(chSelf.json).includes("own_session"));
const chOut = await api(C.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "fire" });
check("비크루 응원 금지 (session_not_found)", chOut.status >= 400 && JSON.stringify(chOut.json).includes("session_not_found"));
const chFast = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "clap" });
check("10초 쿨다운 (cheer_cooldown)", chFast.status >= 400 && JSON.stringify(chFast.json).includes("cheer_cooldown"));

console.log("  (쿨다운 10.5초 대기…)");
await sleep(10500);
const ch2 = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "power" });
check("쿨다운 후 응원 2회 성공", ch2.status === 200, JSON.stringify(ch2.json));
console.log("  (쿨다운 10.5초 대기…)");
await sleep(10500);
const ch3 = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "custom", p_message: "화이팅!" });
check("커스텀 메시지 응원 3회 성공", ch3.status === 200 && ch3.json?.cheer?.message === "화이팅!");
const ch4 = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "fire" });
check("세션당 3회 제한 (cheer_limit)", ch4.status >= 400 && JSON.stringify(ch4.json).includes("cheer_limit"));

const nCheer = await api(A.token, "GET", "/rest/v1/notifications?type=eq.cheer_received");
check("A에게 응원 알림 3건", nCheer.status === 200 && nCheer.json.length === 3, `${nCheer.json?.length}건`);

const done6 = await api(A.token, "POST", "/rest/v1/rpc/complete_workout", { p_session_id: s6.id });
check("A가 소셜 세션 완료", done6.status === 200 && done6.json?.status === "completed");
const chEnded = await api(B.token, "POST", "/rest/v1/rpc/send_cheer", { p_session_id: s6.id, p_cheer_type: "finish" });
check("종료된 세션 응원 차단 (not_active)", chEnded.status >= 400 && JSON.stringify(chEnded.json).includes("not_active"));

console.log("\n── Phase 6: 반응 (unique·크루 경계·알림 트리거) ──");
const r1 = await api(B.token, "POST", "/rest/v1/reactions", {
  session_id: s6.id, user_id: B.id, reaction_type: "fire",
});
check("B가 완료 세션에 반응 추가", r1.status === 201, JSON.stringify(r1.json));
const rDup = await api(B.token, "POST", "/rest/v1/reactions", {
  session_id: s6.id, user_id: B.id, reaction_type: "fire",
});
check("중복 반응 차단 (unique)", rDup.status === 409);
const rOut = await api(C.token, "POST", "/rest/v1/reactions", {
  session_id: s6.id, user_id: C.id, reaction_type: "clap",
});
check("비크루 반응 차단", rOut.status >= 400);
const rForge = await api(B.token, "POST", "/rest/v1/reactions", {
  session_id: s6.id, user_id: A.id, reaction_type: "clap",
});
check("타인 명의 반응 차단", rForge.status >= 400);
const nReact = await api(A.token, "GET", `/rest/v1/notifications?type=eq.reaction_received&reference_id=eq.${s6.id}`);
check("반응 알림이 A에게 생성 (트리거)", nReact.status === 200 && nReact.json.length === 1);
const rSelf = await api(A.token, "POST", "/rest/v1/reactions", {
  session_id: s6.id, user_id: A.id, reaction_type: "like",
});
check("본인 세션 반응은 허용", rSelf.status === 201);
const nSelfReact = await api(A.token, "GET", `/rest/v1/notifications?type=eq.reaction_received&reference_id=eq.${s6.id}&actor_id=eq.${A.id}`);
check("본인 반응은 알림 생략", nSelfReact.status === 200 && nSelfReact.json.length === 0);
const rDelForeign = await api(A.token, "DELETE", `/rest/v1/reactions?session_id=eq.${s6.id}&user_id=eq.${B.id}`);
check("A는 B의 반응 삭제 불가", rDelForeign.status < 300 && (rDelForeign.json ?? []).length === 0);
const rDel = await api(B.token, "DELETE", `/rest/v1/reactions?session_id=eq.${s6.id}&user_id=eq.${B.id}&reaction_type=eq.fire`);
check("B가 본인 반응 삭제", rDel.status < 300 && (rDel.json ?? []).length === 1, JSON.stringify(rDel.json));

console.log("\n── Phase 6: 찌르기 + 읽음 처리 ──");
const pk1 = await api(B.token, "POST", "/rest/v1/rpc/poke_user", { p_target_id: A.id });
check("B가 A 찌르기 성공", pk1.status === 200 || pk1.status === 204, JSON.stringify(pk1.json));
const pk2 = await api(B.token, "POST", "/rest/v1/rpc/poke_user", { p_target_id: A.id });
check("24시간 재찌르기 차단 (poke_cooldown)", pk2.status >= 400 && JSON.stringify(pk2.json).includes("poke_cooldown"));
const pkSelf = await api(A.token, "POST", "/rest/v1/rpc/poke_user", { p_target_id: A.id });
check("본인 찌르기 차단 (self_poke)", pkSelf.status >= 400 && JSON.stringify(pkSelf.json).includes("self_poke"));
const pkOut = await api(C.token, "POST", "/rest/v1/rpc/poke_user", { p_target_id: A.id });
check("비크루 찌르기 차단 (not_crew)", pkOut.status >= 400 && JSON.stringify(pkOut.json).includes("not_crew"));
const nPoke = await api(A.token, "GET", "/rest/v1/notifications?type=eq.poke");
check("찌르기 알림이 A에게 생성", nPoke.status === 200 && nPoke.json.length === 1);

const nRead = await api(A.token, "PATCH", "/rest/v1/notifications?read_at=is.null", { read_at: new Date().toISOString() });
check("본인 알림 일괄 읽음 처리", nRead.status < 300 && (nRead.json ?? []).length >= 5, `${nRead.json?.length}건`);
const nTitle = await api(A.token, "PATCH", `/rest/v1/notifications?user_id=eq.${A.id}`, { title: "위조 제목" });
check("알림 title 수정 차단 (컬럼 권한)", nTitle.status >= 400);

console.log("\n── 0012: 꾸준왕 열람권 view_record ──");
// 직접 insert 차단 (0012에서 권한 회수)
const rvDirect = await api(A.token, "POST", "/rest/v1/record_views", {
  viewer_id: A.id, target_id: B.id,
});
check("record_views 직접 insert 차단", rvDirect.status >= 400, `status=${rvDirect.status}`);

// 본인 열람 기록 select는 여전히 가능 (0011 select 정책 유지)
const rvSel = await api(A.token, "GET", `/rest/v1/record_views?viewer_id=eq.${A.id}`);
check("본인 record_views select 허용", rvSel.status === 200);

// 자격 미달 — A의 완료 세션은 전부 오늘(1일 < 5일)
const vr1 = await api(A.token, "POST", "/rest/v1/rpc/view_record", { p_target_id: B.id });
check("5일 미달 시 not_eligible", vr1.status >= 400 && JSON.stringify(vr1.json).includes("not_eligible"), JSON.stringify(vr1.json));

// 본인 열람 금지
const vr2 = await api(A.token, "POST", "/rest/v1/rpc/view_record", { p_target_id: A.id });
check("본인 열람 self_view 거절", vr2.status >= 400 && JSON.stringify(vr2.json).includes("self_view"));

// 크루 밖 대상 거절 — C는 비크루 외부인
const vr3 = await api(C.token, "POST", "/rest/v1/rpc/view_record", { p_target_id: A.id });
check("크루 밖 not_crew 거절", vr3.status >= 400 && JSON.stringify(vr3.json).includes("not_crew"));

// ── 정리: 픽스처 크루·계정 제거 — 잔여물은 0017 닉네임 유니크와 충돌하고 DB에 쌓인다 ──
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (SERVICE) {
  const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  // groups.owner_id는 cascade가 아니므로 크루를 유저보다 먼저 지운다
  await fetch(`${URL_}/rest/v1/groups?id=eq.${group.id}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
  for (const u of [A, B, C]) {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (!res.ok) console.log(`정리 실패(${u.id.slice(0, 8)}): ${res.status}`);
  }
  console.log("픽스처 정리 완료");
} else {
  console.log("SUPABASE_SERVICE_ROLE_KEY 없음 — 픽스처 정리 생략");
}

console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
process.exit(failed === 0 ? 0 : 1);
