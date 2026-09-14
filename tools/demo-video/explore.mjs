/**
 * 화면 탐색 — 한 계정으로 경로를 열고, 단계별로 조작하며 스크린샷·텍스트를 남긴다.
 * 녹화 스크립트를 짜기 전에 **실제 UI의 문구·위치**를 확인하는 용도다.
 *
 *   node explore.mjs B /record
 *   node explore.mjs B /record '[{"tap":"text=운동 시작"},{"wait":1500},{"shot":"after"}]'
 *
 * 단계: {tap: selector} {fill: selector, value} {scroll: px} {wait: ms} {shot: name}
 *       {goto: path} {press: key} {file: selector, path} {text: true}
 * ⚠️ 운영 DB에 붙는다. 픽스처 계정으로만, 필요한 조작만 한다.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNTS, PROD_URL, WORK, ensureDir, installTapIndicator, launchAccount,
  sessionEmail, sleep,
} from "./lib.mjs";

const key = (process.argv[2] ?? "").toUpperCase();
const path = process.argv[3] ?? "/home";
const steps = JSON.parse(process.argv[4] ?? "[]");
const dir = ensureDir(join(WORK, "explore"));

const context = await launchAccount(key);
await installTapIndicator(context);
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("_next/webpack")) {
    errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(PROD_URL, "").slice(0, 120)}`);
  }
});

const email = await sessionEmail(context).catch(() => null);
await page.goto(`${PROD_URL}${path}`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await sleep(1200);

let n = 0;
const shot = async (name) => {
  const file = join(dir, `${key}-${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, scale: "css" });
  console.log(`📸 ${file}`);
};
const dumpText = async () => {
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`--- text (${page.url().replace(PROD_URL, "")}) ---\n${text.slice(0, 3000)}\n---`);
};

console.log(`[${key}] session=${email === ACCOUNTS[key].email ? "fixture OK" : email}`);
await shot("open");

for (const s of steps) {
  if (s.tap) await page.locator(s.tap).first().tap({ timeout: 8000 });
  if (s.click) await page.locator(s.click).first().click({ timeout: 8000 });
  if (s.fill) await page.locator(s.fill).first().fill(String(s.value));
  if (s.press) await page.keyboard.press(s.press);
  if (s.scroll) await page.mouse.wheel(0, s.scroll);
  if (s.goto) await page.goto(`${PROD_URL}${s.goto}`, { waitUntil: "domcontentloaded" });
  if (s.file) await page.locator(s.file).first().setInputFiles(s.path);
  if (s.wait) await sleep(s.wait);
  if (s.text) await dumpText();
  if (s.shot) await shot(s.shot);
}

if (steps.length === 0) await dumpText();
if (errors.length) console.log(`--- errors ---\n${[...new Set(errors)].join("\n")}`);
writeFileSync(join(dir, `${key}-last-url.txt`), page.url());
await context.close();
