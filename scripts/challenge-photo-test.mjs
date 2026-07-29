// 0014 검증: 기존 행 보존용 컬럼 + 새 챌린지 사진 필수 + 사진 세션 집계.
// 실행: node scripts/challenge-photo-test.mjs
// 사전조건: 0014_challenge_photo_required.sql이 적용되어 있어야 한다.
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

async function api(token, method, path, body) {
  const service = token === SERVICE_KEY;
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    // DELETE처럼 응답 본문이 없는 경우가 있다.
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
  if (!json.access_token) {
    throw new Error(`익명 가입 실패: ${JSON.stringify(json)}`);
  }
  return { id: json.user.id, token: json.access_token };
}

const fakeJpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
]);

async function storagePut(token, path) {
  const response = await fetch(`${URL}/storage/v1/object/workout-images/${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
    },
    body: fakeJpeg,
  });
  return response.status;
}

async function storageDelete(token, path) {
  const service = token === SERVICE_KEY;
  const response = await fetch(`${URL}/storage/v1/object/workout-images/${path}`, {
    method: "DELETE",
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  return response.status;
}

const deleteAuthUser = (userId) => _guard.deleteIfCreatedThisRun(userId);

async function completedSession(user, groupId, onCreated) {
  const draft = await api(user.token, "POST", "/rest/v1/workout_sessions", {
    user_id: user.id,
    group_id: groupId,
    timezone: "Asia/Seoul",
  });
  const session = draft.json?.[0];
  if (draft.status !== 201 || !session?.id) {
    throw new Error(`세션 생성 실패: ${JSON.stringify(draft)}`);
  }
  onCreated(session.id);

  const started = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/start_workout",
    { p_session_id: session.id },
  );
  if (started.status !== 200) {
    throw new Error(`세션 시작 실패: ${JSON.stringify(started)}`);
  }

  const completed = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/complete_workout",
    { p_session_id: session.id },
  );
  if (completed.status !== 200) {
    throw new Error(`세션 완료 실패: ${JSON.stringify(completed)}`);
  }
  return session.id;
}

const BASE_SELECT =
  "user_id, completed_at, workout_exercises(exercise_type, exercise_name, body_part, workout_sets(weight_kg, reps, distance_meters, duration_seconds, is_completed))";

async function sessions(user, groupId, ids, photoRequired, includeId = false) {
  const select =
    (includeId ? `id, ${BASE_SELECT}` : BASE_SELECT) +
    (photoRequired ? ", workout_images!inner(image_path)" : "");
  const path =
    `/rest/v1/workout_sessions?select=${encodeURIComponent(select)}` +
    `&group_id=eq.${groupId}&id=in.(${ids.join(",")})` +
    "&status=eq.completed&deleted_at=is.null";
  return api(user.token, "GET", path);
}

let user = null;
let groupId = null;
let challengeIds = [];
let sessionIds = [];
let imagePath = null;

try {
  console.log("-- 0014 challenge photo verification --");
  user = await anonUser();

  const profile = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: `사진검증_${Date.now()}`,
    weekly_goal: 3,
  });
  if (profile.status !== 201) {
    throw new Error(`프로필 생성 실패: ${JSON.stringify(profile)}`);
  }

  const group = await api(user.token, "POST", "/rest/v1/rpc/create_group", {
    p_name: `사진검증크루_${Date.now()}`,
  });
  groupId = group.json?.id;
  if (group.status !== 200 || !groupId) {
    throw new Error(`크루 생성 실패: ${JSON.stringify(group)}`);
  }

  const dates = { start_date: "2026-01-01", end_date: "2026-01-28" };

  const defaultChallenge = await api(
    user.token,
    "POST",
    "/rest/v1/challenges",
    { group_id: groupId, name: "기본값 검증", ...dates },
  );
  const defaultId = defaultChallenge.json?.[0]?.id;
  if (defaultId) challengeIds.push(defaultId);
  check(
    "새 챌린지 기본값은 photo_required=true",
    defaultChallenge.status === 201 && defaultChallenge.json?.[0]?.photo_required === true,
    JSON.stringify(defaultChallenge),
  );
  if (defaultId) {
    const cleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/challenges?id=eq.${defaultId}`,
    );
    if (cleanup.status < 200 || cleanup.status >= 300) {
      throw new Error(`기본값 챌린지 정리 실패: ${JSON.stringify(cleanup)}`);
    }
    challengeIds = challengeIds.filter((id) => id !== defaultId);
  }

  const falseChallenge = await api(
    user.token,
    "POST",
    "/rest/v1/challenges",
    { group_id: groupId, name: "우회 검증", photo_required: false, ...dates },
  );
  const falseId = falseChallenge.json?.[0]?.id;
  if (falseId) challengeIds.push(falseId);
  check(
    "photo_required=false 직접 입력은 거부",
    falseChallenge.status === 401 || falseChallenge.status === 403,
    JSON.stringify(falseChallenge),
  );

  const trueChallenge = await api(
    user.token,
    "POST",
    "/rest/v1/challenges",
    { group_id: groupId, name: "사진 필수 검증", photo_required: true, ...dates },
  );
  const trueId = trueChallenge.json?.[0]?.id;
  if (trueId) challengeIds.push(trueId);
  check(
    "photo_required=true 챌린지 생성",
    trueChallenge.status === 201 && trueChallenge.json?.[0]?.photo_required === true,
    JSON.stringify(trueChallenge),
  );

  const trackSession = (id) => sessionIds.push(id);
  await completedSession(user, groupId, trackSession);
  const withPhoto = await completedSession(user, groupId, trackSession);

  const missingPath = `${user.id}/${withPhoto}/missing.jpg`;
  const fakeImage = await api(user.token, "POST", "/rest/v1/workout_images", {
    session_id: withPhoto,
    user_id: user.id,
    image_path: missingPath,
    source: "album",
  });
  check(
    "Storage 파일 없는 사진 행은 거부",
    fakeImage.status >= 400,
    JSON.stringify(fakeImage),
  );

  imagePath = `${user.id}/${withPhoto}/challenge-photo-test.jpg`;
  const uploadStatus = await storagePut(user.token, imagePath);
  if (uploadStatus !== 200) {
    throw new Error(`사진 업로드 실패: status=${uploadStatus}`);
  }

  const image = await api(user.token, "POST", "/rest/v1/workout_images", {
    session_id: withPhoto,
    user_id: user.id,
    image_path: imagePath,
    source: "album",
  });
  const verification = await api(
    user.token,
    "POST",
    "/rest/v1/rpc/set_workout_verification",
    { p_session_id: withPhoto, p_source: "album" },
  );
  check(
    "실제 업로드 후 사진 행과 인증 처리 성공",
    image.status === 201 &&
      verification.status === 200 &&
      verification.json?.verification_status === "photo_uploaded",
    JSON.stringify({ image, verification }),
  );

  const blockedDeleteStatus = await storageDelete(user.token, imagePath);
  check(
    "사진 행이 연결된 Storage 파일 삭제는 거부",
    blockedDeleteStatus >= 400,
    `status=${blockedDeleteStatus}`,
  );

  const allRows = await sessions(user, groupId, sessionIds, false, true);
  const photoRows = await sessions(user, groupId, sessionIds, true, true);
  check(
    "사진 필터는 사진 있는 세션만 반환",
    allRows.status === 200 &&
      allRows.json?.length === 2 &&
      photoRows.status === 200 &&
      photoRows.json?.length === 1 &&
      photoRows.json?.[0]?.id === withPhoto,
    JSON.stringify({ allRows, photoRows }),
  );

  const appAllRows = await sessions(user, groupId, sessionIds, false);
  const appPhotoRows = await sessions(user, groupId, sessionIds, true);
  check(
    "앱 집계 select도 on/off 행 수가 일치",
    appAllRows.status === 200 &&
      appAllRows.json?.length === 2 &&
      appPhotoRows.status === 200 &&
      appPhotoRows.json?.length === 1,
    JSON.stringify({ appAllRows, appPhotoRows }),
  );
} catch (error) {
  failed++;
  console.error(`FAIL 실행 중단 - ${error instanceof Error ? error.message : error}`);
} finally {
  if (sessionIds.length > 0) {
    const cleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/workout_sessions?id=in.(${sessionIds.join(",")})`,
    );
    if (cleanup.status < 200 || cleanup.status >= 300) {
      failed++;
      console.error(`FAIL 세션 정리 실패 - ${JSON.stringify(cleanup)}`);
    }
  }
  if (imagePath) {
    const status = await storageDelete(SERVICE_KEY, imagePath);
    if (status < 200 || status >= 300) {
      failed++;
      console.error(`FAIL Storage 정리 실패 - status=${status}`);
    }
  }
  if (challengeIds.length > 0) {
    const cleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/challenges?id=in.(${challengeIds.join(",")})`,
    );
    if (cleanup.status < 200 || cleanup.status >= 300) {
      failed++;
      console.error(`FAIL 챌린지 정리 실패 - ${JSON.stringify(cleanup)}`);
    }
  }
  if (groupId) {
    const cleanup = await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${groupId}`);
    if (cleanup.status < 200 || cleanup.status >= 300) {
      failed++;
      console.error(`FAIL 크루 정리 실패 - ${JSON.stringify(cleanup)}`);
    }
  }
  if (user?.id) {
    const profileCleanup = await api(
      SERVICE_KEY,
      "DELETE",
      `/rest/v1/profiles?id=eq.${user.id}`,
    );
    if (profileCleanup.status < 200 || profileCleanup.status >= 300) {
      failed++;
      console.error(`FAIL 프로필 정리 실패 - ${JSON.stringify(profileCleanup)}`);
    }
    const authStatus = await deleteAuthUser(user.id);
    if (authStatus < 200 || authStatus >= 300) {
      failed++;
      console.error(`FAIL 익명 계정 정리 실패 - status=${authStatus}`);
    }
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
