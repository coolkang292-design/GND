/**
 * 인플루언서 데모 녹화 — 운영 GND를 픽스처 A·B 두 계정으로 **실제로** 조작하며 찍는다.
 *
 *   node record.mjs prep     # B의 오늘 계획을 벤치프레스 3세트로 준비 (녹화 안 함)
 *   node record.mjs          # 녹화 → work/rec/<시각>/{A,B}/
 *   node edit.mjs work/rec/<시각>
 *
 * ⚠️ [미검증] 이 파일은 2026-09-14 녹화(`driver.mjs`로 한 단계씩 확인하며 찍음)에서
 *    **실제로 통과한 선택자·순서**를 옮겨 적은 것이다. 이 스크립트를 처음부터 끝까지
 *    한 번에 돌려 본 적은 없다. 처음 쓸 때는 `driver.mjs`로 단계를 확인하며 돌려라.
 *
 * 배역: A(헬스장주주) = 챌린지를 만들고 먼저 운동한 친구, B(근육은퇴근중) = 링크로 참가한 주인공.
 * 장면 표시 이름은 edit-plan.json과 같다(오프셋은 녹화마다 bursts로 다시 잡는다).
 *
 * ⚠️ XP 창은 **그날 첫 "유효" 운동**에만 뜬다. 웨이트는 완료 세트 3개 이상이어야 유효
 *    (`is_valid_workout`). 2026-09-14에 2세트로 찍어 XP가 안 나왔다 → 3세트로 준비한다.
 * ⚠️ 시작일이 내일인 챌린지를 "지금 바로 시작"해도 오늘 운동은 집계되지 않는다
 *    (README §발견한 문제). 그래서 진행률 장면은 **이미 진행 중인** 챌린지로 보여 준다.
 * ⚠️ 운동을 시작·완료하면 크루 전원(실사용자 포함)에게 자동 알림이 간다. README §생성 데이터.
 * ⚠️ 먼저 `driver.mjs`를 끈다 — 같은 브라우저 프로필을 두 프로세스가 못 연다.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNTS, PROD_URL, ROOT, WORK, ensureDir, installTapIndicator, launchAccount, sessionEmail, sleep,
} from "./lib.mjs";
import { startRecording } from "./screencast.mjs";

const MODE = process.argv[2] ?? "record";
const CHALLENGE_NAME = process.env.DEMO_CHALLENGE ?? "같이 하면 한다 챌린지";
const PROGRESS_CHALLENGE = process.env.DEMO_PROGRESS_CHALLENGE ?? "9월 4주 챌린지";
const PHOTO_B = process.env.DEMO_PHOTO_B ?? join(ROOT, "work", "photos-odengki", "2-1788387227171.jpg");

if (MODE === "record" && !existsSync(PHOTO_B)) throw new Error(`인증 사진 없음: ${PHOTO_B}`);

// ── 공통 조작 (사람 속도) ──────────────────────────────────────────
const beat = (ms = 700) => sleep(ms);
const role = (page, r, name, exact = true) => page.getByRole(r, { name, exact }).first();

async function tap(locator, after = 650) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.scrollIntoViewIfNeeded();
  await sleep(250);
  await locator.tap();
  await sleep(after);
}

/** 부드러운 스크롤 — 휠을 잘게 나눠 사람이 쓸어 올리는 속도로 */
async function swipe(page, px) {
  await page.mouse.move(202, 430);
  const n = Math.max(1, Math.round(Math.abs(px) / 36));
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, Math.sign(px) * 36);
    await sleep(14);
  }
  await sleep(400);
}

const waitText = (page, text, timeout = 20000) =>
  page.getByText(text).first().waitFor({ state: "visible", timeout });

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await sleep(500);
}

async function open(key) {
  const context = await launchAccount(key, { hires: MODE === "record" });
  const email = await sessionEmail(context);
  if (email !== ACCOUNTS[key].email) {
    await context.close();
    throw new Error(`[${key}] 로그인 필요 (현재: ${email}) — node login.mjs ${key}`);
  }
  await installTapIndicator(context);
  const page = context.pages()[0] ?? (await context.newPage());
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("analytics_events")) {
      problems.push(`${r.status()} ${r.request().method()} ${r.url().replace(PROD_URL, "").slice(0, 110)}`);
    }
  });
  return { key, context, page, problems };
}

// ── 준비: B의 오늘 계획 = 벤치프레스 55·60·60kg × 10 ──────────────────
async function prepB({ page }) {
  await page.goto(`${PROD_URL}/record`, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (await role(page, "button", "운동 종료").count()) {
    throw new Error("[B] 이미 진행 중인 운동이 있다 — 녹화 전제가 깨졌다");
  }
  // 프로그램이 넣어 둔 종목(풀업 등)을 뺀다
  for (;;) {
    const names = await page.getByRole("button", { name: /삭제$/ })
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const target = names.find((n) => n && n !== "벤치프레스 삭제" && !n.includes("사진"));
    if (!target) break;
    await tap(role(page, "button", target), 1000);
  }
  if (!(await role(page, "button", "벤치프레스 삭제").count())) {
    const plan = role(page, "button", "운동 계획하기");
    await tap((await plan.count()) ? plan : role(page, "button", "+ 운동 추가"));
    await tap(page.getByText("운동 직접 고르기").first());
    await page.locator('input[placeholder*="운동 검색"]').first().fill("벤치프레스");
    await sleep(900);
    await tap(page.getByRole("button", { name: /^벤치프레스 가슴/ }).first());
    await tap(page.getByText("선택한 1개 운동 추가").first(), 1500);
  }
  const want = ["55", "60", "60"];
  const rows = page.getByRole("table").getByRole("row");
  while ((await rows.count()) - 1 < want.length) await tap(role(page, "button", "+ 세트"), 700);
  for (let i = 0; i < want.length; i++) {
    const boxes = rows.nth(i + 1).getByRole("textbox");
    await boxes.nth(0).fill(want[i]);
    await boxes.nth(1).fill("10");
  }
  await sleep(800);
  await page.screenshot({ path: join(ensureDir(join(WORK, "prep")), "B-plan.png"), scale: "css" });
  console.log("[B] 준비 완료 — work/prep/B-plan.png 확인");
}

// ── 녹화 ────────────────────────────────────────────────────────────
async function record(a, b) {
  const run = join(WORK, "rec", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  const A = a.page;
  const B = b.page;
  for (const p of [A, B]) {
    await p.goto(`${PROD_URL}/challenge`, { waitUntil: "domcontentloaded" });
    await settle(p);
  }
  const recA = await startRecording(A, join(run, "A"));
  const recB = await startRecording(B, join(run, "B"));
  await beat(800);

  // C — A가 챌린지를 만든다 (하루 1종목+ · 주 3일 · 참여 계획 주 3일)
  recA.mark("c02-a-add-tap");
  await tap(A.getByText("챌린지 추가하기").first(), 1400);
  await tap(A.locator('input[placeholder="챌린지 이름을 입력하세요"]').first(), 400);
  await A.keyboard.type(CHALLENGE_NAME, { delay: 60 });
  await beat(900);
  recA.mark("c03-a-goal");
  await tap(role(A, "button", "하루 최소 종목 수 줄이기"), 600);
  await tap(role(A, "button", "하루 최소 종목 수 줄이기"), 700);
  await tap(role(A, "button", "계획 운동일 늘리기"), 900);
  await swipe(A, 500);
  recA.mark("c04-a-create-tap");
  await tap(A.getByRole("button", { name: /^챌린지 만들기/ }).first(), 2500);
  recA.mark("c05-a-link-tap");
  await tap(role(A, "button", "🔗 초대 링크 복사하기"), 1500);
  const link = (await A.getByText(/challenge\?join=/).first().textContent()).trim();
  const url = new URL(link);

  // B — 링크로 참가 → 목표 → 동의
  recB.mark("c06-b-open-link");
  await B.goto(`${PROD_URL}${url.pathname}${url.search}`, { waitUntil: "domcontentloaded" });
  await waitText(B, "설정하기");
  await beat(2000);
  recB.mark("c07-b-goal-tap");
  await tap(B.getByRole("button", { name: /설정하기/ }).first(), 1400);
  recB.mark("c08-b-goal-edit");
  await tap(role(B, "button", "하루 최소 종목 수 줄이기"), 500);
  await tap(role(B, "button", "하루 최소 종목 수 줄이기"), 600);
  // B의 기본 참여 계획(주 5일)을 주 3일로 — 기본값은 계정마다 다르니 문구를 보고 맞춘다
  for (let i = 0; i < 6 && !(await B.getByText("주 3일", { exact: true }).count()); i++) {
    await tap(role(B, "button", "계획 운동일 줄이기"), 400);
  }
  recB.mark("c08-b-save-tap");
  await tap(B.getByRole("button", { name: /^내 목표 저장/ }).first(), 2200);
  recB.mark("c09-b-consent-tap");
  await tap(B.getByRole("button", { name: /^참가자 전원의 목표에 동의하기/ }).first(), 2000);

  // A — 새 챌린지를 골라 동의 (시작은 누르지 않는다: 시작일 문제)
  recA.mark("c10-a-reload");
  await A.goto(`${PROD_URL}/challenge`, { waitUntil: "domcontentloaded" });
  await settle(A);
  await tap(A.getByRole("button", { name: new RegExp(`^${CHALLENGE_NAME}`) }).first(), 1800);
  await swipe(A, 260);
  recA.mark("c11-a-consent-tap");
  await tap(A.getByRole("button", { name: /^참가자 전원의 목표에 동의하기/ }).first(), 2200);
  recA.mark("c12-end");

  // M1 — B 홈 → 피드
  await B.goto(`${PROD_URL}/home`, { waitUntil: "domcontentloaded" });
  await settle(B);
  recB.mark("m01-home");
  await beat(2800);
  await swipe(B, 560);
  await beat(2400);
  recB.mark("m02-feed-tap");
  await tap(role(B, "link", "피드"), 200);
  await waitText(B, "WORKOUT COMPLETED");
  recB.mark("m02-feed");
  await beat(3600);

  // M3 — 기록 → 운동 시작
  recB.mark("m03-record-tap");
  await tap(role(B, "link", "기록"), 200);
  await waitText(B, "벤치프레스");
  recB.mark("m03-record");
  await beat(2000);
  recB.mark("m03-start-tap");
  await tap(role(B, "button", "운동 시작"), 200);
  await waitText(B, "지금 운동 중");
  recB.mark("m03-started");
  await beat(1500);

  // M4 — 1세트: 55 → 60kg, 완료 → 휴식
  recB.mark("m04-set1");
  await tap(role(B, "button", "무게 늘리기"), 550);
  await tap(role(B, "button", "무게 늘리기"), 1000);
  await tap(role(B, "button", "✓ 운동 완료"), 1500);
  recB.mark("m04-resting");
  await beat(1500);

  // M5 — A가 홈에서 운동 중인 B에게 💪 → B 화면 배너
  const banner = waitText(B, "헬스장주주님의 응원", 45000).then(() => recB.mark("m06-banner"));
  await A.goto(`${PROD_URL}/home`, { waitUntil: "domcontentloaded" });
  await waitText(A, "운동 중");
  recA.mark("m05-a-ready");
  await beat(1200);
  recA.mark("m05-a-cheer");
  await tap(role(A, "button", "💪 힘내"), 1800);
  await banner.catch(() => console.log("  ⚠️ B 배너를 못 봤다"));
  await beat(3000);
  const ok = role(A, "button", "확인");
  if (await ok.count()) await tap(ok, 600);

  // M7 — 사진 인증 (버튼 → 카메라 파일 선택)
  recB.mark("m07-photo");
  const chooser = B.waitForEvent("filechooser", { timeout: 10000 });
  await tap(B.getByRole("button", { name: /^지금 사진 찍기/ }).first(), 0);
  await (await chooser).setFiles(PHOTO_B);
  await waitText(B, /사진 1\/5/, 30000);
  recB.mark("m07-photo-done");
  await beat(1800);

  // M8 — 휴식 끝내고 2·3세트 → 완료 → 결과
  recB.mark("m08-set2");
  await tap(role(B, "button", "▶ 다음 운동 시작"), 1200);
  await tap(role(B, "button", "✓ 운동 완료"), 1500);
  const next = role(B, "button", "▶ 다음 운동 시작");
  if (await next.count()) await tap(next, 1200);
  recB.mark("m08-done-tap");
  await tap(role(B, "button", "✓ 운동 완료"), 1300);
  recB.mark("m08-all-done");
  await waitText(B, "오늘 운동 완료!", 30000);
  recB.mark("m09-result");
  // XP 결과 창 — 하나씩 넘긴다(다음 → 확인)
  for (let i = 0; i < 8; i++) {
    const btn = B.getByRole("button", { name: /^(다음|확인)$/ }).first();
    try {
      await btn.waitFor({ state: "visible", timeout: i === 0 ? 8000 : 3000 });
    } catch {
      if (i === 0) console.log("  ⚠️ XP 창이 뜨지 않았다 — 완료 세트 3개 이상인지, 오늘 첫 유효 운동인지 확인");
      break;
    }
    recB.mark(`m09-xp-${i}`);
    await beat(2300);
    await tap(btn, 700);
  }
  recB.mark("m09-result-top");
  await beat(2500);
  await swipe(B, 330);
  recB.mark("m09-result-after");
  await beat(2000);

  // M10 — A 피드에서 B 기록에 좋아요
  await A.goto(`${PROD_URL}/feed`, { waitUntil: "domcontentloaded" });
  await waitText(A, "WORKOUT COMPLETED");
  recA.mark("m10-a-feed");
  await beat(2400);
  const top = A.getByRole("article").first();
  if (!(await top.getByText("근육은퇴근중").count())) throw new Error("[A] 피드 맨 위가 B의 기록이 아니다");
  recA.mark("m10-a-like");
  await tap(top.getByRole("button", { name: /^좋아요 \d+$/ }).first(), 1800);

  // M11 — B 알림함
  await B.goto(`${PROD_URL}/home`, { waitUntil: "domcontentloaded" });
  await settle(B);
  recB.mark("m11-notif-tap");
  await tap(role(B, "button", "알림함"), 400);
  await waitText(B, "헬스장주주님이");
  recB.mark("m11-notif");
  await beat(3400);

  // M12 — 진행 중인 챌린지의 진행률 → 활동
  await B.goto(`${PROD_URL}/challenge`, { waitUntil: "domcontentloaded" });
  await waitText(B, "챌린지 추가하기");
  const current = B.getByText(new RegExp(`^${PROGRESS_CHALLENGE} ·`)).first();
  if (!(await current.count())) {
    await tap(B.getByRole("button", { name: new RegExp(`^${PROGRESS_CHALLENGE}`) }).first(), 1800);
  }
  await swipe(B, 130);
  recB.mark("m12-challenge");
  await beat(3400);
  await swipe(B, 880);
  recB.mark("m12-activity");
  await beat(3200);
  recA.mark("end");
  recB.mark("end");

  console.log("A", await recA.stop());
  console.log("B", await recB.stop());
  return run;
}

const a = MODE === "prep" ? null : await open("A");
const b = await open("B");
try {
  if (MODE === "prep") await prepB(b);
  else console.log(`녹화 폴더: ${await record(a, b)}`);
} finally {
  for (const s of [a, b].filter(Boolean)) {
    if (s.problems.length) console.log(`[${s.key}] 응답 오류:\n  ${[...new Set(s.problems)].join("\n  ")}`);
    await s.context.close();
  }
}
