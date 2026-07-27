// 최신 릴리스 소식을 전 사용자에게 알림으로 발송.
// 실행: node scripts/broadcast-release.mjs            (DRY RUN — 대상·문구만 출력)
//       node scripts/broadcast-release.mjs --send     (실제 insert → 트리거가 푸시 발송)
//       node scripts/broadcast-release.mjs --send --force  (이미 보냈어도 강행)
//
// 문구는 src/lib/domain/release-notes.data.json의 맨 앞(최신) 항목에서 자동으로 읽는다.
// 즉 새 기능 배포 절차 = ① 그 json 맨 앞에 항목 추가 → ② 이 스크립트 한 번.
// 같은 릴리스(id)로 이미 보낸 알림이 있으면 건너뛴다(멱등). 그래서 배포마다 그냥 돌리면 된다.
//
// 사전조건: (1) 코드 배포 완료(/api/push/notify가 app_update→/whats-new를 안다)
//           (2) 0034 적용(notifications type CHECK에 app_update).
// ⚠️ 실제 푸시가 나가는 되돌릴 수 없는 외부 작업이다. 기본은 DRY RUN.
import { readFileSync } from "node:fs";

const NOTES = JSON.parse(
  readFileSync(new URL("../src/lib/domain/release-notes.data.json", import.meta.url), "utf8"),
);
const release = NOTES[0];
if (!release) throw new Error("release-notes.data.json이 비어 있음");

const TYPE = "app_update";
// 제목에 릴리스 id를 실어 중복발송 방어를 안정적으로 한다(제목만으로 릴리스를 특정).
const TITLE = `새 소식 🎉 ${release.title}`;
const BODY = release.summary;

const send = process.argv.includes("--send");
const force = process.argv.includes("--force");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !KEY) throw new Error(".env.local에 Supabase 설정 없음");
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const get = async (p) => (await fetch(`${SUPA_URL}${p}`, { headers: h })).json();

console.log(`릴리스: ${release.id}`);
console.log(`제목: ${TITLE}`);
console.log(`본문: ${BODY}`);

const profiles = await get("/rest/v1/profiles?select=id,nickname&order=nickname");
console.log(`대상 ${profiles.length}명: ${profiles.map((p) => p.nickname).join(", ")}`);

// 중복 발송 방어 — 같은 제목(=같은 릴리스)의 app_update가 이미 있으면 멈춘다.
const existing = await get(
  `/rest/v1/notifications?type=eq.${TYPE}&title=eq.${encodeURIComponent(TITLE)}&select=id`,
);
if (Array.isArray(existing) && existing.length > 0) {
  console.log(`\n⚠️ 이 릴리스 알림이 이미 ${existing.length}건 있습니다(이미 보냄).`);
  if (!force) {
    console.log(send ? "중복 발송 방지 — 정말 다시 보내려면 --force." : "이미 보낸 릴리스입니다.");
    process.exit(send ? 1 : 0);
  }
}

if (!send) {
  console.log("\nDRY RUN — 실제 발송하려면 --send 를 붙이세요.");
  process.exit(0);
}

const rows = profiles.map((p) => ({ user_id: p.id, type: TYPE, title: TITLE, body: BODY }));
const r = await fetch(`${SUPA_URL}/rest/v1/notifications`, {
  method: "POST",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify(rows),
});
const body = await r.text();
if (!r.ok) throw new Error(`insert 실패: ${r.status} ${body}`);
console.log(`\n${JSON.parse(body).length}건 발송(insert) 완료. 트리거가 구독자에게 푸시를 보냅니다.`);
