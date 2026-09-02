/**
 * Storage 버킷 상한 회귀 — 0099로 건 `file_size_limit`·`allowed_mime_types`가
 * **실제로 막는지** 확인한다 (2026-09-03 외부 파일럿 P0-2).
 *
 * ⚠️ **`rls-test`가 이미 하는 것은 여기서 안 한다.** 거기서 이미 검사한다:
 *      · A가 본인 경로에 업로드 → 200
 *      · B가 A 경로에 업로드 → 4xx
 *      · 크루 공개 사진 다운로드 → 200 / private → 4xx
 *    그건 **정책(policy)** 검증이고, 이 파일은 **버킷 설정** 검증이다. 둘은
 *    서로를 대신하지 못한다 — 정책이 멀쩡해도 상한이 NULL이면 10GB가 올라간다.
 *
 * ⚠️⚠️ **부정 확인이 본체다.** "올라간다"가 아니라 **"안 올라간다"**를 본다.
 *    상한을 지웠을 때 이 단언들이 실패해야 진짜 테스트다(CLAUDE.md §테스트가
 *    진짜 테스트인지 확인한다). 정상 업로드 단언을 같이 두는 이유는 상한을
 *    너무 조여 **실사용자를 막는** 반대 방향 사고를 잡기 위해서다.
 *
 * ⚠️ 계정을 **1개** 만든다(익명). 연달아 돌리면 429에 걸린다.
 *    올린 파일은 service_role로 전부 지운다 — 운영 Storage에 찌꺼기를 남기지 않는다.
 *
 * 실행: node scripts/storage-limits-check.mjs
 */
import { readFileSync } from "node:fs";
import { createDeleteGuard } from "./_safe-delete.mjs";

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
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

let passed = 0;
let failed = 0;
function check(label, ok, extra = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

/** 0099가 건 상한. 여기 숫자를 바꾸면 마이그레이션도 같이 고쳐라. */
const LIMITS = {
  avatars: 2 * 1024 * 1024,
  "workout-images": 3 * 1024 * 1024,
};

/** 진짜 JPEG 매직바이트. Storage는 헤더 Content-Type을 보지만 내용도 맞춰 둔다. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9,
]);

const _guard = SERVICE
  ? await createDeleteGuard({ url: URL_, serviceKey: SERVICE })
  : null;

let me = null;
/** 이번 실행이 올린 것만 정리한다. 경로가 내 UUID로 시작하지 않으면 손대지 않는다. */
const uploaded = [];

async function put(bucket, path, body, contentType, token) {
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body,
  });
  if (res.status === 200) uploaded.push({ bucket, path });
  return res.status;
}

try {
  // ── 계정 1개 ────────────────────────────────────────────────
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("익명 가입 실패: " + JSON.stringify(json));
  me = { id: json.user.id, token: json.access_token };
  _guard?.register(me.id);
  console.log(`테스트 계정 ${me.id.slice(0, 8)}…\n`);

  for (const bucket of ["avatars", "workout-images"]) {
    const limit = LIMITS[bucket];
    console.log(`── ${bucket} (상한 ${(limit / 1024 / 1024).toFixed(0)}MiB · image/jpeg만) ──`);

    // 1) 정상 — 앱이 실제로 만드는 형식. 이게 막히면 사용자가 사진을 못 올린다.
    const okPath = `${me.id}/limits-ok-${Date.now()}.jpg`;
    check(
      "정상 JPEG 업로드 성공",
      (await put(bucket, okPath, JPEG, "image/jpeg", me.token)) === 200,
    );

    // 2) MIME 거부 — 같은 바이트라도 선언한 형식이 다르면 막혀야 한다.
    for (const mime of ["text/plain", "image/png", "image/svg+xml"]) {
      const st = await put(
        bucket,
        `${me.id}/limits-mime-${Date.now()}.bin`,
        JPEG,
        mime,
        me.token,
      );
      check(`허용 안 된 MIME 거부 (${mime})`, st >= 400, `status ${st}`);
    }

    // 3) 크기 거부 — 상한을 넘긴 본문. **여기가 이 파일의 존재 이유다.**
    const tooBig = new Uint8Array(limit + 512 * 1024);
    tooBig.set(JPEG, 0);
    const bigSt = await put(
      bucket,
      `${me.id}/limits-big-${Date.now()}.jpg`,
      tooBig,
      "image/jpeg",
      me.token,
    );
    check(
      `상한 초과 거부 (${((limit + 512 * 1024) / 1024 / 1024).toFixed(1)}MB)`,
      bigSt >= 400,
      `status ${bigSt}`,
    );

    // 4) 남의 폴더 거부 — 정책이 살아 있는지 같이 본다(상한을 걸면서 깨진 적 없는지).
    const otherSt = await put(
      bucket,
      `00000000-0000-4000-8000-000000000000/hack-${Date.now()}.jpg`,
      JPEG,
      "image/jpeg",
      me.token,
    );
    check("다른 사용자 폴더 업로드 거부", otherSt >= 400, `status ${otherSt}`);

    console.log("");
  }

  // ── 버킷 설정 자체를 다시 읽어 확인 ─────────────────────────
  // "명령이 성공했다"가 아니라 **객체를 다시 조회**한다 (CLAUDE.md §DB 마이그레이션).
  if (SERVICE) {
    const b = await fetch(
      `${URL_}/storage/v1/bucket`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    ).then((r) => r.json());
    const byId = Object.fromEntries((b ?? []).map((x) => [x.id, x]));
    console.log("── 버킷 설정 재조회 ──");
    check("avatars는 public 유지", byId.avatars?.public === true);
    check("workout-images는 private 유지", byId["workout-images"]?.public === false);
    check(
      "avatars 상한 2MiB",
      byId.avatars?.file_size_limit === LIMITS.avatars,
      String(byId.avatars?.file_size_limit),
    );
    check(
      "workout-images 상한 3MiB",
      byId["workout-images"]?.file_size_limit === LIMITS["workout-images"],
      String(byId["workout-images"]?.file_size_limit),
    );
  }
} finally {
  // ── 정리 — 올린 파일 전부, 그다음 계정 ──────────────────────
  if (SERVICE) {
    const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    for (const { bucket, path } of uploaded) {
      // ⛔ 내 UUID로 시작하지 않는 경로는 건드리지 않는다. 실사용자 사진을
      //    지우는 사고를 코드로 막는다.
      if (!me?.id || !path.startsWith(`${me.id}/`)) {
        console.log(`⚠️  정리 건너뜀(내 경로 아님): ${bucket}/${path}`);
        continue;
      }
      const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
        method: "DELETE",
        headers: admin,
      });
      if (!r.ok) console.log(`정리 실패 ${bucket}/${path}: ${r.status}`);
    }
    if (me?.id) {
      const r = await _guard.deleteIfCreatedThisRun(me.id);
      if (!r.ok) console.log(`계정 정리 실패: ${r.status}`);
    }
    console.log(`정리 완료 (파일 ${uploaded.length}개)`);
  } else {
    console.log("SUPABASE_SERVICE_ROLE_KEY 없음 — 정리 생략");
  }
}

// ⚠️ 요약과 exit는 finally 밖이다 (CLAUDE.md §테스트가 진짜 테스트인지).
console.log(`\n결과: ${passed} 통과 / ${failed} 실패`);
if (failed !== 0) process.exit(1);
