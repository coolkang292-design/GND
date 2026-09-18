/**
 * 탐색용 조종기 — A·B 브라우저를 **띄워 둔 채** 한 단계씩 명령을 받는다.
 * 매번 브라우저를 새로 켜면 진행 중인 화면(시트·오버레이)이 날아가서 흐름을 끝까지 못 따라간다.
 *
 *   node driver.mjs            # 서버 (백그라운드로 켜 둔다) — 127.0.0.1:7777
 *   node drive.mjs A '[{"goto":"/record"},{"snap":true}]'
 *
 * 단계:
 *   {goto:"/path"} {tap:"css/playwright selector"} {tapText:"문구", exact?:true}
 *   {tapRole:"button", name:"문구"} {fill:selector, value} {type:"문자열"}
 *   {press:"Enter"} {scroll:px} {wait:ms} {shot:"이름"} {snap:true} {text:true}
 *   {back:true}  // 기기 뒤로가기(브라우저 히스토리)
 *   {viewport:{width,height}} {overflow:true}  // 폭 바꾸기 · 가로 넘침 검사
 *   {file:selector, path:"파일"} {url:true}
 *
 * ⚠️ 운영 DB에 붙는다. 픽스처 계정 A·B 전용이다.
 */
import http from "node:http";
import { join } from "node:path";
import {
  PROD_URL, WORK, ensureDir, installTapIndicator, launchAccount, sleep,
} from "./lib.mjs";
import { startRecording } from "./screencast.mjs";

const PORT = 7777;
const dir = ensureDir(join(WORK, "drive"));
const headless = process.env.HEADED !== "1";
/** 녹화 폴더 — 한 번 켜진 조종기는 한 녹화(run)에 속한다 */
const RUN = join(WORK, "rec", process.env.RUN ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));

/** "/정규식/" 문자열이면 RegExp로 */
const nameOf = (n) => (typeof n === "string" && n.length > 2 && n.startsWith("/") && n.endsWith("/")
  ? new RegExp(n.slice(1, -1))
  : n);

const sessions = {};
for (const key of ["A", "B"]) {
  const context = await launchAccount(key, {
    headless,
    hires: true,
    args: [`--window-position=${key === "A" ? 40 : 560},40`],
  });
  await installTapIndicator(context);
  const page = context.pages()[0] ?? (await context.newPage());
  const log = [];
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      log.push(`${r.status()} ${r.request().method()} ${r.url().replace(PROD_URL, "").slice(0, 120)}`);
    }
  });
  await page.goto(`${PROD_URL}/home`, { waitUntil: "domcontentloaded" });
  sessions[key] = { context, page, log, n: 0, rec: null };
}

async function run(key, steps) {
  const s = sessions[key];
  if (!s) throw new Error(`계정 없음: ${key}`);
  const { page } = s;
  const out = [];
  for (const st of steps) {
    if (st.rec === "start" && !s.rec) {
      s.rec = await startRecording(page, join(RUN, key));
      out.push(`⏺ 녹화 시작 ${join(RUN, key)}`);
    }
    if (st.mark && s.rec) s.rec.mark(st.mark);
    if (st.rec === "stop" && s.rec) {
      out.push(`⏹ 녹화 종료 ${JSON.stringify(await s.rec.stop())}`);
      s.rec = null;
    }
    if (st.goto) {
      await page.goto(`${PROD_URL}${st.goto}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    }
    if (st.tap) await page.locator(st.tap).first().tap({ timeout: 8000 });
    if (st.tapText) {
      await page.getByText(nameOf(st.tapText), { exact: st.exact ?? false }).first().tap({ timeout: 8000 });
    }
    if (st.tapRole) {
      await page.getByRole(st.tapRole, { name: nameOf(st.name), exact: st.exact ?? false }).first().tap({ timeout: 8000 });
    }
    if (st.waitText) {
      await page.getByText(nameOf(st.waitText)).first().waitFor({ state: "visible", timeout: st.timeout ?? 20000 });
    }
    if (st.chooseFile) {
      // 실제 사용자처럼 버튼을 누르고, 뜨는 파일 선택(카메라) 창에 파일을 넣는다
      const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
      await page.getByRole("button", { name: nameOf(st.chooseFile) }).first().tap({ timeout: 8000 });
      await (await chooser).setFiles(st.path);
    }
    if (st.swipe) {
      // 부드러운 스크롤 (사람이 쓸어 올리는 속도)
      await page.mouse.move(202, 430);
      const n = Math.max(1, Math.round(Math.abs(st.swipe) / 36));
      for (let i = 0; i < n; i++) {
        await page.mouse.wheel(0, Math.sign(st.swipe) * 36);
        await sleep(14);
      }
      await sleep(400);
    }
    if (st.fill) await page.locator(st.fill).first().fill(String(st.value));
    if (st.type) await page.keyboard.type(String(st.type), { delay: 60 });
    if (st.press) await page.keyboard.press(st.press);
    if (st.scroll) await page.mouse.wheel(0, st.scroll);
    if (st.file) await page.locator(st.file).first().setInputFiles(st.path);
    if (st.viewport) {
      // 폭 확인용 — 저장소 규칙이 375px·390px을 요구한다(CLAUDE.md §화면 확인)
      await page.setViewportSize({
        width: st.viewport.width ?? 375,
        height: st.viewport.height ?? 720,
      });
      await sleep(600);
      out.push(`📐 ${st.viewport.width ?? 375}×${st.viewport.height ?? 720}`);
    }
    if (st.overflow) {
      // 가로 스크롤이 생겼는지와, 생겼다면 **무엇이 넘쳤는지**까지 본다.
      // "가로 스크롤 없음"만 눈으로 보면 한 칸 넘친 카드를 놓친다.
      const o = await page.evaluate(() => {
        const de = document.documentElement;
        const over = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > de.clientWidth + 1) {
            over.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 50)} right=${Math.round(r.right)}`);
          }
        }
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          over: over.slice(0, 8),
        };
      });
      out.push(
        `↔ scrollWidth=${o.scrollWidth} clientWidth=${o.clientWidth} ` +
          (o.scrollWidth > o.clientWidth
            ? `⚠️ 가로 스크롤 — ${o.over.join(" | ")}`
            : "가로 스크롤 없음"),
      );
    }
    if (st.back) {
      // 기기 뒤로가기 — 앱의 ← 버튼이 아니라 브라우저 히스토리를 직접 되돌린다.
      // `?open=` 상세가 popstate로 목록으로 돌아오는지 보려면 이것이어야 한다.
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    if (st.wait) await sleep(st.wait);
    if (st.shot) {
      const file = join(dir, `${key}-${String(++s.n).padStart(3, "0")}-${st.shot}.png`);
      await page.screenshot({ path: file, scale: "css" });
      out.push(`📸 ${file}`);
    }
    if (st.snap) {
      const snap = await page.locator("body").ariaSnapshot();
      out.push(`--- snap (${page.url().replace(PROD_URL, "")}) ---\n${snap.slice(0, st.max ?? 6000)}`);
    }
    if (st.text) {
      const t = await page.evaluate(() => document.body.innerText);
      out.push(`--- text ---\n${t.slice(0, st.max ?? 3000)}`);
    }
    if (st.url) out.push(`url: ${page.url()}`);
  }
  if (s.log.length) {
    out.push(`--- log ---\n${[...new Set(s.log)].join("\n")}`);
    s.log.length = 0;
  }
  return out.join("\n");
}

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { key, steps } = JSON.parse(body);
      const text = await run(key, steps);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(text);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`ERROR: ${e.message.split("\n").slice(0, 6).join("\n")}`);
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`driver ready :${PORT} (headless=${headless}) run=${RUN}`));

// 끌 때 녹화 중이던 것을 마저 저장한다
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    for (const s of Object.values(sessions)) {
      if (s.rec) await s.rec.stop().catch(() => {});
      await s.context.close().catch(() => {});
    }
    process.exit(0);
  });
}
