// 0015 검증: 예정표 본인 CRUD, 날짜 제약, 중복 교체, 타인 차단.
// 실행: node scripts/workout-plan-test.mjs
// 사전조건: 0015_workout_plans.sql이 적용되어 있어야 한다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

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

async function anonUser() {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  return { id: json.user.id, token: json.access_token };
}

const deleteAuthUser = (userId) => _guard.deleteIfCreatedThisRun(userId);

const exercises = [
  {
    name: "벤치프레스",
    bodyPart: "가슴",
    exerciseType: "weight",
    measure: null,
    isCustom: false,
    sets: [{ weightKg: 60, reps: 10, distanceKm: 0, durationMin: 0 }],
  },
];

let userA = null;
let userB = null;

try {
  console.log("-- 0015 workout plans verification --");
  userA = await anonUser();
  userB = await anonUser();

  for (const [user, nickname] of [[userA, "예정표A"], [userB, "예정표B"]]) {
    const profile = await api(user.token, "POST", "/rest/v1/profiles", {
      id: user.id,
      nickname: `${nickname}_${Date.now()}`,
      weekly_goal: 3,
      timezone: "Asia/Seoul",
    });
    if (profile.status !== 201) throw new Error(`프로필 실패: ${JSON.stringify(profile)}`);
  }

  const date1 = "2099-01-10";
  const date2 = "2099-01-11";
  const created = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: date1,
    exercises,
  });
  const planId = created.json?.[0]?.id;
  check("본인 예정표 생성", created.status === 201 && Boolean(planId), JSON.stringify(created));

  const ownRead = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${planId}`,
  );
  check("본인 예정표 조회", ownRead.status === 200 && ownRead.json?.length === 1);

  const hidden = await api(
    userB.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${planId}`,
  );
  check("타인 예정표 조회 차단", hidden.status === 200 && hidden.json?.length === 0);

  const impersonated = await api(userB.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: "2099-01-12",
    exercises,
  });
  check("타인 명의 생성 차단", impersonated.status >= 400, JSON.stringify(impersonated));

  const sourceSession = await api(userA.token, "POST", "/rest/v1/workout_sessions", {
    user_id: userA.id,
    timezone: "Asia/Seoul",
  });
  const sourceSessionId = sourceSession.json?.[0]?.id;
  if (!sourceSessionId) throw new Error(`원본 세션 실패: ${JSON.stringify(sourceSession)}`);
  const foreignSource = await api(userB.token, "POST", "/rest/v1/workout_plans", {
    user_id: userB.id,
    plan_date: "2099-01-13",
    source_session_id: sourceSessionId,
    exercises,
  });
  check("타인 세션을 복사 원본으로 지정 차단", foreignSource.status >= 400);

  const past = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: "2000-01-01",
    exercises,
  });
  check("과거 날짜 생성 차단", past.status >= 400, JSON.stringify(past));

  const duplicate = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: date1,
    exercises,
  });
  check("같은 날짜 직접 중복 차단", duplicate.status === 409, JSON.stringify(duplicate));

  const foreignUpdate = await api(
    userB.token,
    "PATCH",
    `/rest/v1/workout_plans?id=eq.${planId}`,
    { plan_date: "2099-01-14" },
  );
  check(
    "타인 예정표 직접 수정 차단",
    foreignUpdate.status === 200 && foreignUpdate.json?.length === 0,
  );

  const foreignMove = await api(
    userB.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: "2099-01-14", p_replace: true },
  );
  check(
    "타인 예정표 RPC 이동 차단",
    foreignMove.status >= 400 && JSON.stringify(foreignMove.json).includes("plan_not_found"),
    JSON.stringify(foreignMove),
  );

  const second = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: date2,
    exercises,
  });
  check("이동 충돌용 두 번째 예정표 생성", second.status === 201);

  const blockedMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date2, p_replace: false },
  );
  check(
    "기존 날짜로 확인 없는 이동 차단",
    blockedMove.status >= 400 && JSON.stringify(blockedMove.json).includes("plan_date_taken"),
    JSON.stringify(blockedMove),
  );

  const nullMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date2, p_replace: null },
  );
  check(
    "null 교체 값도 확인 없는 이동으로 차단",
    nullMove.status >= 400 && JSON.stringify(nullMove.json).includes("plan_date_taken"),
    JSON.stringify(nullMove),
  );

  const replacedMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date2, p_replace: true },
  );
  check(
    "확인한 이동은 대상 예정표를 교체",
    replacedMove.status === 200 && replacedMove.json?.plan_date === date2,
    JSON.stringify(replacedMove),
  );

  // ── 0059: 타바타 코스를 담은 예정표 ────────────────────────────
  // 지난 타바타를 복사하면 코스 분수가 계획에 같이 남아야 한다. 안 남으면
  // 그날 예정표를 열었을 때 음원도 코스도 없는 맨몸 운동 4개가 된다.
  const tabataDate = "2099-01-20";
  const tabataMoved = "2099-01-21";
  const tabataPlan = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: tabataDate,
    exercises,
    tabata_minutes: 8,
  });
  const tabataPlanId = tabataPlan.json?.[0]?.id;
  check(
    "타바타 예정표 생성 — 코스 분수가 저장된다",
    tabataPlan.status === 201 && tabataPlan.json?.[0]?.tabata_minutes === 8,
    JSON.stringify(tabataPlan),
  );

  const tabataRead = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${tabataPlanId}&select=tabata_minutes`,
  );
  check(
    "타바타 예정표 조회 — 8분이 그대로 돌아온다",
    tabataRead.status === 200 && tabataRead.json?.[0]?.tabata_minutes === 8,
    JSON.stringify(tabataRead),
  );

  // 음원이 없는 분수는 DB가 막는다 — 앱이 못 여는 계획이 생기면 안 된다.
  const badCourse = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: "2099-01-22",
    exercises,
    tabata_minutes: 5,
  });
  check(
    "없는 코스 분수(5분) 저장 차단",
    badCourse.status >= 400,
    JSON.stringify(badCourse),
  );

  // move_workout_plan은 `RETURNS workout_plans` 행타입이라 새 컬럼이 따라와야
  // 한다. 안 따라오면 날짜를 옮긴 순간 타바타 표식이 사라진다.
  const tabataMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: tabataPlanId, p_target_date: tabataMoved, p_replace: false },
  );
  check(
    "날짜를 옮겨도 타바타 표식이 유지된다",
    tabataMove.status === 200 &&
      tabataMove.json?.plan_date === tabataMoved &&
      tabataMove.json?.tabata_minutes === 8,
    JSON.stringify(tabataMove),
  );

  // 일반 계획으로 덮어쓰면 표식이 지워져야 한다 (upsert가 null을 명시한다).
  const overwritten = await api(
    userA.token,
    "PATCH",
    `/rest/v1/workout_plans?id=eq.${tabataPlanId}`,
    { tabata_minutes: null },
  );
  check(
    "일반 계획으로 덮어쓰면 타바타 표식이 지워진다",
    overwritten.status === 200 && overwritten.json?.[0]?.tabata_minutes === null,
    JSON.stringify(overwritten),
  );

  const otherDelete = await api(
    userB.token,
    "DELETE",
    `/rest/v1/workout_plans?id=eq.${planId}`,
  );
  check("타인 삭제 차단", otherDelete.status === 200 && otherDelete.json?.length === 0);

  const ownDelete = await api(
    userA.token,
    "DELETE",
    `/rest/v1/workout_plans?id=eq.${planId}`,
  );
  check("본인 예정표 삭제", ownDelete.status === 200 && ownDelete.json?.length === 1);
} finally {
  if (userA) await api(SERVICE_KEY, "DELETE", `/rest/v1/workout_plans?user_id=eq.${userA.id}`);
  if (userB) await api(SERVICE_KEY, "DELETE", `/rest/v1/workout_plans?user_id=eq.${userB.id}`);
  if (userA) await deleteAuthUser(userA.id);
  if (userB) await deleteAuthUser(userB.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
