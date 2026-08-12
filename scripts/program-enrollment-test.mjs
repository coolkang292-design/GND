// 0066 검증: 공식 프로그램 18회 원자 등록, RLS, 충돌 롤백, 재배치.
// 실행(PowerShell): $env:GND_ALLOW_DB_TESTS='program-enrollment';
//   node scripts/program-enrollment-test.mjs; Remove-Item Env:GND_ALLOW_DB_TESTS
// 사전조건: 0066_official_program_enrollments.sql 적용 완료.
// 주의: 운영 Supabase에 연결되므로 SQL 적용 승인 전에는 실행하지 않는다.
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
if (process.env.GND_ALLOW_DB_TESTS !== "program-enrollment") {
  throw new Error(
    "DB 검사는 GND_ALLOW_DB_TESTS=program-enrollment 명시 승인값이 필요합니다",
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
const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });
const guardProbe = guard.reasonToRefuse("00000000-0000-4000-8000-000000000001");
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
    body: JSON.stringify({ data: { codex_test: "codex/dev program enrollment" } }),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  guard.register(json.user.id);
  return { id: json.user.id, token: json.access_token };
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextMonday(minimumDaysAhead) {
  const date = addDays(new Date(), minimumDaysAhead);
  date.setUTCHours(0, 0, 0, 0);
  const offset = (8 - date.getUTCDay()) % 7;
  return addDays(date, offset);
}

const exercise = (name, bodyPart) => ({
  name,
  bodyPart,
  exerciseType: "weight",
  measure: null,
  isCustom: false,
  sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 }],
  prescription: {
    repsMin: 8,
    repsMax: 10,
    targetRir: 2,
    restSeconds: 120,
    loadStepKg: 5,
  },
});

const exercises = [
  exercise("벤치프레스", "가슴"),
  exercise("시티드 로우", "등"),
  exercise("숄더프레스", "어깨"),
  exercise("레그프레스", "하체"),
  exercise("덤벨 컬", "팔"),
];

const preferredSlots = [
  { weekday: 1, time: "19:00" },
  { weekday: 3, time: "19:00" },
  { weekday: 5, time: "19:00" },
];

function buildPlans(firstMonday, title = "codex/dev 6주 검증") {
  return Array.from({ length: 18 }, (_, index) => {
    const week = Math.floor(index / 3) + 1;
    const session = (index % 3) + 1;
    const offset = (week - 1) * 7 + [0, 2, 4][session - 1];
    const planDate = dateKey(addDays(firstMonday, offset));
    return {
      plan_date: planDate,
      scheduled_at: `${planDate}T10:00:00.000Z`, // Asia/Seoul 19:00
      week,
      session,
      template_key: ["A", "B", "C"][session - 1],
      title: `${title} ${week}주 ${session}회`,
      exercises,
    };
  });
}

function enrollmentPayload({ key, title, plans }) {
  return {
    p_program_key: key,
    p_program_version: 1,
    p_title_snapshot: title,
    p_level_at_start: "beginner",
    p_start_date: plans[0].plan_date,
    p_timezone: "Asia/Seoul",
    p_preferred_slots: preferredSlots,
    p_plans: plans,
  };
}

const clone = (value) => structuredClone(value);

async function ownCounts(user) {
  const [enrollments, plans] = await Promise.all([
    api(user.token, "GET", "/rest/v1/program_enrollments?select=id"),
    api(user.token, "GET", "/rest/v1/workout_plans?select=id"),
  ]);
  if (enrollments.status !== 200 || plans.status !== 200) {
    throw new Error(`검사 전후 개수 조회 실패: ${JSON.stringify({ enrollments, plans })}`);
  }
  return { enrollments: enrollments.json.length, plans: plans.json.length };
}

async function expectAtomicCreateFailure({ user, name, key, slots, plans }) {
  const before = await ownCounts(user);
  const response = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    {
      ...enrollmentPayload({ key, title: `codex/dev ${name}`, plans }),
      p_preferred_slots: slots,
    },
  );
  const after = await ownCounts(user);
  check(
    `${name} 거부와 전체 롤백`,
    response.status >= 400 &&
      after.enrollments === before.enrollments &&
      after.plans === before.plans,
    JSON.stringify({ response, before, after }),
  );
}

async function planState(user, planIds) {
  const rows = await api(
    user.token,
    "GET",
    `/rest/v1/workout_plans?id=in.(${planIds.join(",")})&select=id,plan_date,scheduled_at&order=id.asc`,
  );
  if (rows.status !== 200) {
    throw new Error(`계획 상태 조회 실패: ${JSON.stringify(rows)}`);
  }
  return rows.json;
}

async function expectAtomicRescheduleFailure({
  user,
  enrollmentId,
  name,
  moves,
  watchedPlanIds,
  errorText,
}) {
  const before = await planState(user, watchedPlanIds);
  const response = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/reschedule_program_plans",
    { p_enrollment_id: enrollmentId, p_moves: moves },
  );
  const after = await planState(user, watchedPlanIds);
  check(
    `${name} 거부와 배치 전체 원복`,
    response.status >= 400 &&
      (!errorText || JSON.stringify(response.json).includes(errorText)) &&
      JSON.stringify(after) === JSON.stringify(before),
    JSON.stringify({ response, before, after }),
  );
}

let userA = null;
let userB = null;

try {
  console.log("-- 0066 official program enrollment verification --");
  userA = await anonUser();
  userB = await anonUser();

  const runId = Date.now().toString(36).slice(-6);
  for (const [user, suffix] of [[userA, "A"], [userB, "B"]]) {
    const profile = await api(user.token, "POST", "/rest/v1/profiles", {
      id: user.id,
      nickname: `프로그램${suffix}-${runId}`,
      weekly_goal: 3,
      timezone: "Asia/Seoul",
    });
    if (profile.status !== 201) {
      throw new Error(`프로필 실패: ${JSON.stringify(profile)}`);
    }
  }

  const malformedBase = buildPlans(nextMonday(60), "codex/dev malformed");
  const missingSlotKey = clone(preferredSlots);
  delete missingSlotKey[0].time;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 slot 키 누락",
    key: "codex-dev-malformed-slot",
    slots: missingSlotKey,
    plans: malformedBase,
  });

  const missingPlanKey = clone(malformedBase);
  delete missingPlanKey[0].title;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 plan 키 누락",
    key: "codex-dev-malformed-plan",
    slots: preferredSlots,
    plans: missingPlanKey,
  });

  const missingExerciseKey = clone(malformedBase);
  delete missingExerciseKey[0].exercises[0].measure;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 exercise 키 누락",
    key: "codex-dev-malformed-exercise",
    slots: preferredSlots,
    plans: missingExerciseKey,
  });

  const missingSetKey = clone(malformedBase);
  delete missingSetKey[0].exercises[0].sets[0].reps;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 set 키 누락",
    key: "codex-dev-malformed-set",
    slots: preferredSlots,
    plans: missingSetKey,
  });

  const missingPrescriptionKey = clone(malformedBase);
  delete missingPrescriptionKey[0].exercises[0].prescription.targetRir;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 prescription 키 누락",
    key: "codex-dev-malformed-prescription",
    slots: preferredSlots,
    plans: missingPrescriptionKey,
  });

  const nullPrescriptionValue = clone(malformedBase);
  nullPrescriptionValue[0].exercises[0].prescription.restSeconds = null;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 prescription 값 null",
    key: "codex-dev-malformed-null",
    slots: preferredSlots,
    plans: nullPrescriptionValue,
  });

  const nullTemplateKey = clone(malformedBase);
  nullTemplateKey[0].template_key = null;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 template_key 값 null",
    key: "codex-dev-malformed-template-null",
    slots: preferredSlots,
    plans: nullTemplateKey,
  });

  const nullBodyPart = clone(malformedBase);
  nullBodyPart[0].exercises[0].bodyPart = null;
  await expectAtomicCreateFailure({
    user: userB,
    name: "필수 bodyPart 값 null",
    key: "codex-dev-malformed-bodypart-null",
    slots: preferredSlots,
    plans: nullBodyPart,
  });

  const plansA = buildPlans(nextMonday(120), "codex/dev A");
  const createA = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    enrollmentPayload({
      key: "codex-dev-shoulder-6w",
      title: "codex/dev 어깨 프로그램",
      plans: plansA,
    }),
  );
  const enrollmentAId = typeof createA.json === "string" ? createA.json : null;
  const rowsA = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?program_enrollment_id=eq.${enrollmentAId}&order=program_week.asc,program_session.asc`,
  );
  check(
    "A는 18회 프로그램을 원자적으로 등록",
    createA.status === 200 && Boolean(enrollmentAId) && rowsA.json?.length === 18,
    JSON.stringify({ createA, rowCount: rowsA.json?.length }),
  );
  if (!enrollmentAId || rowsA.json?.length !== 18) {
    throw new Error("18회 원자 등록 준비 실패 — 뒤 단언을 중단합니다");
  }

  const bRows = await api(
    userB.token,
    "GET",
    `/rest/v1/program_enrollments?id=eq.${enrollmentAId}`,
  );
  check(
    "B에게 A enrollment가 보이지 않음",
    bRows.status === 200 && bRows.json?.length === 0,
    JSON.stringify(bRows),
  );

  const directEnrollment = await api(userA.token, "POST", "/rest/v1/program_enrollments", {
    user_id: userA.id,
    program_key: "codex-dev-direct-write",
    program_version: 1,
    title_snapshot: "codex/dev direct write",
    level_at_start: "beginner",
    start_date: plansA[0].plan_date,
    timezone: "Asia/Seoul",
    preferred_slots: preferredSlots,
  });
  check("enrollment 직접 쓰기 차단", directEnrollment.status >= 400, JSON.stringify(directEnrollment));

  const programPlan = rowsA.json?.[1];
  const directProgramUpdate = await api(
    userA.token,
    "PATCH",
    `/rest/v1/workout_plans?id=eq.${programPlan?.id}`,
    { plan_date: dateKey(addDays(new Date(`${programPlan?.plan_date}T00:00:00Z`), 1)) },
  );
  check(
    "프로그램 계획 직접 수정 차단",
    directProgramUpdate.status === 200 && directProgramUpdate.json?.length === 0,
    JSON.stringify(directProgramUpdate),
  );

  const spoofDate = dateKey(nextMonday(330));
  const directProgramInsert = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: spoofDate,
    exercises,
    title: "codex/dev 프로그램 메타 위조",
    scheduled_at: `${spoofDate}T10:00:00.000Z`,
    program_week: 1,
    program_session: 1,
    program_template_version: 1,
  });
  check("프로그램 계획 직접 생성 우회 차단", directProgramInsert.status >= 400, JSON.stringify(directProgramInsert));

  const ordinaryDate = dateKey(nextMonday(340));
  const ordinaryPlan = await api(userA.token, "POST", "/rest/v1/workout_plans", {
    user_id: userA.id,
    plan_date: ordinaryDate,
    exercises,
  });
  const ordinaryPlanId = ordinaryPlan.json?.[0]?.id;
  if (ordinaryPlan.status !== 201 || !ordinaryPlanId) {
    throw new Error(`일반 이동 예정표 준비 실패: ${JSON.stringify(ordinaryPlan)}`);
  }
  const replaceProgramPlan = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/move_workout_plan",
    {
      p_plan_id: ordinaryPlanId,
      p_target_date: rowsA.json[2].plan_date,
      p_replace: true,
    },
  );
  check(
    "일반 계획 이동 RPC가 프로그램 계획을 교체하지 못함",
    replaceProgramPlan.status >= 400 &&
      JSON.stringify(replaceProgramPlan.json).includes("program_plan_use_reschedule"),
    JSON.stringify(replaceProgramPlan),
  );

  const duplicate = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    enrollmentPayload({
      key: "codex-dev-shoulder-6w",
      title: "codex/dev 중복",
      plans: buildPlans(nextMonday(240), "codex/dev duplicate"),
    }),
  );
  check("같은 프로그램 active 중복 등록 거부", duplicate.status >= 400, JSON.stringify(duplicate));

  const secondProgramPlans = buildPlans(nextMonday(200), "codex/dev second program");
  const secondProgram = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    enrollmentPayload({
      key: "codex-dev-second-6w",
      title: "codex/dev 두 번째 프로그램",
      plans: secondProgramPlans,
    }),
  );
  if (secondProgram.status !== 200 || typeof secondProgram.json !== "string") {
    throw new Error(`두 번째 프로그램 준비 실패: ${JSON.stringify(secondProgram)}`);
  }

  const plansB = buildPlans(nextMonday(300), "codex/dev conflict");
  const conflictSeed = await api(userB.token, "POST", "/rest/v1/workout_plans", {
    user_id: userB.id,
    plan_date: plansB[4].plan_date,
    exercises,
  });
  if (conflictSeed.status !== 201) {
    throw new Error(`충돌 예정표 준비 실패: ${JSON.stringify(conflictSeed)}`);
  }
  const beforeEnrollments = await api(
    userB.token,
    "GET",
    "/rest/v1/program_enrollments?select=id",
  );
  const beforePlans = await api(userB.token, "GET", "/rest/v1/workout_plans?select=id");
  const conflict = await api(
    userB.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    enrollmentPayload({
      key: "codex-dev-conflict-6w",
      title: "codex/dev 충돌",
      plans: plansB,
    }),
  );
  const afterEnrollments = await api(
    userB.token,
    "GET",
    "/rest/v1/program_enrollments?select=id",
  );
  const afterPlans = await api(userB.token, "GET", "/rest/v1/workout_plans?select=id");
  check(
    "기존 계획 충돌이면 enrollment와 계획이 0개 생성",
    conflict.status >= 400 &&
      JSON.stringify(conflict.json).includes(`program_plan_date_taken:${plansB[4].plan_date}`) &&
      afterEnrollments.json?.length === beforeEnrollments.json?.length &&
      afterPlans.json?.length === beforePlans.json?.length,
    JSON.stringify({ conflict, beforeEnrollments, afterEnrollments, beforePlans, afterPlans }),
  );

  const swapLeft = rowsA.json[16];
  const swapRight = rowsA.json[17];
  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "두 회차 날짜 맞교환은 프로그램 순서를 깨므로",
    moves: [
      {
        plan_id: swapLeft.id,
        plan_date: swapRight.plan_date,
        scheduled_at: swapRight.scheduled_at,
      },
      {
        plan_id: swapRight.id,
        plan_date: swapLeft.plan_date,
        scheduled_at: swapLeft.scheduled_at,
      },
    ],
    watchedPlanIds: [swapLeft.id, swapRight.id],
    errorText: "program_recovery_gap",
  });

  const recoveryDate = dateKey(
    addDays(new Date(`${rowsA.json[14].plan_date}T00:00:00Z`), 1),
  );
  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "48시간 회복 간격 위반",
    moves: [{
      plan_id: rowsA.json[15].id,
      plan_date: recoveryDate,
      scheduled_at: `${recoveryDate}T10:00:00.000Z`,
    }],
    watchedPlanIds: [rowsA.json[15].id],
    errorText: "program_recovery_gap",
  });

  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "일반 계획 날짜 충돌",
    moves: [{
      plan_id: swapRight.id,
      plan_date: ordinaryDate,
      scheduled_at: `${ordinaryDate}T10:00:00.000Z`,
    }],
    watchedPlanIds: [swapRight.id],
    errorText: "program_plan_date_taken",
  });

  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "다른 프로그램 계획 날짜 충돌",
    moves: [{
      plan_id: swapRight.id,
      plan_date: secondProgramPlans[0].plan_date,
      scheduled_at: secondProgramPlans[0].scheduled_at,
    }],
    watchedPlanIds: [swapRight.id],
    errorText: "program_plan_date_taken",
  });

  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "과거 날짜",
    moves: [{
      plan_id: swapRight.id,
      plan_date: "2000-01-03",
      scheduled_at: "2000-01-03T10:00:00.000Z",
    }],
    watchedPlanIds: [swapRight.id],
    errorText: "program_invalid_plan_date",
  });

  const duplicateTarget = dateKey(
    addDays(new Date(`${swapRight.plan_date}T00:00:00Z`), 4),
  );
  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "중복 목표 날짜",
    moves: [swapLeft, swapRight].map((plan) => ({
      plan_id: plan.id,
      plan_date: duplicateTarget,
      scheduled_at: `${duplicateTarget}T10:00:00.000Z`,
    })),
    watchedPlanIds: [swapLeft.id, swapRight.id],
    errorText: "program_plan_date_duplicate",
  });

  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "scheduled_at 날짜 불일치",
    moves: [{
      plan_id: swapRight.id,
      plan_date: duplicateTarget,
      scheduled_at: `${dateKey(addDays(new Date(`${duplicateTarget}T00:00:00Z`), 1))}T10:00:00.000Z`,
    }],
    watchedPlanIds: [swapRight.id],
    errorText: "program_scheduled_date_mismatch",
  });

  const firstMoveDate = swapRight.plan_date;
  await expectAtomicRescheduleFailure({
    user: userA,
    enrollmentId: enrollmentAId,
    name: "배치 뒤 항목 실패 시 앞 항목",
    moves: [
      {
        plan_id: swapLeft.id,
        plan_date: firstMoveDate,
        scheduled_at: swapRight.scheduled_at,
      },
      {
        plan_id: "00000000-0000-4000-8000-000000000099",
        plan_date: duplicateTarget,
        scheduled_at: `${duplicateTarget}T10:00:00.000Z`,
      },
    ],
    watchedPlanIds: [swapLeft.id, swapRight.id],
    errorText: "program_plan_not_found",
  });

  // 첫 행은 둘째 행의 기존 날짜를 받고 둘째 행은 다음 회복일로 이동한다.
  // 두 이동 대상의 기존 날짜는 충돌 검사에서 제외되어야 하고, 임시 날짜 단계가
  // unique(user_id, plan_date)를 깨지 않으면서 둘 다 원자적으로 반영해야 한다.
  const chainRightDate = dateKey(
    addDays(new Date(`${swapRight.plan_date}T00:00:00Z`), 2),
  );
  const chainMove = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/reschedule_program_plans",
    {
      p_enrollment_id: enrollmentAId,
      p_moves: [
        {
          plan_id: swapLeft.id,
          plan_date: swapRight.plan_date,
          scheduled_at: swapRight.scheduled_at,
        },
        {
          plan_id: swapRight.id,
          plan_date: chainRightDate,
          scheduled_at: `${chainRightDate}T10:00:00.000Z`,
        },
      ],
    },
  );
  const chainAfter = await planState(userA, [swapLeft.id, swapRight.id]);
  const chainById = new Map(chainAfter.map((plan) => [plan.id, plan]));
  check(
    "두 행 연쇄 이동은 자기 enrollment 기존 날짜를 제외하고 원자 반영",
    (chainMove.status === 200 || chainMove.status === 204) &&
      chainById.get(swapLeft.id)?.plan_date === swapRight.plan_date &&
      chainById.get(swapRight.id)?.plan_date === chainRightDate,
    JSON.stringify({ chainMove, chainAfter }),
  );

  // 현재 앱은 예정표로 운동을 완료하면 그 예정표 행을 삭제한다. 삭제된 첫 회차를
  // 완료 회차로 보고, 남아 있는 마지막 회차만 옮겨 완료 회차가 되살아나지 않는지 본다.
  const completedPlan = rowsA.json?.[0];
  const completedDelete = await api(
    userA.token,
    "DELETE",
    `/rest/v1/workout_plans?id=eq.${completedPlan?.id}`,
  );
  if (completedDelete.status !== 200 || completedDelete.json?.length !== 1) {
    throw new Error(`완료 회차 준비 실패: ${JSON.stringify(completedDelete)}`);
  }
  const lastPlan = chainById.get(swapRight.id);
  const movedDate = dateKey(addDays(new Date(`${lastPlan.plan_date}T00:00:00Z`), 2));
  const movedAt = `${movedDate}T10:00:00.000Z`;
  const moved = await api(
    userA.token,
    "POST",
    "/rest/v1/rpc/reschedule_program_plans",
    {
      p_enrollment_id: enrollmentAId,
      p_moves: [{ plan_id: lastPlan.id, plan_date: movedDate, scheduled_at: movedAt }],
    },
  );
  const completedAfter = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${completedPlan.id}`,
  );
  const movedAfter = await api(
    userA.token,
    "GET",
    `/rest/v1/workout_plans?id=eq.${lastPlan.id}`,
  );
  check(
    "재배치는 완료 회차를 건드리지 않고 남은 날짜만 변경",
    (moved.status === 200 || moved.status === 204) &&
      completedAfter.json?.length === 0 &&
      movedAfter.json?.[0]?.plan_date === movedDate &&
      Date.parse(movedAfter.json?.[0]?.scheduled_at) === Date.parse(movedAt),
    JSON.stringify({ moved, completedAfter, movedAfter }),
  );

  const crossAccountMove = await api(
    userB.token,
    "POST",
    "/rest/v1/rpc/reschedule_program_plans",
    {
      p_enrollment_id: enrollmentAId,
      p_moves: [{ plan_id: lastPlan.id, plan_date: movedDate, scheduled_at: movedAt }],
    },
  );
  check("B는 A 프로그램을 재배치할 수 없음", crossAccountMove.status >= 400, JSON.stringify(crossAccountMove));
} finally {
  for (const user of [userA, userB]) {
    if (!user) continue;
    const refusal = guard.reasonToRefuse(user.id);
    if (refusal) {
      console.error(`FAIL service-role 정리 거부 ${user.id} - ${refusal}`);
      failed++;
      continue;
    }
    const planCleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/workout_plans?user_id=eq.${user.id}`,
    );
    const enrollmentCleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/program_enrollments?user_id=eq.${user.id}`,
    );
    if (![200, 204].includes(planCleanup.status) ||
        ![200, 204].includes(enrollmentCleanup.status)) {
      console.error(`FAIL service-role 행 정리 - ${JSON.stringify({ planCleanup, enrollmentCleanup })}`);
      failed++;
    }
  }
  const cleanup = await guard.cleanup();
  if (cleanup.refused.length > 0) failed += cleanup.refused.length;
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
