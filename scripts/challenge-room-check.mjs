// 0042 검증: 챌린지 방 — 참가자·초대·수락·완전연결·자동시작·직접쓰기 차단.
// 실행: node scripts/challenge-room-check.mjs
// 사전조건: 0042가 적용되어 있어야 한다.
//
// 이 스크립트는 프로덕션 Supabase에 붙는다(스테이징 없음). 삭제는 반드시
// _safe-delete.mjs의 가드를 경유하고, 가드는 실행 시작 시점 스냅샷에 있는
// 계정을 절대 지우지 않는다.
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
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

// ⚠ 첫 anonUser()보다 앞에서 만든다. 뒤에서 만들면 이 실행의 픽스처까지
//   "기존 계정"으로 잡혀 정리가 통째로 거부된다 (rls-test.mjs에서 실제로 겪음).
const guard = await createDeleteGuard({ url: URL, serviceKey: SERVICE_KEY });

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;
/** 이 실행이 만든 그룹 id — 유저보다 먼저 지워야 한다 (owner_id는 cascade 아님). */
const createdGroups = [];

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
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
    json = await res.json();
  } catch {
    // 본문 없는 응답
  }
  return { status: res.status, json };
}

const rpc = (token, name, args) =>
  api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});

const hasCode = (r, code) =>
  r.status >= 400 && JSON.stringify(r.json ?? {}).includes(code);

/** 기간 운동 RPC가 앱 파서에 필요한 중첩 모양으로 픽스처를 돌려주는지 확인한다. */
const hasFixtureWorkout = (rows, userId, completedAt) => {
  const expectedCompletedAt = new Date(completedAt).getTime();
  return Array.isArray(rows) && rows.some((row) =>
    row?.user_id === userId &&
    new Date(row.completed_at).getTime() === expectedCompletedAt &&
    row.tabata_minutes === null &&
    Array.isArray(row.workout_exercises) &&
    row.workout_exercises.some((exercise) =>
      exercise?.exercise_type === "weight" &&
      exercise.exercise_name === "벤치프레스" &&
      exercise.body_part === "가슴" &&
      Array.isArray(exercise.workout_sets) &&
      exercise.workout_sets.some((set) =>
        set?.weight_kg === 60 &&
        set.reps === 10 &&
        set.distance_meters === null &&
        set.duration_seconds === null &&
        set.is_completed === true
      )
    )
  );
};

async function anonUser(tag) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`익명 가입 실패(${tag}): ${JSON.stringify(json)}`);
  }
  const user = {
    id: json.user.id,
    token: json.access_token,
    nickname: `방${RUN}${tag}`,
  };
  const created = await api(user.token, "POST", "/rest/v1/profiles", {
    id: user.id,
    nickname: user.nickname,
    avatar_url: "🏆",
    weekly_goal: 3,
  });
  if (created.status >= 400) {
    throw new Error(`프로필 생성 실패(${tag}): ${JSON.stringify(created.json)}`);
  }
  guard.register(user.id);
  return user;
}

/** KST 날짜 (SQL의 (now() at time zone 'Asia/Seoul')::date와 같은 값). */
const kstDay = (offsetMs = 0) =>
  new Date(Date.now() + 9 * 3_600_000 + offsetMs).toISOString().slice(0, 10);

/** 참가자 행 — service_role로 RLS를 우회해 실제 상태를 본다. */
async function participants(challengeId) {
  const r = await api(
    SERVICE_KEY,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${challengeId}&select=user_id,role,status`,
  );
  // PostgREST는 오류 시 배열이 아니라 에러 객체를 준다. 그대로 .some()을
  // 부르면 "ps.some is not a function"으로 실행이 통째로 죽는다.
  return Array.isArray(r.json) ? r.json : [];
}

/** 목표 하나 심기 — service_role로 setup RLS를 우회해 픽스처만 만든다. */
const seedGoal = (challengeId, groupId, userId) =>
  api(SERVICE_KEY, "POST", "/rest/v1/user_goals", {
    user_id: userId,
    challenge_id: challengeId,
    group_id: groupId,
    goal_type: "weight_days",
    target_value: 12,
    unit: "일",
    planned_days: 5,
    qualifier: 3,
  });

try {
  const a = await anonUser("a"); // 방장
  const b = await anonUser("b"); // 초대받아 수락
  const c = await anonUser("c"); // 초대받아 수락 (b와 서로 크루가 아님)
  const d = await anonUser("d"); // 초대 안 받은 외부인

  // 픽스처: 그룹 (0042 단계에서 challenges.group_id가 아직 not null)
  const g = await rpc(a.token, "create_group", { p_name: `방테스트-${RUN}` });
  const groupId = (Array.isArray(g.json) ? g.json[0] : g.json)?.id;
  if (groupId) createdGroups.push(groupId);
  check("픽스처: 그룹 생성", Boolean(groupId), JSON.stringify(g.json));

  // ── 생성 ──
  // 자동 종료 뒤에도 아래 완료 운동이 챌린지 기간 안에 남도록 시작일을 어제로 둔다.
  const start = kstDay(-86_400_000);
  const end = kstDay(29 * 86_400_000);
  let r = await rpc(a.token, "create_challenge_room", {
    p_name: `9월 챌린지-${RUN}`,
    p_start_date: start,
    p_end_date: end,
    p_photo_required: false,
  });
  const chId = r.json?.id;
  check("[1] 생성 성공", r.status === 200 && Boolean(chId), JSON.stringify(r.json));

  let ps = await participants(chId);
  check(
    "[2] 방장이 host·joined로 들어간다",
    ps.length === 1 &&
      ps[0].user_id === a.id &&
      ps[0].role === "host" &&
      ps[0].status === "joined",
    JSON.stringify(ps),
  );

  r = await rpc(a.token, "create_challenge_room", {
    p_name: "역순기간",
    p_start_date: end,
    p_end_date: start,
    p_photo_required: false,
  });
  check("[3] 시작일 > 종료일은 invalid_period", hasCode(r, "invalid_period"));

  // ── 초대 ──
  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: b.id });
  check("[4] 초대 성공", r.status === 200 && r.json?.status === "invited", JSON.stringify(r.json));

  ps = await participants(chId);
  check(
    "[5] invited 행이 생긴다",
    ps.some((p) => p.user_id === b.id && p.status === "invited"),
    JSON.stringify(ps),
  );

  const inv = await api(
    b.token,
    "GET",
    "/rest/v1/notifications?type=eq.challenge_invite&select=reference_id",
  );
  check("[6] challenge_invite 알림 도달", (inv.json ?? []).length === 1, JSON.stringify(inv.json));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: b.id });
  check("[7] 중복 초대는 already_invited", hasCode(r, "already_invited"));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: a.id });
  check("[8] 자기 자신 초대는 self_invite", hasCode(r, "self_invite"));

  r = await rpc(b.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  check("[9] 방장 아닌 사람의 초대는 not_host", hasCode(r, "not_host"));

  // ── 수락 · 챌린지 참가와 크루 관계 분리 ──
  r = await rpc(b.token, "accept_challenge_invite", { p_challenge_id: chId });
  check(
    "[10] 수락 → joined, crewLinked 0",
    r.json?.status === "joined" && r.json?.crewLinked === 0,
    JSON.stringify(r.json),
  );

  const linksB = await api(
    SERVICE_KEY,
    "GET",
    `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${b.id},user_b.eq.${b.id})`,
  );
  check(
    "[11] b가 포함된 crew_links는 0건",
    linksB.status === 200 && Array.isArray(linksB.json) && linksB.json.length === 0,
    JSON.stringify(linksB.json),
  );

  await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: c.id });
  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check(
    "[12] 두 번째 수락도 joined, crewLinked 0",
    r.json?.status === "joined" && r.json?.crewLinked === 0,
    JSON.stringify(r.json),
  );

  const linksC = await api(
    SERVICE_KEY,
    "GET",
    `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${c.id},user_b.eq.${c.id})`,
  );
  check(
    "[13] c가 포함된 crew_links는 0건",
    linksC.status === 200 && Array.isArray(linksC.json) && linksC.json.length === 0,
    JSON.stringify(linksC.json),
  );

  // service_role로 기간 안의 완료 운동을 만든다. 각 단계의 id를 확인해 빈 픽스처가
  // 아래 RPC 단언을 가짜로 통과시키지 못하게 한다.
  const fixtureSession = await api(SERVICE_KEY, "POST", "/rest/v1/workout_sessions", {
    user_id: a.id,
    group_id: groupId,
    status: "completed",
    started_at: `${start}T02:00:00Z`,
    completed_at: `${start}T03:00:00Z`,
    visibility: "group",
    timezone: "Asia/Seoul",
  });
  const fixtureSessionId = fixtureSession.json?.[0]?.id;
  if (!fixtureSessionId) {
    throw new Error(`완료 운동 픽스처 생성 실패: ${JSON.stringify(fixtureSession.json)}`);
  }

  const fixtureExercise = await api(SERVICE_KEY, "POST", "/rest/v1/workout_exercises", {
    session_id: fixtureSessionId,
    exercise_name: "벤치프레스",
    exercise_type: "weight",
    body_part: "가슴",
    sort_order: 0,
  });
  const fixtureExerciseId = fixtureExercise.json?.[0]?.id;
  if (!fixtureExerciseId) {
    throw new Error(`운동 종목 픽스처 생성 실패: ${JSON.stringify(fixtureExercise.json)}`);
  }

  const fixtureSet = await api(SERVICE_KEY, "POST", "/rest/v1/workout_sets", {
    workout_exercise_id: fixtureExerciseId,
    set_number: 1,
    weight_kg: 60,
    reps: 10,
    is_completed: true,
  });
  const fixtureSetId = fixtureSet.json?.[0]?.id;
  if (!fixtureSetId) {
    throw new Error(`운동 세트 픽스처 생성 실패: ${JSON.stringify(fixtureSet.json)}`);
  }

  const bProfiles = await rpc(b.token, "get_challenge_participant_profiles", {
    p_challenge_id: chId,
  });
  check(
    "[13a] 정식 참가자 b는 참가자 프로필 3명을 읽는다",
    bProfiles.status === 200 && Array.isArray(bProfiles.json) && bProfiles.json.length === 3,
    `${bProfiles.status} ${JSON.stringify(bProfiles.json)}`,
  );

  const bPeriodSessions = await rpc(b.token, "get_challenge_period_sessions", {
    p_challenge_id: chId,
  });
  check(
    "[13b] 정식 참가자 b는 RPC로 a의 기간 운동을 읽는다",
    bPeriodSessions.status === 200 &&
      hasFixtureWorkout(bPeriodSessions.json, a.id, `${start}T03:00:00Z`),
    `${bPeriodSessions.status} ${JSON.stringify(bPeriodSessions.json)}`,
  );

  const bDirectSession = await api(
    b.token,
    "GET",
    `/rest/v1/workout_sessions?id=eq.${fixtureSessionId}&select=id`,
  );
  check(
    "[13c] 원본 workout_sessions는 b에게 계속 숨겨진다",
    bDirectSession.status === 200 &&
      Array.isArray(bDirectSession.json) &&
      bDirectSession.json.length === 0,
    `${bDirectSession.status} ${JSON.stringify(bDirectSession.json)}`,
  );

  const bReaction = await api(b.token, "POST", "/rest/v1/reactions", {
    session_id: fixtureSessionId,
    user_id: b.id,
    reaction_type: "fire",
  });
  const bReactionRows = await api(
    SERVICE_KEY,
    "GET",
    `/rest/v1/reactions?session_id=eq.${fixtureSessionId}&user_id=eq.${b.id}&select=id`,
  );
  check(
    "[13d] 챌린지 관계만으로 원본 세션에 반응할 수 없다",
    bReaction.status === 403 &&
      bReaction.json?.code === "42501" &&
      bReactionRows.status === 200 &&
      Array.isArray(bReactionRows.json) &&
      bReactionRows.json.length === 0,
    `POST ${bReaction.status} ${JSON.stringify(bReaction.json)} / GET ${bReactionRows.status} ${JSON.stringify(bReactionRows.json)}`,
  );

  const servicePeriodSessions = await rpc(SERVICE_KEY, "get_challenge_period_sessions", {
    p_challenge_id: chId,
  });
  check(
    "[13e] service_role도 a의 기간 운동을 읽는다",
    servicePeriodSessions.status === 200 &&
      hasFixtureWorkout(servicePeriodSessions.json, a.id, `${start}T03:00:00Z`),
    `${servicePeriodSessions.status} ${JSON.stringify(servicePeriodSessions.json)}`,
  );

  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[14] 재수락은 already_joined", hasCode(r, "already_joined"));

  r = await rpc(d.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[15] 초대 안 받은 사람은 not_invited", hasCode(r, "not_invited"));

  // ── 거절 ──
  await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  const invitedProfiles = await rpc(d.token, "get_challenge_participant_profiles", {
    p_challenge_id: chId,
  });
  check(
    "[15a] invited 상태는 참가자 프로필을 읽지 못한다",
    invitedProfiles.status === 200 &&
      Array.isArray(invitedProfiles.json) &&
      invitedProfiles.json.length === 0,
    `${invitedProfiles.status} ${JSON.stringify(invitedProfiles.json)}`,
  );

  const invitedPeriodSessions = await rpc(d.token, "get_challenge_period_sessions", {
    p_challenge_id: chId,
  });
  check(
    "[15b] invited 상태는 기간 운동 RPC가 challenge_not_found",
    hasCode(invitedPeriodSessions, "challenge_not_found"),
    `${invitedPeriodSessions.status} ${JSON.stringify(invitedPeriodSessions.json)}`,
  );

  r = await rpc(d.token, "decline_challenge_invite", { p_challenge_id: chId });
  check("[16] 거절 성공", r.json?.status === "declined", JSON.stringify(r.json));
  ps = await participants(chId);
  check("[17] 거절하면 행이 사라진다", !ps.some((p) => p.user_id === d.id), JSON.stringify(ps));

  const outsiderProfiles = await rpc(d.token, "get_challenge_participant_profiles", {
    p_challenge_id: chId,
  });
  check(
    "[17a] 거절한 outsider는 참가자 프로필을 읽지 못한다",
    outsiderProfiles.status === 200 &&
      Array.isArray(outsiderProfiles.json) &&
      outsiderProfiles.json.length === 0,
    `${outsiderProfiles.status} ${JSON.stringify(outsiderProfiles.json)}`,
  );

  // ── RLS ──
  const seen = await api(
    d.token,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&select=user_id`,
  );
  check(
    "[18] 비참가자는 참가자 목록을 못 읽는다",
    (seen.json ?? []).length === 0,
    JSON.stringify(seen.json),
  );

  const seenB = await api(
    b.token,
    "GET",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&select=user_id`,
  );
  check("[19] 참가자는 목록을 읽는다", (seenB.json ?? []).length === 3, JSON.stringify(seenB.json));

  const direct = await api(d.token, "POST", "/rest/v1/challenge_participants", {
    challenge_id: chId,
    user_id: d.id,
    role: "member",
    status: "joined",
  });
  check("[20] 직접 insert 차단", direct.status >= 400, `${direct.status}`);

  // ── 동시 챌린지 ──
  // 0044가 challenges_one_live를 드롭했다. 이제 두 번째 챌린지가 만들어져야
  // 한다 — 이 단언이 그 마이그레이션의 본체다. 0042·0043 시절엔 정반대였다.
  r = await rpc(a.token, "create_challenge_room", {
    p_name: `두번째-${RUN}`,
    p_start_date: start,
    p_end_date: end,
  });
  check(
    "[21] 0044부터 두 번째 챌린지를 만들 수 있다 (challenges_one_live 드롭)",
    r.status === 200 && Boolean(r.json?.id),
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  const secondId = r.json?.id;

  // 목록에 둘 다 오는가 — 화면의 "둘 다 보인다"에 대응하는 데이터 쪽 근거다.
  // ⚠ getMyChallenges와 **같은 방식으로** user_id를 걸어 조회한다. RLS는 내가
  //   낀 챌린지의 참가자 행을 전부 열어 주므로(명단 조회에 필요), 필터 없이
  //   조회하면 참가자 N명짜리 챌린지 하나가 N개로 보인다. 2026-07-31에 실제로
  //   그 상태로 배포됐고 화면에 같은 챌린지가 3개 떴다.
  const mine = await api(
    a.token,
    "GET",
    `/rest/v1/challenge_participants?select=challenge_id,role,status&user_id=eq.${a.id}`,
  );
  const myRows = Array.isArray(mine.json) ? mine.json : [];
  const myIds = myRows.map((p) => p.challenge_id);
  check(
    "[21b] 내 참가 목록에 두 챌린지가 모두 있다",
    myIds.includes(chId) && myIds.includes(secondId),
    `chId=${chId} second=${secondId} 목록=${JSON.stringify(myIds)}`,
  );
  check(
    "[21b-2] 내 목록에 챌린지당 정확히 1행 (참가자 수만큼 중복되지 않는다)",
    myIds.length === new Set(myIds).size && myIds.length === 2,
    `${myIds.length}행 · 고유 ${new Set(myIds).size}개 — ${JSON.stringify(myRows)}`,
  );

  // 필터를 빼면 실제로 늘어나는지 확인해, 위 단언이 공허하지 않음을 보인다.
  const unfiltered = await api(
    a.token,
    "GET",
    "/rest/v1/challenge_participants?select=challenge_id",
  );
  const unfilteredRows = Array.isArray(unfiltered.json) ? unfiltered.json : [];
  check(
    "[21b-3] user_id 필터를 빼면 남의 참가자 행까지 온다 (필터가 필수인 이유)",
    unfilteredRows.length > myRows.length,
    `필터 없음 ${unfilteredRows.length}행 vs 내 것 ${myRows.length}행 — 같으면 RLS 전제가 바뀐 것이니 주석을 갱신하라`,
  );

  const hostRow = myRows.find((p) => p.challenge_id === secondId);
  check(
    "[21c] 두 번째 챌린지에도 생성자가 host·joined로 들어간다",
    hostRow?.role === "host" && hostRow?.status === "joined",
    JSON.stringify(hostRow),
  );

  // 앱 목록 검증이 끝난 뒤 두 번째 챌린지를 취소하고, 취소된 방의 전용
  // 조회가 닫히는지 확인한다. 취소를 먼저 하면 앱은 그 방을 목록에서 제외하므로
  // 위 [21b]가 실제 화면 목록의 근거가 될 수 없다.
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/challenges?id=eq.${secondId}`,
    { status: "cancelled" },
    "return=minimal",
  );
  const cancelledProfiles = await rpc(a.token, "get_challenge_participant_profiles", {
    p_challenge_id: secondId,
  });
  check(
    "[21a] cancelled 챌린지는 방장도 참가자 프로필을 읽지 못한다",
    cancelledProfiles.status === 200 &&
      Array.isArray(cancelledProfiles.json) &&
      cancelledProfiles.json.length === 0,
    `${cancelledProfiles.status} ${JSON.stringify(cancelledProfiles.json)}`,
  );

  const cancelledPeriodSessions = await rpc(a.token, "get_challenge_period_sessions", {
    p_challenge_id: secondId,
  });
  check(
    "[21a-2] cancelled 챌린지는 기간 운동 RPC가 challenge_not_found",
    hasCode(cancelledPeriodSessions, "challenge_not_found"),
    `${cancelledPeriodSessions.status} ${JSON.stringify(cancelledPeriodSessions.json)}`,
  );

  // ── 자동 시작 ──
  // 시작일을 어제로 당겨 도래분으로 만든다.
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/challenges?id=eq.${chId}`,
    { start_date: kstDay(-86_400_000) },
    "return=minimal",
  );
  // a·b만 목표를 세운다 — c는 목표 없이 두고 dropped 되는지 본다.
  await seedGoal(chId, groupId, a.id);
  await seedGoal(chId, groupId, b.id);

  r = await rpc(a.token, "autostart_due_challenges", {});
  check("[22] 자동 시작 1건", r.json?.started === 1, JSON.stringify(r.json));

  const ch = await api(SERVICE_KEY, "GET", `/rest/v1/challenges?id=eq.${chId}&select=status`);
  check("[23] status가 active", ch.json?.[0]?.status === "active", JSON.stringify(ch.json));

  ps = await participants(chId);
  check(
    "[24] 목표 없는 참가자는 dropped (행은 남는다)",
    ps.find((p) => p.user_id === c.id)?.status === "dropped",
    JSON.stringify(ps),
  );
  check(
    "[25] 목표 있는 참가자는 joined 유지",
    ps.filter((p) => p.status === "joined").length === 2,
    JSON.stringify(ps),
  );

  const droppedPeriodSessions = await rpc(c.token, "get_challenge_period_sessions", {
    p_challenge_id: chId,
  });
  check(
    "[25a] dropped 참가자 c는 기간 운동 RPC를 읽는다",
    droppedPeriodSessions.status === 200 &&
      hasFixtureWorkout(droppedPeriodSessions.json, a.id, `${start}T03:00:00Z`),
    `${droppedPeriodSessions.status} ${JSON.stringify(droppedPeriodSessions.json)}`,
  );

  r = await rpc(a.token, "autostart_due_challenges", {});
  check("[26] 두 번 호출해도 결과 같음 (멱등)", r.json?.started === 0, JSON.stringify(r.json));

  r = await rpc(c.token, "accept_challenge_invite", { p_challenge_id: chId });
  check("[27] active 챌린지는 수락 불가 (중도 합류 차단)", hasCode(r, "invalid_status"));

  r = await rpc(a.token, "invite_to_challenge", { p_challenge_id: chId, p_target_id: d.id });
  check("[28] active 챌린지는 초대 불가", hasCode(r, "invalid_status"));

  // ── 자동 종료 ──
  await api(
    SERVICE_KEY,
    "PATCH",
    `/rest/v1/challenges?id=eq.${chId}`,
    { end_date: kstDay(-86_400_000) },
    "return=minimal",
  );
  r = await rpc(a.token, "autofinalize_due_challenges", {});
  check("[29] 자동 종료 1건", r.json?.ended === 1, JSON.stringify(r.json));

  const endedPeriodSessions = await rpc(b.token, "get_challenge_period_sessions", {
    p_challenge_id: chId,
  });
  check(
    "[29a] ended 챌린지에서도 b는 a의 기간 운동을 읽는다",
    endedPeriodSessions.status === 200 &&
      hasFixtureWorkout(endedPeriodSessions.json, a.id, `${start}T03:00:00Z`),
    `${endedPeriodSessions.status} ${JSON.stringify(endedPeriodSessions.json)}`,
  );

  r = await rpc(a.token, "autofinalize_due_challenges", {});
  check("[30] 두 번 호출해도 결과 같음 (멱등)", r.json?.ended === 0, JSON.stringify(r.json));

  // ── 백필 재실행 안전성 준비 ──
  await api(
    SERVICE_KEY,
    "DELETE",
    `/rest/v1/challenge_participants?challenge_id=eq.${chId}&user_id=eq.${b.id}`,
    undefined,
    "return=minimal",
  );
  const afterDel = await participants(chId);
  check(
    "[31] 부분 삭제 상태를 만들 수 있다 (백필 재실행 검증 준비)",
    afterDel.length === 2,
    JSON.stringify(afterDel),
  );
  console.log(
    "\n  ⚠ [32] 백필 재실행(부분 실패 복구·dropped 미부활)은 이 스크립트가 검증하지 않는다.",
  );
  console.log("     스크립트가 자기 마이그레이션을 다시 실행할 수 없기 때문이다.");
  console.log("     계획서 Task 7 Step 4의 수동 절차를 반드시 수행할 것.");
} catch (e) {
  console.error("\n실행 중단:", e.message);
  failed++;
} finally {
  // ⚠ 그룹을 유저보다 먼저 지운다. groups.owner_id는 on delete cascade가
  //   아니라서, 그룹이 남아 있으면 그 방장 계정 삭제가 500으로 실패하고
  //   테스트 계정이 프로덕션 auth에 떠돌이로 남는다 (rls-test.mjs:524 참조).
  for (const gid of createdGroups) {
    await api(SERVICE_KEY, "DELETE", `/rest/v1/groups?id=eq.${gid}`, undefined, "return=minimal");
  }
  // ⚠ 정리만 한다. process.exit을 여기 두면 try에서 올라오던 예외를 삼켜,
  //   아무것도 검증 못 한 실행이 exit 0으로 "정상"이라 보고된다.
  await guard.cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
