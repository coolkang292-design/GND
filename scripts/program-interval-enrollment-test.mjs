// 0070·0072·0073 검증: 인터벌 등록 · 그만두기 · 주당 횟수 2~5회를 실제로 해 본다.
// 실행(PowerShell): $env:GND_ALLOW_DB_TESTS='program-interval';
//   node scripts/program-interval-enrollment-test.mjs; Remove-Item Env:GND_ALLOW_DB_TESTS
// 사전조건: 0070~0073 적용 완료.
// 주의: 운영 Supabase에 연결된다. 만든 계정·행은 끝에서 스스로 지운다.
//
// 왜 필요한가. 단위 테스트는 payload 모양까지만 본다. **서버가 그 모양을
// 받아 주는지**는 여기서만 알 수 있다 — 특히 level_at_start의 테이블 check는
// insert가 일어나야 확인된다.
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
if (process.env.GND_ALLOW_DB_TESTS !== "program-interval") {
  throw new Error(
    "DB 검사는 GND_ALLOW_DB_TESTS=program-interval 명시 승인값이 필요합니다",
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

const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });
if (guard.reasonToRefuse("00000000-0000-4000-8000-000000000001")?.includes("스냅샷")) {
  throw new Error("기존 계정 스냅샷을 못 읽어 테스트 계정을 만들지 않습니다");
}

let passed = 0;
let failed = 0;
const users = [];

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
    body: JSON.stringify({ data: { codex_test: "claude/dev interval enrollment" } }),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  guard.register(json.user.id);
  const user = { id: json.user.id, token: json.access_token };
  users.push(user);
  return user;
}

const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
function nextMonday(minimumDaysAhead) {
  const date = addDays(new Date(), minimumDaysAhead);
  date.setUTCHours(0, 0, 0, 0);
  return addDays(date, (8 - date.getUTCDay()) % 7);
}

/** 인터벌 종목 — 처방이 **없다**. 20초/10초는 음원이 정한다 */
const intervalExercise = (name, bodyPart) => ({
  name,
  bodyPart,
  exerciseType: "bodyweight",
  measure: null,
  isCustom: false,
  sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 }],
});

// 보통(moderate) A회차 — 하체·밀기·코어·전신
const INTERVAL_EXERCISES = [
  intervalExercise("리버스 런지", "하체"),
  intervalExercise("푸시업", "가슴"),
  intervalExercise("마운틴 클라이머", "코어"),
  intervalExercise("점핑잭", "하체"),
];

/** 보통 난이도의 주차별 길이 (설계 §3.4) */
const MODERATE_MINUTES_BY_WEEK = [4, 4, 8, 8, 16, 16];

const preferredSlots = [
  { weekday: 1, time: "19:00" },
  { weekday: 3, time: "19:00" },
  { weekday: 5, time: "19:00" },
];

function buildIntervalPlans(firstMonday, mutate = (plan) => plan) {
  return Array.from({ length: 18 }, (_, index) => {
    const week = Math.floor(index / 3) + 1;
    const session = (index % 3) + 1;
    const offset = (week - 1) * 7 + [0, 2, 4][session - 1];
    const planDate = dateKey(addDays(firstMonday, offset));
    return mutate(
      {
        plan_date: planDate,
        scheduled_at: `${planDate}T10:00:00.000Z`, // Asia/Seoul 19:00
        week,
        session,
        template_key: ["A", "B", "C"][session - 1],
        title: `claude/dev 인터벌 ${week}주 ${session}회`,
        tabata_minutes: MODERATE_MINUTES_BY_WEEK[week - 1],
        exercises: INTERVAL_EXERCISES,
      },
      index,
    );
  });
}

function payload({ key, plans, level = "moderate" }) {
  return {
    p_program_key: key,
    p_program_version: 1,
    p_title_snapshot: "claude/dev 인터벌 검증",
    p_level_at_start: level,
    p_start_date: plans[0].plan_date,
    p_timezone: "Asia/Seoul",
    p_preferred_slots: preferredSlots,
    p_plans: plans,
  };
}

async function ownCounts(user) {
  const [enrollments, plans] = await Promise.all([
    api(user.token, "GET", "/rest/v1/program_enrollments?select=id"),
    api(user.token, "GET", "/rest/v1/workout_plans?select=id"),
  ]);
  return {
    enrollments: enrollments.json?.length ?? -1,
    plans: plans.json?.length ?? -1,
  };
}

async function expectRejectedAndRolledBack(user, name, body) {
  const before = await ownCounts(user);
  const response = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    body,
  );
  const after = await ownCounts(user);
  check(
    `${name} 거부와 전체 롤백`,
    response.status >= 400 &&
      after.enrollments === before.enrollments &&
      after.plans === before.plans,
    JSON.stringify({ status: response.status, message: response.json?.message, before, after }),
  );
  return response;
}

try {
  // ── ① 인터벌 18회가 실제로 등록된다 ────────────────────────
  const owner = await anonUser();
  const monday = nextMonday(7);
  const created = await api(
    owner.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    payload({ key: "interval-burn-6w", plans: buildIntervalPlans(monday) }),
  );
  check(
    "인터벌 18회 등록 성공",
    created.status === 200 && typeof created.json === "string",
    JSON.stringify(created),
  );

  if (created.status === 200) {
    // ② 난이도 moderate가 실제로 저장됐는가 — 테이블 check가 열렸다는 증거
    const enrollment = await api(
      owner.token,
      "GET",
      `/rest/v1/program_enrollments?select=level_at_start,program_key&id=eq.${created.json}`,
    );
    check(
      "level_at_start='moderate'가 저장된다",
      enrollment.json?.[0]?.level_at_start === "moderate",
      JSON.stringify(enrollment),
    );

    // ③ 주차가 길이를 올렸는가
    const plans = await api(
      owner.token,
      "GET",
      "/rest/v1/workout_plans?select=program_week,program_session,tabata_minutes,exercises&order=plan_date.asc",
    );
    const rows = plans.json ?? [];
    check("계획 18개가 담긴다", rows.length === 18, `${rows.length}개`);
    const byWeek = MODERATE_MINUTES_BY_WEEK.map((minutes, index) =>
      rows
        .filter((row) => row.program_week === index + 1)
        .every((row) => row.tabata_minutes === minutes),
    );
    check(
      "주차별 길이가 4·4·8·8·16·16이다",
      byWeek.every(Boolean),
      JSON.stringify(rows.map((r) => [r.program_week, r.tabata_minutes])),
    );
    check(
      "회차마다 종목 4개 · 세트 1개 · 처방 없음",
      rows.every(
        (row) =>
          row.exercises.length === 4 &&
          row.exercises.every(
            (item) => item.sets.length === 1 && item.prescription === undefined,
          ),
      ),
      JSON.stringify(rows[0]?.exercises?.[0]),
    );
  }

  // ── ④ 거부해야 하는 것들 ──────────────────────────────────
  const rejecter = await anonUser();
  const base = nextMonday(70);

  await expectRejectedAndRolledBack(
    rejecter,
    "음원에 없는 길이(5분)",
    payload({
      key: "interval-bad-minutes",
      plans: buildIntervalPlans(base, (plan) => ({ ...plan, tabata_minutes: 5 })),
    }),
  );

  await expectRejectedAndRolledBack(
    rejecter,
    "인터벌인데 종목 5개",
    payload({
      key: "interval-bad-count",
      plans: buildIntervalPlans(base, (plan) => ({
        ...plan,
        exercises: [...INTERVAL_EXERCISES, intervalExercise("버피", "코어")],
      })),
    }),
  );

  await expectRejectedAndRolledBack(
    rejecter,
    "근력과 인터벌이 섞인 등록",
    payload({
      key: "interval-mixed",
      plans: buildIntervalPlans(base, (plan, index) =>
        index === 0 ? { ...plan, tabata_minutes: null } : plan,
      ),
    }),
  );

  await expectRejectedAndRolledBack(
    rejecter,
    "없는 난이도",
    payload({
      key: "interval-bad-level",
      plans: buildIntervalPlans(base),
      level: "extreme",
    }),
  );

  // ── 0071 그만두기 ─────────────────────────────────────────
  const quitter = await anonUser();
  const quitMonday = nextMonday(140);
  const quitCreated = await api(
    quitter.token,
    "POST",
    "/rest/v1/rpc/create_program_enrollment",
    payload({ key: "interval-burn-6w", plans: buildIntervalPlans(quitMonday) }),
  );
  if (quitCreated.status !== 200) {
    check("그만두기 준비 등록", false, JSON.stringify(quitCreated));
  } else {
    const before = await ownCounts(quitter);
    const cancelled = await api(
      quitter.token,
      "POST",
      "/rest/v1/rpc/cancel_program_enrollment",
      { p_enrollment_id: quitCreated.json },
    );
    const after = await ownCounts(quitter);
    check(
      "그만두면 남은 계획 18개가 사라진다",
      cancelled.status === 200 &&
        cancelled.json === 18 &&
        before.plans === 18 &&
        after.plans === 0,
      JSON.stringify({ cancelled, before, after }),
    );

    const row = await api(
      quitter.token,
      "GET",
      `/rest/v1/program_enrollments?select=status&id=eq.${quitCreated.json}`,
    );
    check(
      "등록 행은 남고 상태만 cancelled가 된다",
      row.json?.[0]?.status === "cancelled",
      JSON.stringify(row),
    );

    const again = await api(
      quitter.token,
      "POST",
      "/rest/v1/rpc/cancel_program_enrollment",
      { p_enrollment_id: quitCreated.json },
    );
    check(
      "이미 그만둔 것을 또 그만둘 수 없다",
      again.status >= 400 && String(again.json?.message).includes("program_not_active"),
      JSON.stringify(again),
    );

    const reCreated = await api(
      quitter.token,
      "POST",
      "/rest/v1/rpc/create_program_enrollment",
      payload({
        key: "interval-burn-6w",
        plans: buildIntervalPlans(nextMonday(210)),
      }),
    );
    check(
      "그만둔 뒤에는 같은 프로그램을 다시 등록할 수 있다",
      reCreated.status === 200,
      JSON.stringify(reCreated),
    );

    const stranger = await anonUser();
    const stolen = await api(
      stranger.token,
      "POST",
      "/rest/v1/rpc/cancel_program_enrollment",
      { p_enrollment_id: quitCreated.json },
    );
    check(
      "남의 등록은 그만둘 수 없다",
      stolen.status >= 400 &&
        String(stolen.json?.message).includes("program_enrollment_not_found"),
      JSON.stringify(stolen),
    );
  }

  // ⑤ 근력은 그대로여야 한다 — 인터벌을 받으려다 근력을 느슨하게 만들지 않았는가
  await expectRejectedAndRolledBack(
    rejecter,
    "근력인데 처방 없음",
    payload({
      key: "strength-no-prescription",
      plans: buildIntervalPlans(base, (plan) => ({
        ...plan,
        tabata_minutes: null,
        exercises: [
          ...INTERVAL_EXERCISES,
          intervalExercise("버피", "코어"),
        ],
      })),
    }),
  );

  // ── 0073 주당 횟수 2~5회 ───────────────────────────────────
  // 총 18회는 그대로다. 주당 횟수는 며칠에 나눠 담을지만 정한다.
  const WEEKLY = [
    { label: "주 2회", weekdays: [1, 4], offsets: [0, 3] },
    { label: "주 5회", weekdays: [1, 2, 3, 4, 5], offsets: [0, 1, 2, 3, 4] },
  ];
  for (const shape of WEEKLY) {
    const user = await anonUser();
    const monday = nextMonday(7);
    const slots = shape.weekdays.map((weekday) => ({ weekday, time: "19:00" }));
    const plans = Array.from({ length: 18 }, (_, index) => {
      const cycle = shape.offsets.length;
      const offset =
        Math.floor(index / cycle) * 7 + shape.offsets[index % cycle];
      const planDate = dateKey(addDays(monday, offset));
      const week = Math.floor(index / 3) + 1;
      const session = (index % 3) + 1;
      return {
        plan_date: planDate,
        scheduled_at: planDate + "T10:00:00.000Z",
        week,
        session,
        template_key: ["A", "B", "C"][session - 1],
        title: "claude/dev " + shape.label,
        tabata_minutes: MODERATE_MINUTES_BY_WEEK[week - 1],
        exercises: INTERVAL_EXERCISES,
      };
    });
    const created = await api(
      user.token,
      "POST",
      "/rest/v1/rpc/create_program_enrollment",
      {
        p_program_key: "interval-burn-6w",
        p_program_version: 1,
        p_title_snapshot: "claude/dev " + shape.label,
        p_level_at_start: "moderate",
        p_start_date: plans[0].plan_date,
        p_timezone: "Asia/Seoul",
        p_preferred_slots: slots,
        p_plans: plans,
      },
    );
    const stored = await ownCounts(user);
    check(
      shape.label + "로 18회가 등록된다",
      created.status === 200 && stored.plans === 18,
      JSON.stringify({ message: created.json?.message, stored }),
    );
  }

  // 1회와 6회는 거부한다 — 6회 이상이면 한 주에 같은 회차를 세 번 한다
  const badShapes = await anonUser();
  for (const [label, weekdays] of [
    ["주 1회", [1]],
    ["주 6회", [0, 1, 2, 3, 4, 5]],
  ]) {
    const response = await api(
      badShapes.token,
      "POST",
      "/rest/v1/rpc/create_program_enrollment",
      {
        ...payload({ key: "interval-burn-6w", plans: buildIntervalPlans(nextMonday(280)) }),
        p_preferred_slots: weekdays.map((weekday) => ({ weekday, time: "19:00" })),
      },
    );
    check(
      label + "는 거부한다",
      response.status >= 400 &&
        String(response.json?.message).includes("program_slots_count"),
      JSON.stringify(response.json?.message),
    );
  }
} finally {
  for (const user of users) {
    await api(SERVICE_KEY, "DELETE", `/rest/v1/workout_plans?user_id=eq.${user.id}`);
    await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/program_enrollments?user_id=eq.${user.id}`,
    );
  }
  const cleanup = await guard.cleanup();
  if (cleanup.refused.length > 0) {
    console.error(`FAIL 계정 정리 거부 ${JSON.stringify(cleanup.refused)}`);
    failed += cleanup.refused.length;
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
