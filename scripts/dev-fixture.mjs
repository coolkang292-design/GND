/**
 * 화면 단계 다계정 확인용 **상설 픽스처 계정** (사용자 결정 2026-08-01).
 *
 * 왜 필요한가: 회귀 스크립트(rls-test·poke-levelup-check·crew-link-check 등)는
 * 계정을 여러 개 만들어 상호작용을 검사하지만 전부 **HTTP/RPC 계층**이다.
 * `notifications`에 행이 생긴 것까지만 본다. 그게 **상대 화면의 알림 벨에 뜨는지**,
 * 찌르기 버튼이 쿨다운으로 잠기는지, 챌린지 성과 카드가 렌더되는지는 아무도 안 봤다.
 * 브라우저 프로필 두 개로 각각 로그인해서 눈으로 봐야 잡히는 것들이다.
 *
 * 익명 계정은 브라우저 컨텍스트를 지우면 사라져서 "그 계정으로 다시 로그인"이
 * 안 된다. 그래서 픽스처는 **이메일+비밀번호** 계정으로 만든다 — `/login`에서
 * 두 창에 각각 들어갈 수 있다.
 *
 * 사용법:
 *   node scripts/dev-fixture.mjs status     # 현재 상태 (기본값)
 *   node scripts/dev-fixture.mjs create     # 없으면 만들고, 크루로 상호 연결
 *   node scripts/dev-fixture.mjs challenge  # 둘이 함께하는 **active 챌린지** 세팅
 *   node scripts/dev-fixture.mjs destroy    # 픽스처 2개만 삭제
 *
 * 비밀번호는 `.env.local`의 `DEV_FIXTURE_PASSWORD`에서 읽는다(gitignore 대상).
 * 코드에 박지 않는다.
 *
 * ⚠️ 이 계정들은 **운영 Supabase**에 상주한다. 스테이징이 없어서 그렇다.
 *    크루 밖 사람에게는 닉네임 검색에만 보인다. 지울 때는 destroy를 쓴다 —
 *    닉네임·id를 둘 다 대조하고 기준선 계정 수까지 확인한 뒤에만 지운다.
 */
import { readFileSync } from "node:fs";

const FIXTURES = [
  { key: "A", nickname: "dev-테스터A", email: "dev-fixture-a@gnd.local" },
  { key: "B", nickname: "dev-테스터B", email: "dev-fixture-b@gnd.local" },
];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = env.DEV_FIXTURE_PASSWORD;

if (!URL_ || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

async function api(token, method, path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const rpc = (token, name, args) =>
  api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});

/** 서비스 롤로 auth 유저 전체를 훑어 이메일로 찾는다 */
async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${URL_}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      },
    );
    if (!res.ok) throw new Error(`auth 목록 조회 실패 (${res.status})`);
    const body = await res.json();
    const users = body?.users ?? [];
    const hit = users.find((u) => u.email === email);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`로그인 실패 (${email}): ${JSON.stringify(json)}`);
  }
  return { token: json.access_token, id: json.user.id };
}

async function allProfiles() {
  const { json } = await api(SERVICE_KEY, "GET", "/rest/v1/profiles?select=id,nickname");
  return Array.isArray(json) ? json : [];
}

// ── status ────────────────────────────────────────────────────────
async function status() {
  const profiles = await allProfiles();
  console.log(`운영 프로필 ${profiles.length}개`);
  for (const f of FIXTURES) {
    const user = await findAuthUserByEmail(f.email);
    const profile = user ? profiles.find((p) => p.id === user.id) : null;
    console.log(
      `  ${f.key}: ${f.email}  ${user ? "auth ✅" : "auth ❌"}  ${
        profile ? `프로필 "${profile.nickname}"` : "프로필 ❌"
      }`,
    );
  }
  const other = profiles.filter(
    (p) => !FIXTURES.some((f) => f.nickname === p.nickname),
  );
  console.log(`  픽스처가 아닌 프로필 ${other.length}개: ${other.map((p) => p.nickname).join(", ")}`);
}

// ── create ────────────────────────────────────────────────────────
async function create() {
  if (!PASSWORD || PASSWORD.length < 10) {
    throw new Error(
      ".env.local에 DEV_FIXTURE_PASSWORD를 10자 이상으로 넣으세요 (예: DEV_FIXTURE_PASSWORD=...)",
    );
  }

  const users = [];
  for (const f of FIXTURES) {
    let authUser = await findAuthUserByEmail(f.email);
    if (!authUser) {
      const res = await fetch(`${URL_}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: f.email,
          password: PASSWORD,
          email_confirm: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`계정 생성 실패: ${JSON.stringify(json)}`);
      authUser = json;
      console.log(`✅ ${f.key} 계정 생성 ${f.email}`);
    } else {
      console.log(`… ${f.key} 계정 이미 있음 ${f.email}`);
    }

    const me = await signIn(f.email);
    await api(me.token, "POST", "/rest/v1/profiles", {
      id: me.id,
      nickname: f.nickname,
      weekly_goal: 3,
    });
    users.push({ ...f, ...me });
  }

  const [a, b] = users;

  // 크루 상호 연결 — 요청 후 수락. 이미 연결돼 있으면 조용히 넘어간다.
  const req = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  // RPC는 camelCase(`requestId`)로 돌려준다. snake_case로만 읽으면 조용히 놓친다.
  let requestId = req.json?.requestId ?? req.json?.request_id ?? req.json?.id ?? null;

  // 이미 연결돼 있으면 요청이 거절된다 — 그건 정상이다.
  const already = req.json?.message === "already_crew";

  // 지난 실행이 pending을 남겼으면 새 요청이 `request_exists`로 막힌다.
  // 받은함에서 그 요청을 찾아 마저 수락한다.
  if (!requestId && req.json?.message === "request_exists") {
    const inbox = await rpc(b.token, "get_incoming_crew_requests");
    const mine = (inbox.json ?? []).find((x) => x.requester_id === a.id);
    requestId = mine?.request_id ?? null;
  }

  if (already) {
    console.log("… 크루 이미 연결됨");
  } else if (requestId) {
    const acc = await rpc(b.token, "accept_crew_request", {
      p_request_id: requestId,
    });
    console.log(
      acc.json?.status === "accepted"
        ? "✅ 크루 상호 연결"
        : `… 크루 연결 결과: ${JSON.stringify(acc.json)}`,
    );
  } else {
    console.log(`… 크루 요청 결과: ${JSON.stringify(req.json)}`);
  }

  console.log("\n두 창에서 각각 로그인하세요 — http://localhost:3000/login");
  for (const u of users) {
    console.log(`  ${u.key}: ${u.email} / (DEV_FIXTURE_PASSWORD)  → ${u.nickname}`);
  }
  console.log("\n일반 창 = A, 시크릿 창(또는 다른 크롬 프로필) = B 로 두면 동시에 볼 수 있습니다.");
}

// ── challenge ─────────────────────────────────────────────────────
/**
 * 둘이 함께하는 **active** 챌린지를 만든다.
 *
 * `start_challenge`가 요구하는 게이트가 셋이다(스키마 확인):
 *   ① joined 참가자 전원에게 `user_goals` 행이 있을 것 (`kpi_incomplete`)
 *   ② joined 참가자 **전원**이 동의했을 것 (`consent_incomplete`) — 방장만으론 안 된다
 *   ③ 상태가 `setup`일 것
 * 하나라도 빠지면 setup에 머물러서 챌린지 화면 대부분이 안 그려진다.
 */
async function challenge() {
  const users = [];
  for (const f of FIXTURES) {
    const authUser = await findAuthUserByEmail(f.email);
    if (!authUser) throw new Error(`${f.email} 없음 — 먼저 create를 실행하세요`);
    users.push({ ...f, ...(await signIn(f.email)) });
  }
  const [a, b] = users;

  // 이미 진행 중인 게 있으면 그걸 쓴다 — 매번 새로 만들면 방이 쌓인다.
  const { json: mine } = await api(
    a.token,
    "GET",
    "/rest/v1/challenges?select=id,name,status,start_date,end_date&status=in.(setup,active)",
  );
  let ch = Array.isArray(mine) ? mine[0] : null;

  if (!ch) {
    // `create_challenge_room`은 방장이 그룹에 속해 있어야 한다(`no_group_yet`).
    // 크루 연결(crew_links)과 그룹(groups)은 별개다 — 둘 다 있어야 한다.
    const groups = await api(a.token, "GET", "/rest/v1/groups?select=id,name");
    if (!Array.isArray(groups.json) || groups.json.length === 0) {
      const g = await rpc(a.token, "create_group", { p_name: "개발 확인용 크루" });
      if (!g.json?.id) throw new Error(`그룹 생성 실패: ${JSON.stringify(g.json)}`);
      console.log(`✅ 그룹 생성 "${g.json.name}"`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 27 * 86400_000).toISOString().slice(0, 10);
    const r = await rpc(a.token, "create_challenge_room", {
      p_name: "개발 확인용 챌린지",
      p_start_date: today,
      p_end_date: end,
      p_photo_required: false,
    });
    ch = r.json;
    if (!ch?.id) throw new Error(`방 생성 실패: ${JSON.stringify(r.json)}`);
    console.log(`✅ 챌린지 생성 "${ch.name}" (${ch.start_date} ~ ${ch.end_date})`);
  } else {
    console.log(`… 기존 챌린지 사용 "${ch.name}" [${ch.status}]`);
  }

  if (ch.status === "active") {
    console.log("✅ 이미 active — 그대로 씁니다");
    return;
  }

  // 초대 · 수락
  const inv = await rpc(a.token, "invite_to_challenge", {
    p_challenge_id: ch.id,
    p_target_id: b.id,
  });
  if (inv.status >= 400 && inv.json?.message !== "already_invited") {
    console.log(`… 초대 결과: ${JSON.stringify(inv.json)}`);
  }
  const acc = await rpc(b.token, "accept_challenge_invite", {
    p_challenge_id: ch.id,
  });
  if (acc.status >= 400) console.log(`… 수락 결과: ${JSON.stringify(acc.json)}`);

  // 목표 — setup 단계 RLS를 우회해 service_role로 심는다 (회귀 스크립트와 같은 방식)
  for (const u of users) {
    const exists = await api(
      SERVICE_KEY,
      "GET",
      `/rest/v1/user_goals?select=id&challenge_id=eq.${ch.id}&user_id=eq.${u.id}`,
    );
    if (Array.isArray(exists.json) && exists.json.length > 0) continue;
    const g = await api(SERVICE_KEY, "POST", "/rest/v1/user_goals", {
      user_id: u.id,
      challenge_id: ch.id,
      group_id: ch.group_id,
      goal_type: "weight_days",
      target_value: 12,
      unit: "일",
      planned_days: 5,
      qualifier: 3,
    });
    if (g.status >= 400) console.log(`… 목표 심기(${u.key}): ${JSON.stringify(g.json)}`);
  }

  // 동의 — **전원**이 해야 한다. 방장만 하면 consent_incomplete로 막힌다.
  for (const u of users) {
    const ap = await rpc(u.token, "approve_challenge_goals", {
      p_challenge_id: ch.id,
    });
    if (ap.status >= 400) console.log(`… 동의(${u.key}): ${JSON.stringify(ap.json)}`);
  }

  const started = await rpc(a.token, "start_challenge", { p_challenge_id: ch.id });
  if (started.json?.status === "active") {
    console.log(`✅ 챌린지 시작 — active (${started.json.start_date} ~ ${started.json.end_date})`);
  } else {
    console.log(`❌ 시작 실패: ${JSON.stringify(started.json)}`);
    return;
  }

  const parts = await rpc(a.token, "get_challenge_participant_profiles", {
    p_challenge_id: ch.id,
  });
  console.log(
    `참가자 ${(parts.json ?? []).length}명: ${(parts.json ?? []).map((p) => p.nickname).join(", ")}`,
  );
}

// ── destroy ───────────────────────────────────────────────────────
async function destroy() {
  const before = await allProfiles();
  const targets = [];
  for (const f of FIXTURES) {
    const user = await findAuthUserByEmail(f.email);
    if (!user) {
      console.log(`… ${f.key} 없음 (이미 지워짐)`);
      continue;
    }
    const profile = before.find((p) => p.id === user.id);
    // 이메일과 닉네임을 **둘 다** 대조한다. 하나만 보면 실계정을 지울 수 있다.
    if (profile && profile.nickname !== f.nickname) {
      throw new Error(
        `❌ ${f.email}의 닉네임이 "${profile.nickname}" — 기대 "${f.nickname}". 중단.`,
      );
    }
    targets.push({ ...f, id: user.id });
  }

  if (targets.length === 0) {
    console.log("지울 픽스처가 없습니다");
    return;
  }

  const survivors = before.filter((p) => !targets.some((t) => t.id === p.id));
  if (survivors.length === 0) {
    throw new Error("❌ 지우면 프로필이 0개가 됩니다. 중단.");
  }

  for (const t of targets) {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${t.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`삭제 실패 ${t.email} (${res.status})`);
    console.log(`✅ ${t.nickname} 삭제`);
  }

  const after = await allProfiles();
  const lost = survivors.filter((s) => !after.some((p) => p.id === s.id));
  if (lost.length) {
    throw new Error(`❌ 픽스처가 아닌 프로필이 사라졌다: ${lost.map((p) => p.nickname).join(", ")}`);
  }
  console.log(`✅ 나머지 ${after.length}개 보존 확인: ${after.map((p) => p.nickname).join(", ")}`);
}

const cmd = process.argv[2] ?? "status";
if (cmd === "status") await status();
else if (cmd === "create") await create();
else if (cmd === "challenge") await challenge();
else if (cmd === "destroy") await destroy();
else {
  console.error("사용법: node scripts/dev-fixture.mjs [status|create|challenge|destroy]");
  process.exit(1);
}
