// 계정에 붙은 신원(카카오·구글)을 떼어낸다 — **테스트 뒤 되돌리기용**.
//
// 왜 필요한가: 같은 카카오 계정은 GND 계정 **하나에만** 붙는다. 픽스처 계정으로
// 연결을 시험하면 그 카카오가 픽스처에 묶여, 나중에 **본인 진짜 계정에 못 붙는다**
// (`identity_already_exists`). 앱에는 해제 버튼이 없으므로(설계 §5.6에서 범위 밖)
// 이 스크립트가 유일한 탈출구다.
//
// 실행:
//   node scripts/unlink-identity.mjs                    ← 목록만 본다 (안전)
//   node scripts/unlink-identity.mjs <닉네임> <provider> ← 실제로 뗀다
//
// 예: node scripts/unlink-identity.mjs dev-테스터A kakao
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error(".env.local에 Supabase 설정이 없습니다");

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const [targetNick, targetProvider] = process.argv.slice(2);

const profiles = await (
  await fetch(`${URL_}/rest/v1/profiles?select=id,nickname`, { headers: H })
).json();

// ⚠️⚠️ **목록 API(`/admin/users`)를 쓰지 마라 — `identities`를 안 준다.**
//    2026-08-08에 이걸로 헛짚었다: 목록이 전부 빈 배열을 줘서 "운영 계정에 신원이
//    하나도 없다"고 잘못 읽었고, 실제로는 전부 email 신원이 있었다.
//    **개별 조회(`/admin/users/{id}`)만 진짜 값을 준다.**
//    프로필이 있는 계정만 돈다 — 프로필 없는 익명 계정은 화면에 안 보이는 잡음이다.
const rows = [];
for (const p of profiles) {
  const u = await (
    await fetch(`${URL_}/auth/v1/admin/users/${p.id}`, { headers: H })
  ).json();
  rows.push({
    id: p.id,
    nickname: p.nickname,
    email: u.email ?? null,
    identities: (u.identities ?? []).map((i) => ({
      id: i.identity_id ?? i.id,
      provider: i.provider,
    })),
  });
}

console.log("계정별 연결된 신원:\n");
for (const r of rows) {
  const list = r.identities.length
    ? r.identities.map((i) => i.provider).join(", ")
    : "(없음 — 이 브라우저에만 있는 계정)";
  console.log(`  ${r.nickname.padEnd(14)} ${list}`);
}

if (!targetNick || !targetProvider) {
  console.log(
    "\n떼어내려면: node scripts/unlink-identity.mjs <닉네임> <provider>",
  );
  process.exit(0);
}

const target = rows.find((r) => r.nickname === targetNick);
if (!target) throw new Error(`그런 닉네임이 없습니다: ${targetNick}`);

const identity = target.identities.find((i) => i.provider === targetProvider);
if (!identity) {
  throw new Error(`${targetNick}에 ${targetProvider}가 붙어 있지 않습니다`);
}

// ⚠️ 마지막 하나를 떼면 그 계정은 **다시 익명**이 된다 — 브라우저를 지우면 기록으로
//    돌아올 방법이 없어진다. 픽스처 계정은 이메일이 남으므로 보통 문제없지만,
//    진짜 사용자 계정에서는 이 경고가 그대로 사고 시나리오다.
if (target.identities.length === 1) {
  console.log(
    `\n⚠️ ${targetNick}의 **마지막 신원**입니다. 떼면 이 브라우저에만 있는 계정이 됩니다.`,
  );
}

// ⚠️ **관리자 API로는 못 뗀다.** 2026-08-08 실측:
//    `DELETE /auth/v1/admin/users/{id}/identities/{identity_id}` → **404**.
//    GoTrue에 그 경로가 없다. 지원되는 길은 **본인 세션**으로 부르는
//    `DELETE /auth/v1/user/identities/{identity_id}`(= `supabase.auth.unlinkIdentity`)뿐이라,
//    그 계정으로 로그인한 뒤 떼야 한다. 그래서 이메일+비밀번호가 필요하다.
if (!target.email) {
  throw new Error(
    `${targetNick}에 이메일이 없어 로그인할 수 없습니다. 본인 기기의 앱에서 떼야 합니다.`,
  );
}
const PASSWORD = env.DEV_FIXTURE_PASSWORD;
if (!PASSWORD) {
  throw new Error(".env.local에 DEV_FIXTURE_PASSWORD가 없습니다");
}

const signIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: target.email, password: PASSWORD }),
});
const session = await signIn.json();
if (!session.access_token) {
  throw new Error(
    `${targetNick}(${target.email}) 로그인 실패: ${JSON.stringify(session).slice(0, 200)}\n` +
      `픽스처가 아닌 계정은 비밀번호가 달라 이 스크립트로 못 뗍니다.`,
  );
}

const res = await fetch(`${URL_}/auth/v1/user/identities/${identity.id}`, {
  method: "DELETE",
  headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` },
});
const body = await res.text();
console.log(
  res.ok
    ? `\n✅ ${targetNick}에서 ${targetProvider}를 뗐습니다. 이제 그 계정을 다른 GND 계정에 붙일 수 있습니다.`
    : `\n❌ 실패 ${res.status}: ${body.slice(0, 300)}`,
);
if (!res.ok) process.exitCode = 1;
