// 챌린지 열람권 리셋: SQL notify_challenge_peek_unlock ↔ TS challengePassStatus 대조
// 실행: node scripts/peek-reset-check.mjs
// 사전조건: **0065 적용** (없으면 첫 단언부터 실패한다 — 그게 맞다)
//
// 왜 이 스크립트가 있나 (2026-08-09).
//   사용자 신고: "한번 열어 보면 리셋이 되어야 할듯. 어제 확인 했는데 오늘도
//   같은 보상이 지급이 됨". 열람권 판정에 사용 기록이 안 들어가서 5일을 채운
//   뒤로는 **매일** 창이 열리고 알림도 매일 갔다.
//
//   고치면서 규칙이 두 곳에 생겼다 — 화면(`viewing-pass.ts`)과 서버
//   (`notify_challenge_peek_unlock`). **둘이 갈리면 "🎟️ 2시간 시작!" 푸시를
//   받고 들어갔더니 자물쇠가 걸린 막다른 길**이 된다. 0045→0046→0047이
//   정확히 그 종류의 사고였다. 단위 테스트는 TS 쪽만 본다.
//
// 무엇을 하나
//   픽스처 A 계정에 **과거 날짜 운동 세션**을 service_role로 심고, SQL 함수를
//   직접 불러 알림이 생기는지 본다. TS 규칙을 이 파일에 옮겨 같은 답이 나오는지
//   대조한다. 심은 행은 전부 지운다.
//
// ⚠️ 계정을 만들거나 지우지 않는다. 이 스크립트가 건드리는 것은 **자기가 심은
//    workout_sessions·notifications 행**뿐이고, 끝에 전부 지운다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error(".env.local에 Supabase 설정이 없습니다");

const h = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const get = async (p) => (await fetch(`${URL}${p}`, { headers: h })).json();
const del = async (p) => fetch(`${URL}${p}`, { method: "DELETE", headers: h });
const post = async (p, body) =>
  fetch(`${URL}${p}`, { method: "POST", headers: h, body: JSON.stringify(body) });

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(
    `${ok ? "✅" : "❌"} ${name}${ok ? "" : `  기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`}`,
  );
}

// ── TS 규칙 사본 ────────────────────────────────────────────────
// `src/lib/domain/viewing-pass.ts`의 `challengePassStatus`와 **같은 판정**이다.
// 여기를 고치면 저기도 고쳐야 한다(streak-parity-check.mjs와 같은 규약).
const REQUIRED = 5;
function dayBack(todayKey, back) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - back));
  return dt.toISOString().slice(0, 10);
}
function tsUnlocks(dayKeys, todayKey, lastUsedDayKey) {
  const set = new Set(dayKeys);
  const cutoff = lastUsedDayKey === todayKey ? null : lastUsedDayKey;
  let n = 0;
  for (let i = 0; ; i++) {
    const key = dayBack(todayKey, i);
    if (cutoff !== null && key <= cutoff) break;
    if (set.has(key)) n++;
    else break;
  }
  return n >= REQUIRED;
}

const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// ── 픽스처 A ────────────────────────────────────────────────────
//
// ⚠️ **이메일로 찾는다. 닉네임으로 찾지 마라** (2026-08-31에 이걸로 막혔다).
//    옛 코드는 `nickname=eq.dev-테스터A`로 찾았는데, 사장님이 시연 영상을
//    찍으려고 픽스처 닉네임을 `헬스장주주`로 바꾸자 **못 찾고 0 passed / 0 failed**로
//    끝났다. 러너는 그걸 REGRESS(단언이 사라졌다)로 잡았지만, 잡히지 않았다면
//    "검사했는데 아무 문제 없음"과 구별이 안 됐다.
//
//    닉네임은 **사용자가 바꾸라고 있는 값**이고, 이메일은 로그인 신원이라 안 바뀐다.
//    신원으로 찾을 때는 언제나 이메일이다.
//
// profiles 표에는 이메일이 없어서 auth 관리자 API로 id를 얻은 뒤 프로필을 읽는다.
const FIXTURE_EMAIL = "dev-fixture-a@gnd.local";
const authPage = await get(`/auth/v1/admin/users?page=1&per_page=200`);
const authUser = (authPage?.users ?? []).find((u) => u.email === FIXTURE_EMAIL);
const [fixture] = authUser
  ? await get(`/rest/v1/profiles?select=id,nickname&id=eq.${authUser.id}`)
  : [];
if (!fixture) {
  console.error(
    `픽스처 A(${FIXTURE_EMAIL})가 없습니다. \`node scripts/dev-fixture.mjs create\` 후 다시 실행하세요.`,
  );
  process.exitCode = 1;
} else {
  console.log(`픽스처 A: ${fixture.nickname} (${FIXTURE_EMAIL})`);
  const USER = fixture.id;
  const MARK = "peek-reset-check"; // 심은 세션을 알아보는 표식 (컬럼은 memo — notes가 아니다)

  // 이 계정이 참가 중인 active 챌린지 — 없으면 SQL 함수가 항상 조용하다
  const parts = await get(
    `/rest/v1/challenge_participants?select=challenge_id,challenges(id,status)&user_id=eq.${USER}`,
  );
  const challengeId = (parts ?? []).find(
    (p) => p.challenges?.status === "active",
  )?.challenge_id;

  async function cleanup() {
    await del(`/rest/v1/workout_sessions?user_id=eq.${USER}&memo=eq.${MARK}`);
    await del(
      `/rest/v1/notifications?user_id=eq.${USER}&type=eq.challenge_peek_unlocked&dedupe_key=eq.peek_unlock:${USER}:${kstToday}`,
    );
  }

  /** 오늘부터 뒤로 `days`일치 완료 세션을 심는다 (KST 정오) */
  async function seedDays(days) {
    const rows = [];
    for (const back of days) {
      const key = dayBack(kstToday, back);
      rows.push({
        user_id: USER,
        status: "completed",
        started_at: `${key}T02:00:00Z`,
        completed_at: `${key}T03:00:00Z`,
        duration_minutes: 30,
        memo: MARK,
      });
    }
    const res = await post("/rest/v1/workout_sessions", rows);
    if (!res.ok) throw new Error(`세션 심기 실패: ${await res.text()}`);
  }

  /** SQL 함수를 부르고 알림이 생겼는지 본다 */
  async function sqlUnlocks() {
    await del(
      `/rest/v1/notifications?user_id=eq.${USER}&type=eq.challenge_peek_unlocked&dedupe_key=eq.peek_unlock:${USER}:${kstToday}`,
    );
    const res = await post("/rest/v1/rpc/notify_challenge_peek_unlock", {
      p_user_id: USER,
    });
    if (!res.ok) {
      throw new Error(
        `notify_challenge_peek_unlock 호출 실패 (0065 적용했나요?): ${await res.text()}`,
      );
    }
    const rows = await get(
      `/rest/v1/notifications?select=id&user_id=eq.${USER}&type=eq.challenge_peek_unlocked&dedupe_key=eq.peek_unlock:${USER}:${kstToday}`,
    );
    return (rows ?? []).length > 0;
  }

  /** 픽 기록을 특정 날짜로 맞춘다 (null이면 지운다) */
  async function setLastUse(dayKey) {
    await del(
      `/rest/v1/challenge_peek_picks?viewer_id=eq.${USER}&challenge_id=eq.${challengeId}`,
    );
    if (!dayKey) return;
    // 대상은 나 자신이면 안 된다(0040 체크 제약) — 아무 다른 참가자를 쓴다
    const others = await get(
      `/rest/v1/user_goals?select=user_id&challenge_id=eq.${challengeId}&user_id=neq.${USER}&limit=1`,
    );
    const target = (others ?? [])[0]?.user_id;
    if (!target) return null;
    const res = await post("/rest/v1/challenge_peek_picks", {
      viewer_id: USER,
      challenge_id: challengeId,
      pick_date: dayKey,
      target_id: target,
    });
    if (!res.ok) throw new Error(`픽 심기 실패: ${await res.text()}`);
    return target;
  }

  try {
    await cleanup();

    if (!challengeId) {
      console.error(
        "픽스처 A가 참가 중인 active 챌린지가 없습니다. `node scripts/dev-fixture.mjs challenge` 후 다시 실행하세요.",
      );
      process.exitCode = 1;
    } else {
      const fiveDays = [0, 1, 2, 3, 4];
      const fiveKeys = fiveDays.map((b) => dayBack(kstToday, b));

      // ① 사용 기록 없음 + 5일 연속 → 열린다
      await setLastUse(null);
      await seedDays(fiveDays);
      check("사용 기록 없이 5일 연속이면 열린다 (SQL)", await sqlUnlocks(), true);
      check(
        "  ↳ TS도 같은 답",
        tsUnlocks(fiveKeys, kstToday, null),
        true,
      );

      // ② 어제 썼으면 잠긴다 — 이것이 사용자가 신고한 그 지점이다
      const yesterday = dayBack(kstToday, 1);
      const target = await setLastUse(yesterday);
      if (target === null) {
        console.log("⚠️ 다른 참가자가 없어 ②~④를 건너뜁니다");
      } else {
        check("어제 썼으면 5일 연속이어도 잠긴다 (SQL)", await sqlUnlocks(), false);
        check(
          "  ↳ TS도 같은 답",
          tsUnlocks(fiveKeys, kstToday, yesterday),
          false,
        );

        // ③ 오늘 썼으면 오늘 창은 유지된다
        await setLastUse(kstToday);
        check("오늘 썼어도 오늘 창은 열려 있다 (SQL)", await sqlUnlocks(), true);
        check("  ↳ TS도 같은 답", tsUnlocks(fiveKeys, kstToday, kstToday), true);

        // ④ 쓴 날 다음부터 5일을 새로 채우면 다시 열린다
        await del(`/rest/v1/workout_sessions?user_id=eq.${USER}&memo=eq.${MARK}`);
        const newBlock = [0, 1, 2, 3, 4];
        await seedDays(newBlock);
        const used = dayBack(kstToday, 5);
        await setLastUse(used);
        check("쓴 다음 날부터 5일을 채우면 다시 열린다 (SQL)", await sqlUnlocks(), true);
        check(
          "  ↳ TS도 같은 답",
          tsUnlocks(
            newBlock.map((b) => dayBack(kstToday, b)),
            kstToday,
            used,
          ),
          true,
        );
      }
      await setLastUse(null);
    }
  } finally {
    await cleanup();
  }
}

console.log(`\n${passed} passed / ${failed} failed`);
// ⚠️ process.exit은 finally **밖**이다 — 안에 두면 예외를 삼켜 아무것도 검증
//    못 한 실행이 exit 0으로 보고된다 (CLAUDE.md §검증 스크립트).
if (failed > 0) process.exitCode = 1;
