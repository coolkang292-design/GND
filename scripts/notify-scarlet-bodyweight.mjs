// 스칼레또 **한 명에게만** 맨몸운동 카운팅 안내를 보낸다 (2026-08-01 조사 결과).
//
// 실행: node scripts/notify-scarlet-bodyweight.mjs          (DRY RUN — 문구만 출력)
//       node scripts/notify-scarlet-bodyweight.mjs --send   (실제 insert → 트리거가 푸시)
//
// ⚠️ --send는 실제 사용자 폰에 푸시가 나가는 되돌릴 수 없는 외부 작업이다.
//    기본은 DRY RUN이다 — broadcast-release.mjs와 같은 규약.
//
// 배경: 스칼레또의 맨몸 실적이 0으로 고정돼 있었다. 집계 코드는 정상이었고,
// 원인은 맨몸으로 분류된 종목을 한 번도 기록하지 않은 것이었다. 카탈로그의
// '스쿼트'가 weight라 맨몸 스쿼트를 해도 웨이트 횟수로 들어갔고, 맨몸 목록엔
// 일반 '스쿼트'가 아예 없었다(0054에서 추가).
//
// 멱등: dedupe_key로 막는다. 두 번 돌려도 한 번만 간다.
import { readFileSync } from "node:fs";

const TARGET_NICKNAME = "스칼레또";
const DEDUPE_KEY = "guide:bodyweight-counting:2026-08-01";
const TYPE = "app_update"; // 안내성 공지 — 0034가 허용한 유형, 푸시 목적지 /whats-new

const TITLE = "맨몸운동이 0으로 잡히던 이유 🙏";
const BODY = [
  "맨몸 횟수가 계속 0이던 원인을 찾았어요.",
  "기록하신 '스쿼트'가 앱에서는 웨이트 종목이라, 맨몸이 아니라 웨이트 횟수로 들어가고 있었어요.",
  "",
  "▸ 앞으로는: 운동 추가 → 상단 '맨몸' 칩을 누르면 맨몸 종목만 나와요. 거기서 고르면 맨몸 횟수에 쌓입니다.",
  "▸ '맨몸 스쿼트, 런지, 점핑잭, 니 푸시업' 같은 종목을 새로 넣어 뒀어요.",
  "▸ 직접 종목을 만들 때는 유형을 꼭 '맨몸 (회)'로 골라주세요. 기본값이 웨이트예요.",
  "",
  "지난 기록도 손봤어요. 무게 없이(0kg) 하신 7/20·7/25 스쿼트 2건은 '맨몸 스쿼트'로 바꿨습니다.",
  "10kg을 얹고 하신 나머지는 웨이트가 맞아서 그대로 뒀어요. 이 2건은 챌린지 기간(7/27~) 밖이라 챌린지 점수는 변하지 않았습니다.",
  "",
  "혹시 10kg으로 기록된 스쿼트도 사실 맨몸이었다면 알려주세요. 그것도 옮겨 드릴게요!",
].join("\n");

const send = process.argv.includes("--send");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ]),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !KEY) throw new Error(".env.local에 Supabase 설정 없음");

const h = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};
const get = async (p) => (await fetch(`${SUPA_URL}${p}`, { headers: h })).json();

// ── 대상 확정 — 딱 한 명이어야 한다 ─────────────────────────
const profiles = await get(
  `/rest/v1/profiles?select=id,nickname&nickname=eq.${encodeURIComponent(TARGET_NICKNAME)}`,
);
if (!Array.isArray(profiles) || profiles.length !== 1) {
  // 0명이면 닉네임이 바뀐 것이고, 2명 이상이면 엉뚱한 사람에게 갈 수 있다.
  throw new Error(
    `대상이 정확히 1명이어야 하는데 ${Array.isArray(profiles) ? profiles.length : "?"}명이다. 중단.`,
  );
}
const target = profiles[0];

console.log(`대상: ${target.nickname} (${target.id})`);
console.log(`제목: ${TITLE}`);
console.log("본문:");
console.log(
  BODY.split("\n")
    .map((l) => `  | ${l}`)
    .join("\n"),
);

// ── 중복 발송 방어 ───────────────────────────────────────────
const existing = await get(
  `/rest/v1/notifications?dedupe_key=eq.${encodeURIComponent(DEDUPE_KEY)}&select=id,created_at`,
);
if (Array.isArray(existing) && existing.length > 0) {
  console.log(`\n⚠️ 이미 보냈습니다 (${existing[0].created_at}). 중단.`);
  process.exit(0);
}

if (!send) {
  console.log("\nDRY RUN — 실제 발송하려면 --send 를 붙이세요.");
  process.exit(0);
}

const res = await fetch(`${SUPA_URL}/rest/v1/notifications`, {
  method: "POST",
  headers: { ...h, Prefer: "return=representation" },
  body: JSON.stringify([
    {
      user_id: target.id,
      type: TYPE,
      title: TITLE,
      body: BODY,
      dedupe_key: DEDUPE_KEY,
    },
  ]),
});
const out = await res.json();
if (!res.ok) {
  console.error("발송 실패:", out);
  process.exit(1);
}
console.log(`\n✅ 발송 완료 — 알림 1건 (id ${out[0]?.id}). 트리거가 푸시를 보냅니다.`);
