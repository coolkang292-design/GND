// 0015+0066+0102 검증: 예정표 본인 CRUD, 날짜 제약, 타인 차단,
// 프로그램 메타데이터 추가 뒤 기존 일반 예정표 회귀.
// ⚠️ 0102로 "하루 한 계획" 제약이 사라졌다. 같은 날 여러 계획과
//    "옮겨도 원래 계획이 안 지워진다"가 이제 이 파일의 핵심 단언이다.
// 실행(PowerShell): $env:GND_ALLOW_DB_TESTS='workout-plan';
//   node scripts/workout-plan-test.mjs; Remove-Item Env:GND_ALLOW_DB_TESTS
// 사전조건: 0015와 0066 마이그레이션이 적용되어 있어야 한다.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeleteGuard } from "./_safe-delete.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worktreeMarker = `${sep}.worktrees${sep}`;
const markerIndex = repoRoot.indexOf(worktreeMarker);
const mainRepoRoot = markerIndex === -1 ? null : repoRoot.slice(0, markerIndex);
const envPath = [
  resolve(repoRoot, ".env.local"),
  mainRepoRoot && resolve(mainRepoRoot, ".env.local"),
].find((candidate) => candidate && existsSync(candidate));
if (!envPath) throw new Error(".env.local을 찾을 수 없습니다");
if (process.env.GND_ALLOW_DB_TESTS !== "workout-plan") {
  throw new Error(
    "DB 검사는 GND_ALLOW_DB_TESTS=workout-plan 명시 승인값이 필요합니다",
  );
}

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
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
const EXPECTED_PROJECT_REF = "cjdskubyxlnojwzhwbfx";
let projectHost;
try {
  projectHost = new globalThis.URL(URL).hostname;
} catch {
  throw new Error("Supabase URL 형식이 올바르지 않습니다");
}
if (projectHost !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error("승인된 GND Supabase 프로젝트가 아니므로 실행을 중단합니다");
}
// 삭제 가드 — 실행 시작 시점에 있던 계정은 절대 지우지 않는다.
const _guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });
const guardProbe = _guard.reasonToRefuse("00000000-0000-4000-8000-000000000001");
if (guardProbe?.includes("스냅샷")) {
  throw new Error("기존 계정 스냅샷을 못 읽어 테스트 계정을 만들지 않습니다");
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
    body: JSON.stringify({ data: { codex_test: "codex/dev workout plan" } }),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  _guard.register(json.user.id);
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
  const scheduledAt = "2099-01-10T10:00:00.000Z";
  const created = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: date1,
    exercises,
    title: "codex/dev 일반 예정표 회귀",
    scheduled_at: scheduledAt,
  });
  const planId = created.json?.[0]?.id;
  check("본인 예정표 생성", created.status === 201 && Boolean(planId), JSON.stringify(created));
  check(
    "0066 선택 메타데이터가 일반 예정표와 호환",
    created.json?.[0]?.title === "codex/dev 일반 예정표 회귀" &&
      Date.parse(created.json?.[0]?.scheduled_at) === Date.parse(scheduledAt) &&
      created.json?.[0]?.program_enrollment_id === null &&
      created.json?.[0]?.program_week === null &&
      created.json?.[0]?.program_session === null &&
      created.json?.[0]?.program_template_version === null,
    JSON.stringify(created),
  );

  const spoofedProgramMeta = await api(
    userA.token,
    "PATCH",
    `/rest/v1/workout_plans?id=eq.${planId}`,
    { program_week: 1, program_session: 1, program_template_version: 1 },
  );
  check(
    "일반 예정표의 프로그램 메타데이터 위조 차단",
    spoofedProgramMeta.status >= 400,
    JSON.stringify(spoofedProgramMeta),
  );

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

  /*
    0102: 하루 1계획 제약(`workout_plans_user_id_plan_date_key`, 0015)을 없앴다.

    ⚠️ 옛 단언은 "같은 날 두 번째 계획은 409"였다. 그 길은 이제 없다 —
       그대로 두면 **정상 동작을 회귀로 신고한다**(2026-09-04에 실제로 그랬다).

    ⚠️ "201이 왔는가"만 보면 안 된다. 저장이 통째로 망가져 0행이 되어도
       201은 올 수 있다. **그날 계획이 정확히 2개인지 센다** — 개수를 세는
       단언만이 "제약이 되살아났다"와 "저장이 죽었다"를 둘 다 잡는다.
  */
  const duplicate = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: date1,
    exercises,
  });
  const duplicateId = duplicate.json?.[0]?.id;
  const sameDayPlans = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?user_id=eq.${userA.id}&plan_date=eq.${date1}&select=id`,
  );
  check(
    "0102 같은 날짜에 계획을 하나 더 담는다 — 그날 계획이 2개",
    duplicate.status === 201 &&
      sameDayPlans.status === 200 &&
      sameDayPlans.json?.length === 2 &&
      sameDayPlans.json.some((row) => row.id === planId) &&
      sameDayPlans.json.some((row) => row.id === duplicateId),
    JSON.stringify({ duplicate, sameDayPlans }),
  );

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
  const secondId = second.json?.[0]?.id;
  check(
    "이동 충돌용 두 번째 예정표 생성",
    second.status === 201 && typeof secondId === "string",
    JSON.stringify(second),
  );

  /*
    0102: 옮겨 갈 날짜에 계획이 있어도 **막지 않고, 지우지도 않는다.**

    옛 단언 셋(`plan_date_taken` 차단 · null도 차단 · replace면 교체)은 모두
    "하루 한 계획"을 전제한 것이라 통째로 뒤집었다. `p_replace`는 인자만
    남고 아무 일도 하지 않으므로 **false·null·true 셋의 결과가 같아야 한다.**

    ⚠️ 여기서 진짜 지켜야 하는 것은 "옮겨졌는가"가 아니라 **"원래 있던
       계획이 안 지워졌는가"** 다. 옛 함수는 `p_replace`면 대상 행을
       `delete` 했다 — 그 삭제가 되살아나면 사용자의 다른 계획이 조용히
       사라진다. 그래서 옮긴 행이 아니라 **피해자 행을 조회해서** 확인한다.
  */
  const movedOntoTaken = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date2, p_replace: false },
  );
  const afterTakenMove = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?user_id=eq.${userA.id}&plan_date=eq.${date2}&select=id`,
  );
  check(
    "0102 확인 없이도 계획 있는 날짜로 옮긴다 — 그날 계획이 2개",
    movedOntoTaken.status === 200 &&
      movedOntoTaken.json?.plan_date === date2 &&
      afterTakenMove.json?.length === 2 &&
      afterTakenMove.json.some((row) => row.id === planId) &&
      afterTakenMove.json.some((row) => row.id === secondId),
    JSON.stringify({ movedOntoTaken, afterTakenMove }),
  );

  // date1에는 위에서 만든 중복 계획이 아직 있다. 되돌려 놓으면 date1도 다시 2개다.
  const nullMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date1, p_replace: null },
  );
  const afterNullMove = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?user_id=eq.${userA.id}&plan_date=eq.${date1}&select=id`,
  );
  check(
    "0102 p_replace=null도 똑같이 옮긴다 — 되돌아온 날 계획이 2개",
    nullMove.status === 200 &&
      nullMove.json?.plan_date === date1 &&
      afterNullMove.json?.length === 2 &&
      afterNullMove.json.some((row) => row.id === planId) &&
      afterNullMove.json.some((row) => row.id === duplicateId),
    JSON.stringify({ nullMove, afterNullMove }),
  );

  const replacedMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    { p_plan_id: planId, p_target_date: date2, p_replace: true },
  );
  const victim = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${secondId}&select=id,plan_date`,
  );
  check(
    "0102 p_replace=true가 더는 대상 계획을 지우지 않는다 — 원래 있던 계획이 그 날짜에 그대로",
    replacedMove.status === 200 &&
      replacedMove.json?.plan_date === date2 &&
      replacedMove.json?.title === "codex/dev 일반 예정표 회귀" &&
      replacedMove.json?.scheduled_at === null &&
      victim.json?.length === 1 &&
      victim.json[0]?.plan_date === date2,
    JSON.stringify({ replacedMove, victim }),
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
  let authCleanupSucceeded = 0;
  for (const user of [userA, userB]) {
    if (!user) continue;
    const refusal = _guard.reasonToRefuse(user.id);
    if (refusal) {
      console.error(`FAIL service-role 정리 거부 ${user.id} - ${refusal}`);
      failed++;
      continue;
    }
    const rowCleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/workout_plans?user_id=eq.${user.id}`,
    );
    if (![200, 204].includes(rowCleanup.status)) {
      console.error(`FAIL service-role 행 정리 - ${JSON.stringify(rowCleanup)}`);
      failed++;
    }

    const authCleanup = await deleteAuthUser(user.id);
    if (authCleanup.ok) {
      authCleanupSucceeded++;
      console.log(`CLEANUP PASS 이번 실행 생성 계정 ${authCleanupSucceeded}개 정리`);
    } else {
      const detail = authCleanup.refused
        ? `거부=${authCleanup.refused}`
        : `HTTP=${authCleanup.status ?? "unknown"}`;
      console.error(`FAIL 테스트 계정 정리 ${user.id} - ${detail}`);
      failed++;
    }
  }
  const expectedAuthCleanup = [userA, userB].filter(Boolean).length;
  console.log(
    `CLEANUP ${authCleanupSucceeded}/${expectedAuthCleanup} 이번 실행 생성 계정 정리`,
  );
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
