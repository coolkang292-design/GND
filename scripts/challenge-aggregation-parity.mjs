// 0044 집계 전환 안전성 — group_id 기준과 참가자 기준이 같은 점수를 내는지 실 DB로 확인.
// 실행: node scripts/challenge-aggregation-parity.mjs
// 읽기 전용이다. 계정을 만들지 않으므로 rate limit(§6.5) 영향이 없다.
//
// 왜 이 스크립트가 필요한가: fold·실적 계산을 여기서 재구현하면 그 재구현의 버그가
// "같다/다르다" 판정을 오염시킨다. 그래서 세션 **집합**을 비교한다 —
// 집합이 같으면 foldPeriodStats의 입력이 같고, 따라서 출력이 같은 것은 증명이다.
//
// service_role로 읽는 이유: 집합 동일성은 교집합에 보존된다. A_full = B_full 이면
// 임의의 RLS 가시집합 V에 대해 A∩V = B∩V다. 상위집합에서 같으면 전부 같다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
  // §6.6: 오류 시 PostgREST는 배열이 아니라 에러 객체를 준다.
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : [];
}

/** getPeriodStatsByUser의 기간창을 그대로 옮긴 것 (challenge.ts:427-430) */
function windowIso(startDate, endDate) {
  const from = new Date(`${startDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${endDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  return { from: from.toISOString(), to: to.toISOString() };
}

// 이번 실행이 실제로 대조한 챌린지가 하나라도 있었는가 (아래 루프에서 세운다).
let comparedSomething = false;

const actives = await rest(
  "challenges?select=id,group_id,name,start_date,end_date,photo_required&status=eq.active",
);
console.log(`진행 중 챌린지 ${actives.length}건\n`);

for (const ch of actives) {
  console.log(`── ${ch.name} (${ch.start_date} ~ ${ch.end_date}) ──`);

  const parts = await rest(
    `challenge_participants?select=user_id,status&challenge_id=eq.${ch.id}`,
  );
  const joined = parts.filter((p) => p.status === "joined").map((p) => p.user_id);
  const members = (
    await rest(`group_members?select=user_id&group_id=eq.${ch.group_id}`)
  ).map((m) => m.user_id);
  check(
    "참가자(joined) 명단 == 그룹 멤버 명단",
    JSON.stringify([...joined].sort()) === JSON.stringify([...members].sort()),
    `참가자 ${JSON.stringify(joined)} vs 멤버 ${JSON.stringify(members)}`,
  );
  if (joined.length === 0) {
    check("joined 참가자가 1명 이상", false, "0명 — 백필이 안 됐다");
    continue;
  }

  // 재확인 ① 참가자 세션 중 group_id가 챌린지와 다르거나 null인 것
  const all = await rest(
    `workout_sessions?select=id,group_id&user_id=in.(${joined.join(",")})&status=eq.completed&deleted_at=is.null`,
  );
  const odd = all.filter((s) => s.group_id !== ch.group_id);
  check(
    `참가자 완료 세션 ${all.length}건의 group_id가 전부 챌린지와 같다`,
    odd.length === 0,
    `불일치 ${odd.length}건 ${JSON.stringify(odd.slice(0, 5))}`,
  );

  // 재확인 ② 기간 내 세션 집합이 두 방식에서 같다
  const { from, to } = windowIso(ch.start_date, ch.end_date);
  const common =
    `&status=eq.completed&deleted_at=is.null` +
    `&completed_at=gte.${encodeURIComponent(from)}&completed_at=lt.${encodeURIComponent(to)}` +
    (ch.photo_required ? `&select=id,workout_images!inner(image_path)` : `&select=id`);

  const a = await rest(`workout_sessions?group_id=eq.${ch.group_id}${common}`);
  const b = await rest(`workout_sessions?user_id=in.(${joined.join(",")})${common}`);
  const idsA = new Set(a.map((r) => r.id));
  const idsB = new Set(b.map((r) => r.id));
  const onlyA = [...idsA].filter((i) => !idsB.has(i));
  const onlyB = [...idsB].filter((i) => !idsA.has(i));
  check(
    `기간 내 세션 집합 동일 (group_id ${idsA.size}건 · 참가자 ${idsB.size}건)`,
    onlyA.length === 0 && onlyB.length === 0,
    `A만 ${onlyA.length}건 ${JSON.stringify(onlyA)} · B만 ${onlyB.length}건 ${JSON.stringify(onlyB)}`,
  );

  // 공허한 통과를 막기 위한 기록. 두 집합이 모두 비어 있으면 차집합도 0이 되어
  // 위 두 단언이 **아무것도 대조하지 않고** PASS로 찍힌다. 필터 문법이 틀려
  // PostgREST가 200 + []를 주는 경우가 정확히 그렇다 — 에러가 아니라 정상
  // 응답이므로 rest()의 throw에 걸리지 않는다.
  //
  // 판정은 챌린지마다가 아니라 **실행 끝에서 한 번** 한다. 처음엔 챌린지마다
  // "0건이면 FAIL"로 뒀는데 과했다 — 갓 만든 챌린지는 기간 내 운동이 당연히
  // 0건이라, 그걸 실패로 치면 새 챌린지가 생길 때마다 영원히 빨간불이 된다
  // (2026-07-31에 실제로 그랬다). 막으려던 것은 "아무것도 대조하지 않았는데
  // 통과로 읽히는 것"이므로 실행 단위로 보면 충분하다.
  if (idsB.size > 0) comparedSomething = true;

  const goals = await rest(
    `user_goals?select=user_id,goal_type,target_value,qualifier&challenge_id=eq.${ch.id}`,
  );
  console.log(`  (목표 ${goals.length}개 — 실적 대조는 Task 4의 vitest가 실제 함수로 한다)`);
}

check(
  "이번 실행이 무언가는 대조했다 (기간 내 세션 있는 진행 중 챌린지 1건 이상)",
  comparedSomething,
  "진행 중 챌린지가 없거나 전부 기간 내 세션 0건이다 — 집합 비교가 전부 공허해서" +
    " 이 실행은 전환 안전성의 근거가 되지 못한다.",
);

console.log(`\n${passed}/${passed + failed} passed`);
if (passed + failed === 0) {
  console.log(
    "\n⚠ 검증한 단언이 0건이다 — 활성 챌린지가 없거나 최초 조회가 비어 있다." +
      " 이 실행은 전환 안전성의 근거가 되지 못한다.",
  );
  // process.exit(1)이 아니라 exitCode만 세팅한다: 이 분기는 최초 fetch 한
  // 건만 await한 직후라 이벤트 루프가 거의 비어 있는데, 그 시점에 강제
  // process.exit()을 부르면 Node 24 + Windows 조합에서 fetch(undici)의
  // 내부 핸들이 채 정리되기 전에 libuv가 죽는다
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") — 실행 중
  // 재현 확인함. exitCode만 설정하고 자연 종료시키면 같은 종료 코드를
  // 크래시 없이 낸다.
  process.exitCode = 1;
}
if (failed > 0) {
  console.log(
    "\n⚠ 하나라도 실패했으면 집계 전환을 0045로 미루고, 0044를 인덱스 드롭과 화면 변경만으로 좁혀라.",
  );
  // 위와 같은 이유로 강제 exit 대신 exitCode만 세팅한다.
  process.exitCode = 1;
}
