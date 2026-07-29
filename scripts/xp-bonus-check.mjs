// XP 보너스 검증: 기록 완성(+10)·인증사진(+10)
// 실행: node scripts/xp-bonus-check.mjs
// 사전조건: 0022·0023·0024 적용. 기록 보너스 케이스는 0027 적용 후에 통과한다.
//
// 왜 이 스크립트가 있나 (2026-07-26 조사):
//   설계 §5·6·8은 "유산소는 앱 필수값(시간) 충족 시 기록 완성 인정"이라고 못박았으나,
//   구현(0022→0023)은 완료 세트 전부에 reps를 요구했다. 유산소 세트는 reps가
//   원래 null이라, 웨이트를 아무리 꼼꼼히 기록해도 유산소 1세트가 섞이면 0점이 됐다.
//   실제 피해: 오뎅끼데스까 7/25 세션(웨이트 21세트 + 트레드밀 1세트) → 기록 0점.
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

const RUN = Date.now().toString(36).slice(-5);
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

async function anonUser(nick) {
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  const user = { token: json.access_token, id: json.user.id };
  await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: `${nick}-${RUN}`,
    weekly_goal: 3,
  });
  return user;
}

const deleteAuthUser = (userId) => _guard.deleteIfCreatedThisRun(userId);

/**
 * 인증사진 등록 — 앱과 같은 순서로 한다.
 * 0014 정책이 "Storage에 실제 파일이 있을 것"을 요구하므로 업로드가 먼저다.
 * 경로 규칙도 정책이 검사한다: {userId}/{sessionId}/{파일명}
 */
async function attachPhoto(user, sessionId) {
  const path = `${user.id}/${sessionId}/${Date.now()}.jpg`;
  const upload = await fetch(`${URL}/storage/v1/object/workout-images/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "image/jpeg",
    },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), // 최소 JPEG 바이트
  });
  if (!upload.ok) throw new Error("storage 업로드 실패: " + (await upload.text()));
  const row = await api(user.token, "POST", "/rest/v1/workout_images", {
    session_id: sessionId,
    user_id: user.id,
    image_path: path,
    source: "camera",
  });
  if (row.status >= 400) {
    throw new Error("사진 행 insert 실패: " + JSON.stringify(row.json));
  }
  return path;
}

/**
 * 종목·세트를 지정해 세션을 만들고 완료까지 간다.
 * exercises: [{ name, type, sets: [{weight_kg, reps, duration_seconds, distance_meters}] }]
 */
async function runWorkout(user, exercises) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    timezone: "Asia/Seoul",
    visibility: "private",
  });
  const session = draft.json?.[0];
  if (!session) throw new Error("세션 생성 실패: " + JSON.stringify(draft.json));

  for (const [i, ex] of exercises.entries()) {
    const created = await api(user.token, "POST", "/rest/v1/workout_exercises", {
      session_id: session.id,
      exercise_name: ex.name,
      exercise_type: ex.type,
      sort_order: i,
    });
    const exercise = created.json?.[0];
    for (const [j, set] of ex.sets.entries()) {
      await api(user.token, "POST", "/rest/v1/workout_sets", {
        workout_exercise_id: exercise.id,
        set_number: j + 1,
        weight_kg: set.weight_kg ?? null,
        reps: set.reps ?? null,
        duration_seconds: set.duration_seconds ?? null,
        distance_meters: set.distance_meters ?? null,
        is_completed: true,
      });
    }
  }

  await api(user.token, "POST", "/rest/v1/rpc/start_workout", {
    p_session_id: session.id,
  });
  const done = await api(user.token, "POST", "/rest/v1/rpc/complete_workout_v2", {
    p_session_id: session.id,
  });
  return { session, done };
}

const WEIGHT_SETS = [
  { weight_kg: 50, reps: 10 },
  { weight_kg: 50, reps: 10 },
  { weight_kg: 50, reps: 8 },
];

let users = [];

try {
  // ── 1) 유산소가 섞여도 기록 완성 +10 (0027 수정 대상) ──
  const u1 = await anonUser("bnA");
  users.push(u1);
  const mixed = await runWorkout(u1, [
    { name: "벤치프레스", type: "weight", sets: WEIGHT_SETS },
    {
      name: "트레드밀",
      type: "cardio",
      sets: [{ duration_seconds: 1920, distance_meters: 3700 }],
    },
  ]);
  check(
    "웨이트+유산소 혼합 → 기록 완성 10점",
    mixed.done.json?.breakdown?.recordXp === 10,
    `recordXp=${mixed.done.json?.breakdown?.recordXp} (유산소 세트의 reps=null 때문에 0이면 0027 미적용)`,
  );

  // ── 2) 순수 웨이트는 기존대로 10점 (회귀 방지) ──
  const u2 = await anonUser("bnB");
  users.push(u2);
  const weightOnly = await runWorkout(u2, [
    { name: "스쿼트", type: "weight", sets: WEIGHT_SETS },
  ]);
  check(
    "순수 웨이트(전 세트 reps) → 기록 완성 10점",
    weightOnly.done.json?.breakdown?.recordXp === 10,
    `recordXp=${weightOnly.done.json?.breakdown?.recordXp}`,
  );

  // ── 3) 실적이 전혀 없는 세트는 여전히 0점 (과다 지급 방지) ──
  const u3 = await anonUser("bnC");
  users.push(u3);
  const empty = await runWorkout(u3, [
    {
      name: "데드리프트",
      type: "weight",
      sets: [{ weight_kg: 60 }, { weight_kg: 60 }, { weight_kg: 60 }],
    },
  ]);
  check(
    "무게만 있고 횟수 없는 세트 → 기록 완성 0점",
    empty.done.json?.breakdown?.recordXp === 0,
    `recordXp=${empty.done.json?.breakdown?.recordXp}`,
  );

  // ── 4) 유산소 단독(거리·시간 기록) → 기록 완성 10점 ──
  const u4 = await anonUser("bnD");
  users.push(u4);
  const cardioOnly = await runWorkout(u4, [
    {
      name: "러닝",
      type: "cardio",
      sets: [{ duration_seconds: 1800, distance_meters: 5000 }],
    },
  ]);
  check(
    "유산소 단독(거리·시간 기록) → 기록 완성 10점",
    cardioOnly.done.json?.breakdown?.recordXp === 10,
    `recordXp=${cardioOnly.done.json?.breakdown?.recordXp}`,
  );

  // ── 5) 완료 후 사진 등록 → 사진 XP +10 (RPC 자체 동작) ──
  await attachPhoto(u2, weightOnly.session.id);
  const photoAward = await api(
    u2.token,
    "POST",
    "/rest/v1/rpc/award_workout_photo_xp",
    { p_session_id: weightOnly.session.id },
  );
  check(
    "완료 후 사진 등록 → 사진 XP 10점",
    photoAward.json?.awarded === true && photoAward.json?.xpAwarded === 10,
    JSON.stringify(photoAward.json),
  );

  // ── 6) 사진 XP는 멱등 (두 번 호출해도 한 번만) ──
  const again = await api(u2.token, "POST", "/rest/v1/rpc/award_workout_photo_xp", {
    p_session_id: weightOnly.session.id,
  });
  check(
    "사진 XP 재호출 → already_awarded",
    again.json?.awarded === false && again.json?.reason === "already_awarded",
    JSON.stringify(again.json),
  );
} finally {
  for (const u of users) await deleteAuthUser(u.id);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
