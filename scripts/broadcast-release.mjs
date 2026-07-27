// 배포 소식을 전 사용자에게 알림으로 발송.
// 실행: node scripts/broadcast-release.mjs            (DRY RUN — 대상만 출력)
//       node scripts/broadcast-release.mjs --send     (실제 insert → 트리거가 푸시 발송)
//       node scripts/broadcast-release.mjs --send --force  (이미 app_update가 있어도 강행)
//
// 사전조건:
//   1) 코드 배포 완료 — /api/push/notify가 app_update→/whats-new를 알아야 클릭이 상세로 간다.
//   2) 0034 적용 — notifications type CHECK에 app_update가 있어야 insert가 통과한다.
//
// 동작: profiles(실사용자)마다 notifications 1행 insert. 0016 트리거가 각 행에 대해
//   /api/push/notify를 호출 → 구독이 있는 사용자에게 웹푸시. 인앱 알림함에도 남는다.
//
// ⚠️ 실제 푸시가 나가는 되돌릴 수 없는 외부 작업이다. 기본은 DRY RUN.
import { readFileSync } from "node:fs";

// 이 릴리스의 알림 문구 — src/lib/domain/release-notes.ts의 latest와 맞춘다.
const TITLE = "새 소식 🎉 배지 30종 + 포인트 경제";
const BODY = "운동으로 포인트를 모으고 배지 30종을 수집하세요";
const TYPE = "app_update";

const send = process.argv.includes("--send");
const force = process.argv.includes("--force");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error(".env.local에 Supabase 설정 없음");
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const get = async (p) => (await fetch(`${URL}${p}`, { headers: h })).json();

const profiles = await get("/rest/v1/profiles?select=id,nickname&order=nickname");
console.log(`대상 ${profiles.length}명: ${profiles.map((p) => p.nickname).join(", ")}`);
console.log(`제목: ${TITLE}`);
console.log(`본문: ${BODY}`);

// 중복 발송 방어
const existing = await get(`/rest/v1/notifications?type=eq.${TYPE}&title=eq.${encodeURIComponent(TITLE)}&select=id`);
if (Array.isArray(existing) && existing.length > 0) {
  console.log(`\n⚠️ 같은 제목의 ${TYPE} 알림이 이미 ${existing.length}건 있습니다.`);
  if (send && !force) {
    console.log("중복 발송을 막았습니다. 정말 다시 보내려면 --force를 추가하세요.");
    process.exit(1);
  }
}

if (!send) {
  console.log("\nDRY RUN — 실제 발송하려면 --send 를 붙이세요.");
  process.exit(0);
}

const rows = profiles.map((p) => ({ user_id: p.id, type: TYPE, title: TITLE, body: BODY }));
const r = await fetch(`${URL}/rest/v1/notifications`, {
  method: "POST",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify(rows),
});
const body = await r.text();
if (!r.ok) throw new Error(`insert 실패: ${r.status} ${body}`);
const inserted = JSON.parse(body);
console.log(`\n${inserted.length}건 발송(insert) 완료. 트리거가 구독자에게 푸시를 보냅니다.`);
