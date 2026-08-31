// RLS 2인 픽스처 테스트 (§19) — 익명 유저 A·B를 만들어 경계를 검증한다.
// 실행: node scripts/rls-test.mjs  (사전조건: 0001~0004 마이그레이션 적용됨)
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
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

// 삭제 가드 — 실행 시작 시점에 있던 계정은 절대 지우지 않는다.
// ⚠ 반드시 첫 anonUser()보다 **앞에서** 만들어야 한다. 뒤에서 만들면 이 실행이
//   만든 픽스처까지 "기존 계정"으로 잡혀 정리가 통째로 거부된다.
const _guard = await createDeleteGuard({
  url: URL_,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
});

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
  // 0094: 익명은 크루 요청·초대 발행·챌린지 생성이 막힌다. 실사용자는 온보딩에서
  //       카카오·구글을 먼저 거치므로 **정식 계정이 정상 상태**다.
  json.access_token = await makePermanent(json);
  return { token: json.access_token, id: json.user.id };
}

// 중간에 죽어도 픽스처를 지우기 위해 여기서 선언하고 finally에서 정리한다.
// 2026-07-30에 익명 가입 rate limit(429)으로 실행이 끊기며 계정이 남았다.
let A;
let B;
let C;
let group;

try {

console.log("── 픽스처 생성: 익명 유저 A, B ──");
A = await anonUser();
B = await anonUser();
console.log(`  A=${A.id.slice(0, 8)}… B=${B.id.slice(0, 8)}…`);

// A: 프로필 + 크루 생성
const pA = await api(A.token, "POST", "/rest/v1/profiles", {
  id: A.id, nickname: `유저A-${Date.now().toString(36)}`, avatar_url: "🧔", weekly_goal: 3,
});
check("A가 본인 프로필 생성", pA.status === 201, JSON.stringify(pA.json));

const gA = await api(A.token, "POST", "/rest/v1/rpc/create_group", { p_name: "RLS테스트크루" });
group = gA.json;
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
C = await anonUser(); // 비크루 외부인

// 0044부터 챌린지 생성은 create_challenge_room RPC뿐이다. 직접 insert로 만들면
// challenge_participants에 host 행이 안 생기고, 0046부터 시작·동의·확정이 전부
// is_challenge_participant를 보므로 그 챌린지는 challenge_not_found로 아무것도
// 못 한다. 앱도 이 RPC만 부른다(createChallenge는 0044에서 삭제).
const chIns = await api(A.token, "POST", "/rest/v1/rpc/create_challenge_room", {
  p_name: "RLS 챌린지", p_start_date: "2026-07-01", p_end_date: "2026-07-14",
});
const challenge = chIns.json;
check("A가 챌린지 생성 (기본 setup)", chIns.status === 200 && challenge?.status === "setup", JSON.stringify(chIns.json));

// B를 참가자로 만든다. 0046부터 "전원"의 뜻이 그룹 멤버가 아니라 참가자다 —
// 초대·수락이 없으면 B는 게이트 대상에 안 들어와 아래 2인 동의 시나리오가
// 성립하지 않는다.
const chInv = await api(A.token, "POST", "/rest/v1/rpc/invite_to_challenge", {
  p_challenge_id: challenge.id, p_target_id: B.id,
});
check("A가 B를 챌린지에 초대", chInv.status === 200, JSON.stringify(chInv.json));
const chAcc = await api(B.token, "POST", "/rest/v1/rpc/accept_challenge_invite", {
  p_challenge_id: challenge.id,
});
check("B가 수락 → 참가자 2명", chAcc.status === 200, JSON.stringify(chAcc.json));

// 0044가 challenges_one_live를 드롭했다. 같은 그룹에 살아있는 챌린지가 여러 개
// 있을 수 있는 것이 이제 정상이다 — 여러 챌린지 동시 진행이 이 개편의 목적이다.
// (직접 insert 경로다. RPC 경로는 challenge-room-check.mjs [21]이 본다.)
// 이 챌린지는 픽스처 그룹에 딸려 있어 finally의 그룹 삭제로 함께 사라진다.
const chDup = await api(B.token, "POST", "/rest/v1/challenges", {
  group_id: group.id, name: "중복", start_date: "2026-07-01", end_date: "2026-07-14",
});
check("살아있는 챌린지 중복 생성 허용 (0044에서 개수 제한 해제)", chDup.status === 201, `${chDup.status} ${JSON.stringify(chDup.json)}`);

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

// 0025가 start_challenge에 "전원 목표 동의" 게이트를 더했다. KPI만 채우고
// 시작하려 하면 consent_incomplete로 막힌다.
const gateConsent = await api(A.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: challenge.id });
check(
  "전원 KPI 완료해도 동의 없으면 차단 (consent_incomplete)",
  gateConsent.status >= 400 && JSON.stringify(gateConsent.json).includes("consent_incomplete"),
  JSON.stringify(gateConsent.json),
);

// 동의 게이트의 세부(멱등·철회·위조 차단)는 challenge-consent-test.mjs 몫이다.
// 여기서는 게이트를 통과시켜 뒤따르는 RLS 단언 2개(시작 후 KPI 잠금·결과 확정)에
// 도달하는 것이 목적이다 — 2026-07-30까지 이 두 줄이 없어 그 2개가 원인 없이
// 연쇄 실패했다.
const apprA = await api(A.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: challenge.id });
check("A가 목표에 동의", apprA.status < 300, JSON.stringify(apprA.json));
const apprB = await api(B.token, "POST", "/rest/v1/rpc/approve_challenge_goals", { p_challenge_id: challenge.id });
check("B가 목표에 동의", apprB.status < 300, JSON.stringify(apprB.json));

const started2 = await api(B.token, "POST", "/rest/v1/rpc/start_challenge", { p_challenge_id: challenge.id });
check("전원 KPI·동의 완료 후 크루원이 시작 가능 → active", started2.status === 200 && started2.json?.status === "active", JSON.stringify(started2.json));

/*
  0090이 이 규칙을 바꿨다 — 되돌리지 마라.

  옛 규칙: active가 되면 목표를 한 글자도 못 고친다. `goals_update_own_setup`의
           `challenge_in_setup`이 막아서 PATCH가 **조용히 0행**이 됐다.
  현 규칙: **올리기만** 허용한다. 정책은 active에서도 UPDATE를 열고,
           BEFORE UPDATE 트리거(`enforce_goal_raise_only`)가 옛 값과 대조해
           낮추기를 `goal_lowered`로 막는다.

  왜 바뀌었나: 잘못 넣은 목표를 4주 내내 안고 가는 것이 문제였다. 그렇다고
  자유롭게 열면 막판에 목표를 낮춰 100%를 만들 수 있다(랭킹의 분모가 된다).

  ⚠️ 옛 단언은 "status<300 && 0행"이었다. 지금은 400 + `goal_lowered`가 나므로
     그대로 두면 **제품이 멀쩡한데 빨개진다.** 2026-09-01에 실제로 그랬다.
     차단 방식이 조용한 0행에서 명시적 예외로 **강해진** 것이지 약해진 게 아니다.
*/
const goalLower = await api(A.token, "PATCH", `/rest/v1/user_goals?id=eq.${goalA.json[0].id}`, { target_value: 1 });
check(
  "🎯 0090: 시작 후 목표 낮추기는 막힌다 (goal_lowered — 랭킹 분모 보호)",
  goalLower.status >= 400 && JSON.stringify(goalLower.json).includes("goal_lowered"),
  JSON.stringify(goalLower.json),
);

const goalRaise = await api(A.token, "PATCH", `/rest/v1/user_goals?id=eq.${goalA.json[0].id}`, { target_value: 6000 });
check(
  "🎯 0090: 시작 후 목표 올리기는 허용된다",
  goalRaise.status < 300 && (goalRaise.json ?? []).length === 1 && goalRaise.json[0].target_value === 6000,
  JSON.stringify(goalRaise.json),
);

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

// 0028이 "오늘 운동을 마친 사람만 찌를 수 있다"를 더했다(현행 0039:37).
// 이 스크립트에서 운동을 완료하는 건 A뿐이어서 B의 찌르기가 막혀 있었다.
// 세트는 필요 없다 — 게이트가 보는 건 status='completed'와 오늘 날짜뿐이다.
const pokeDraft = await api(B.token, "POST", "/rest/v1/workout_sessions", {
  user_id: B.id, group_id: group.id, timezone: "Asia/Seoul",
});
const pokeSession = pokeDraft.json?.[0];
await api(B.token, "POST", "/rest/v1/rpc/start_workout", { p_session_id: pokeSession.id });
const pokeDone = await api(B.token, "POST", "/rest/v1/rpc/complete_workout", { p_session_id: pokeSession.id });
check("찌르기 전제: B가 오늘 운동 완료 (0028 게이트)", pokeDone.status === 200, JSON.stringify(pokeDone.json));

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

// ── 나만의 루틴 (0056) ────────────────────────────────────────────
// 신규 계정은 레벨 1이므로 한도는 기본 3개다. 4번째가 트리거에 막혀야 한다.
const routineBody = (name) => ({
  name,
  exercises: [
    {
      name: "벤치프레스",
      bodyPart: "가슴",
      exerciseType: "weight",
      measure: null,
      isCustom: false,
      sets: [{ weightKg: 60, reps: 10, distanceKm: 0, durationMin: 0 }],
    },
  ],
});

const routineIds = [];
for (let i = 1; i <= 2; i++) {
  const res = await api(A.token, "POST", "/rest/v1/workout_routines", routineBody(`루틴${i}`));
  check(`A가 루틴 ${i}/3 저장 (레벨1 기본 슬롯)`, res.status === 201, `status=${res.status} ${JSON.stringify(res.json)}`);
  if (res.json?.[0]?.id) routineIds.push(res.json[0].id);
}

// ⚠ 이름 중복은 **한도에 걸리기 전에** 확인해야 한다. 슬롯 트리거가
//   before insert라 한도에 도달한 상태에서는 유니크 인덱스에 닿기도 전에
//   routine_slot_limit(400)으로 막혀, 유니크 제약을 전혀 검증하지 못한다.
//   (2026-08-02 첫 실행에서 실제로 409 대신 400이 와서 드러났다.)
const dupName = await api(A.token, "POST", "/rest/v1/workout_routines", routineBody("루틴1"));
check("같은 이름의 루틴은 거부(유니크)", dupName.status === 409, `status=${dupName.status} ${JSON.stringify(dupName.json)}`);

const third = await api(A.token, "POST", "/rest/v1/workout_routines", routineBody("루틴3"));
check("A가 루틴 3/3 저장 (레벨1 기본 슬롯)", third.status === 201, `status=${third.status} ${JSON.stringify(third.json)}`);
if (third.json?.[0]?.id) routineIds.push(third.json[0].id);

// ⚠ "3개까지 된다"만 보면 한도가 무한이어도 통과한다. 4번째가 **막히는지**가
//   이 단언의 핵심이다 (CLAUDE.md §테스트가 진짜 테스트인지 확인한다).
const overLimit = await api(A.token, "POST", "/rest/v1/workout_routines", routineBody("루틴4"));
check(
  "레벨1에서 4번째 루틴은 슬롯 한도로 거부",
  overLimit.status >= 400 && JSON.stringify(overLimit.json).includes("routine_slot_limit"),
  `status=${overLimit.status} ${JSON.stringify(overLimit.json)}`,
);

// ── 루틴 종목 교체 (2026-08-04) ───────────────────────────────────
// 신고 6d6bffac: 잘못된 종목이 든 루틴 3개로 한도를 채운 사용자가 새로 만들
// 수도, 종목을 고칠 수도 없이 갇혔다. 덮어쓰기는 UPDATE라 슬롯 트리거
// (`before insert`, 0056:116)를 안 타는 것이 요점이다.
//
// ⚠ 이 단언은 **한도가 꽉 찬 지금(3/3)** 돌려야 의미가 있다. 슬롯이 남은
//   상태에서 통과하는 것은 트리거를 전혀 검증하지 못한다. 트리거를 일부러
//   `before insert or update`로 바꾸면 여기서 routine_slot_limit(400)이 나야 한다.
const SWAPPED = [
  {
    name: "맨몸 스쿼트",
    bodyPart: "하체",
    exerciseType: "bodyweight",
    measure: "reps",
    isCustom: false,
    sets: [{ weightKg: 0, reps: 15, distanceKm: 0, durationMin: 0 }],
  },
];
if (routineIds[0]) {
  const swap = await api(
    A.token,
    "PATCH",
    `/rest/v1/workout_routines?id=eq.${routineIds[0]}&select=id,name,exercises`,
    { exercises: SWAPPED },
  );
  check(
    "슬롯이 꽉 차도 본인 루틴의 종목은 교체된다 (UPDATE는 슬롯 트리거를 안 탄다)",
    swap.status === 200 &&
      swap.json?.[0]?.exercises?.[0]?.name === "맨몸 스쿼트" &&
      swap.json?.[0]?.exercises?.[0]?.exerciseType === "bodyweight",
    `status=${swap.status} ${JSON.stringify(swap.json)}`,
  );

  const swapKeepsName = swap.json?.[0]?.name === "루틴1";
  check("종목만 바뀌고 루틴 이름은 그대로다", swapKeepsName, JSON.stringify(swap.json));

  const crewSwap = await api(
    B.token,
    "PATCH",
    `/rest/v1/workout_routines?id=eq.${routineIds[0]}&select=id`,
    { exercises: SWAPPED },
  );
  check(
    "B는 A의 루틴 종목을 교체할 수 없다",
    crewSwap.status < 300 && (crewSwap.json ?? []).length === 0,
    `status=${crewSwap.status} ${JSON.stringify(crewSwap.json)}`,
  );
}

const routineSelfSel = await api(A.token, "GET", "/rest/v1/workout_routines?select=id,name");
check("A는 본인 루틴 3개 조회", routineSelfSel.status === 200 && routineSelfSel.json.length === 3, JSON.stringify(routineSelfSel.json));

// B는 A와 같은 크루다 — 크루여도 루틴은 본인 전용이어야 한다
const routineCrewSel = await api(B.token, "GET", "/rest/v1/workout_routines?select=id,name");
check("크루원 B에게 A의 루틴은 보이지 않음", routineCrewSel.status === 200 && routineCrewSel.json.length === 0, JSON.stringify(routineCrewSel.json));

if (routineIds[0]) {
  const routineCrewUpd = await api(B.token, "PATCH", `/rest/v1/workout_routines?id=eq.${routineIds[0]}`, { name: "탈취루틴" });
  check("B는 A의 루틴 수정 불가", routineCrewUpd.status < 300 && (routineCrewUpd.json ?? []).length === 0, JSON.stringify(routineCrewUpd.json));

  const routineCrewDel = await api(B.token, "DELETE", `/rest/v1/workout_routines?id=eq.${routineIds[0]}`);
  const stillThere = await api(A.token, "GET", `/rest/v1/workout_routines?id=eq.${routineIds[0]}`);
  check("B는 A의 루틴 삭제 불가", stillThere.status === 200 && stillThere.json.length === 1, `del=${routineCrewDel.status}`);

  // 지운 자리에는 다시 저장할 수 있어야 한다 — 한도는 '누적'이 아니라 '현재 개수'다
  await api(A.token, "DELETE", `/rest/v1/workout_routines?id=eq.${routineIds[0]}`);
  const afterDelete = await api(A.token, "POST", "/rest/v1/workout_routines", routineBody("루틴4"));
  check("루틴을 지우면 슬롯이 다시 비어 저장된다", afterDelete.status === 201, `status=${afterDelete.status} ${JSON.stringify(afterDelete.json)}`);
}

} catch (e) {
  console.error("\n실행 중단:", e.message);
  failed++;
} finally {
  // ── 정리: 픽스처 크루·계정 제거 — 잔여물은 0017 닉네임 유니크와 충돌하고 DB에 쌓인다 ──
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (SERVICE) {
    const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    // ⚠ groups.owner_id는 on delete cascade가 아니므로 크루를 유저보다 먼저
    //   지운다. 남겨두면 방장 계정 삭제가 500으로 실패한다.
    if (group?.id) {
      await fetch(`${URL_}/rest/v1/groups?id=eq.${group.id}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
    }
    for (const u of [A, B, C]) {
      if (!u?.id) continue;
      const res = await _guard.deleteIfCreatedThisRun(u.id);
      if (!res.ok) console.log(`정리 실패(${u.id.slice(0, 8)}): ${res.status}`);
    }
    console.log("픽스처 정리 완료");
  } else {
    console.log("SUPABASE_SERVICE_ROLE_KEY 없음 — 픽스처 정리 생략");
  }
}

// ⚠ 요약과 exit는 finally 밖이다. 안에 두면 process.exit()이 즉시 종료하며
//   try에서 올라오던 예외를 삼켜, 아무것도 검증 못 한 실행이 exit 0으로
//   "정상"이라 보고된다.
console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed !== 0) process.exit(1);
