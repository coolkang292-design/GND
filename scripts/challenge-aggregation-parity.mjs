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

const actives = await rest(
  "challenges?select=id,group_id,name,start_date,end_date,photo_required&status=eq.active",
);
console.log(`진행 중 챌린지 ${actives.length}건\n`);

for (const ch of actives) {
  console.log(`── ${ch.name} (${ch.start_date} ~ ${ch.end_date}) ──`);

  const parts = await rest(
    `challenge_participants?select=user_id,role,status&challenge_id=eq.${ch.id}`,
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

  const goals = await rest(
    `user_goals?select=user_id,goal_type,target_value,qualifier&challenge_id=eq.${ch.id}`,
  );
  console.log(`  (목표 ${goals.length}개 — 실적 대조는 Task 4의 vitest가 실제 함수로 한다)`);
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(
    "\n⚠ 하나라도 실패했으면 집계 전환을 0045로 미루고, 0044를 인덱스 드롭과 화면 변경만으로 좁혀라.",
  );
  process.exit(1);
}
