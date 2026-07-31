// 버그 신고 경계 실측 (0052) — 익명 유저 A·B로 RLS와 RPC 게이트를 확인한다.
// 실행: node scripts/bug-report-check.mjs   (사전조건: 0052 적용됨)
//
// ⚠️ 프로덕션 DB에 직접 붙는다. 픽스처 계정만 만들고 finally에서 지운다.
//    연달아 돌리면 익명 가입 rate limit(429)에 걸린다 — 사이에 1~2분 둔다.
//
// 단언 원칙(CLAUDE.md): "0이어야 한다"로 쓰지 않는다. 서버가 완전히 망가져도
// 0은 통과하기 때문이다. 개수는 **정확한 수**로 뒤집어 단언한다.
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

// 가드는 첫 anonUser()보다 **앞에서** 만든다.
const guard = await createDeleteGuard({ url: URL_, serviceKey: SERVICE });

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

const svc = (method, path, body) =>
  fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

async function anonUser() {
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  guard.register(json.user.id);
  return { token: json.access_token, id: json.user.id };
}

const submit = (token, args) =>
  api(token, "POST", "/rest/v1/rpc/submit_bug_report", args);

let A;
let B;
const createdReportIds = [];

try {
  console.log("\n── 픽스처 ──");
  A = await anonUser();
  B = await anonUser();
  await api(A.token, "POST", "/rest/v1/profiles", {
    id: A.id,
    nickname: `bugchk-a-${A.id.slice(0, 6)}`,
  });
  check("익명 계정 2개 생성", Boolean(A.token && B.token));

  console.log("\n── 접수 ──");
  const ok = await submit(A.token, {
    p_message: "테스트 신고 — 챌린지 참가가 안 돼요",
    p_route: "/challenge",
    p_context: { build: "2026-07-31T00:00:00.000Z", ua: "checkscript" },
    p_trail: [{ t: new Date().toISOString(), kind: "fail", label: "db", detail: "POST rpc/x 400" }],
  });
  check("정상 신고가 접수된다", ok.status === 200 && typeof ok.json === "string", `status=${ok.status}`);
  if (typeof ok.json === "string") createdReportIds.push(ok.json);
  const reportId = typeof ok.json === "string" ? ok.json : null;

  const short = await submit(A.token, { p_message: "x" });
  check("2자 미만은 거부된다", short.status >= 400 && JSON.stringify(short.json).includes("message_too_short"), `status=${short.status}`);

  const long = await submit(A.token, { p_message: "가".repeat(1001) });
  check("1000자 초과는 거부된다", long.status >= 400 && JSON.stringify(long.json).includes("message_too_long"), `status=${long.status}`);

  const anon = await fetch(`${URL_}/rest/v1/rpc/submit_bug_report`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_message: "비인증 신고" }),
  });
  check("비인증 호출은 거부된다", anon.status >= 400, `status=${anon.status}`);

  console.log("\n── 중복 흡수 ──");
  const dup = await submit(A.token, {
    p_message: "테스트 신고 — 챌린지 참가가 안 돼요",
    p_route: "/challenge",
  });
  check(
    "2분 내 같은 문장은 같은 id를 돌려준다 (연타 무해)",
    dup.status === 200 && dup.json === reportId,
    `first=${reportId} second=${dup.json}`,
  );

  console.log("\n── 클라이언트를 믿지 않는다 ──");
  const many = Array.from({ length: 50 }, (_, i) => ({
    t: new Date().toISOString(),
    kind: "action",
    label: `step-${i}`,
  }));
  const trimmed = await submit(A.token, { p_message: "흔적 50개를 보낸다", p_trail: many });
  check("trail 50개 신고가 접수된다", trimmed.status === 200, `status=${trimmed.status}`);
  if (typeof trimmed.json === "string") createdReportIds.push(trimmed.json);
  if (typeof trimmed.json === "string") {
    const [row] = (await svc("GET", `/rest/v1/bug_reports?id=eq.${trimmed.json}&select=trail`)).json ?? [];
    // "30 이하"가 아니라 **정확히 30**으로 단언한다 — 자르기가 통째로 망가져
    // 0개가 되어도 "30 이하"는 통과한다.
    check("서버가 trail을 정확히 30개로 자른다", (row?.trail ?? []).length === 30, `len=${row?.trail?.length}`);
    check("자를 때 최신(앞)을 남긴다", row?.trail?.[0]?.label === "step-0", `first=${row?.trail?.[0]?.label}`);
  }

  const badTrail = await submit(A.token, { p_message: "흔적이 배열이 아니다", p_trail: { not: "array" } });
  check("배열이 아닌 trail은 버리고 접수된다", badTrail.status === 200, `status=${badTrail.status}`);
  if (typeof badTrail.json === "string") createdReportIds.push(badTrail.json);

  console.log("\n── 레이트 리밋 ──");
  // 위에서 A가 이미 3건 넣었다(정상·trail50·badTrail). 다음이 막혀야 한다.
  const limited = await submit(A.token, { p_message: "10분 내 네 번째 신고" });
  check(
    "10분 내 4번째 신고가 막힌다",
    limited.status >= 400 && JSON.stringify(limited.json).includes("rate_limited"),
    `status=${limited.status} body=${JSON.stringify(limited.json).slice(0, 120)}`,
  );

  console.log("\n── 읽기 경계 ──");
  const mine = await api(A.token, "GET", "/rest/v1/bug_reports?select=id");
  check("신고자는 자기 신고를 읽는다 (3건)", (mine.json ?? []).length === 3, `n=${(mine.json ?? []).length}`);

  const others = await api(B.token, "GET", "/rest/v1/bug_reports?select=id");
  check("남의 신고는 한 건도 안 보인다", (others.json ?? []).length === 0, `n=${(others.json ?? []).length}`);

  const direct = await api(B.token, "POST", "/rest/v1/bug_reports", {
    user_id: B.id,
    message: "정책 우회 시도 — RPC를 건너뛴다",
  });
  check("테이블 직접 INSERT는 차단된다 (RPC만)", direct.status >= 400, `status=${direct.status}`);

  const tamper = await api(A.token, "PATCH", `/rest/v1/bug_reports?id=eq.${reportId}`, { status: "fixed" });
  check(
    "신고자가 자기 신고 상태를 못 바꾼다",
    tamper.status >= 400 || (tamper.json ?? []).length === 0,
    `status=${tamper.status}`,
  );

  const watchers = await api(A.token, "GET", "/rest/v1/bug_report_watchers?select=user_id");
  check(
    "누가 신고를 받아보는지는 안 보인다",
    watchers.status >= 400 || (watchers.json ?? []).length === 0,
    `status=${watchers.status} n=${(watchers.json ?? []).length}`,
  );

  console.log("\n── 관리자 알림 (1층) ──");
  if (reportId) {
    const notifs = (await svc("GET", `/rest/v1/notifications?reference_id=eq.${reportId}&type=eq.bug_reported&select=user_id,title,body`)).json ?? [];
    // 감시자 1명이므로 정확히 1건이어야 한다. 트리거가 안 돌면 0이 되고,
    // 이 단언이 그것을 잡는다.
    check("신고 1건당 감시자에게 알림 1건이 생긴다", notifs.length === 1, `n=${notifs.length}`);
    check("알림 본문에 신고 내용이 실린다", (notifs[0]?.body ?? "").includes("챌린지 참가가 안 돼요"), `body=${notifs[0]?.body}`);
    check("알림 본문에 경로가 실린다", (notifs[0]?.body ?? "").includes("/challenge"), `body=${notifs[0]?.body}`);
  }

  console.log("\n── 미처리 집계 (2층) ──");
  const countRes = await svc("POST", "/rest/v1/rpc/pending_bug_report_count", {});
  check("pending_bug_report_count가 3건 이상을 센다", typeof countRes.json === "number" && countRes.json >= 3, `count=${JSON.stringify(countRes.json)}`);
} finally {
  console.log("\n── 정리 ──");
  // 신고는 auth.users cascade로 지워지지만, 트리거가 만든 알림은 관리자에게
  // 남는다(user_id가 관리자다). 실사용자 알림함을 테스트 찌꺼기로 더럽히지 않는다.
  for (const id of createdReportIds) {
    await svc("DELETE", `/rest/v1/notifications?reference_id=eq.${id}`).catch(() => {});
  }
  await guard.cleanup();
}

console.log(`\n${passed} 통과 / ${failed} 실패`);
process.exit(failed > 0 ? 1 : 0);
