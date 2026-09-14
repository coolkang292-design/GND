/**
 * 픽스처 계정 로그인 — **사람이 창에서 직접 한다.** 이 스크립트는 비밀번호를 모른다.
 *
 *   node login.mjs A    # 창이 뜨면 /login 에서 dev-fixture-a@gnd.local 로 로그인
 *   node login.mjs B
 *
 * 로그인되면(세션 쿠키의 이메일이 그 픽스처와 같아지면) 알아서 창을 닫는다.
 * 세션은 `.profiles/<계정>/`에 남아 이후 `record.mjs`가 그대로 쓴다.
 */
import { ACCOUNTS, PROD_URL, launchAccount, sessionEmail, sleep } from "./lib.mjs";

const key = (process.argv[2] ?? "").toUpperCase();
if (!ACCOUNTS[key]) {
  console.error("사용법: node login.mjs A|B");
  process.exit(2);
}
const want = ACCOUNTS[key].email;

// ⚠️ A·B를 같은 자리에 띄우면 겹쳐서 한 창으로 보이고, 두 번째 로그인이 엉뚱한
//    창에 들어간다(2026-09-14에 B 프로필에 A가 로그인됐다). 위치를 가르고 이름표를 단다.
const context = await launchAccount(key, {
  headless: false,
  args: [`--window-position=${key === "A" ? 40 : 560},40`],
});
await context.addInitScript(
  ({ label, color }) => {
    const put = () => {
      if (document.getElementById("demo-login-label")) return;
      const el = document.createElement("div");
      el.id = "demo-login-label";
      el.textContent = label;
      Object.assign(el.style, {
        position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483647",
        padding: "6px 8px", font: "700 13px sans-serif", textAlign: "center",
        background: color, color: "#000", pointerEvents: "none",
      });
      document.documentElement.appendChild(el);
    };
    document.addEventListener("DOMContentLoaded", put);
    setInterval(put, 1000);
  },
  {
    label: `${key} 로그인 창 · ${want}`,
    color: key === "A" ? "#7dd3fc" : "#fca5a5",
  },
);
const page = context.pages()[0] ?? (await context.newPage());

const already = await (async () => {
  await page.goto(`${PROD_URL}/home`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  return (await sessionEmail(context)) === want;
})();

if (already) {
  console.log(`[${key}] 이미 ${want} 로 로그인돼 있습니다.`);
} else {
  await page.goto(`${PROD_URL}/login`, { waitUntil: "domcontentloaded" });
  console.log(`[${key}] 창에서 ${want} 로 로그인해 주세요 (최대 30분 대기)`);
  const deadline = Date.now() + 30 * 60_000;
  let ok = false;
  while (Date.now() < deadline) {
    if (context.pages().length === 0) {
      console.log(`[${key}] 창이 닫혔습니다`);
      break;
    }
    const email = await sessionEmail(context).catch(() => null);
    if (email === want) {
      ok = true;
      break;
    }
    if (email && email !== "(익명)" && email !== want) {
      console.error(`[${key}] ⚠️ 다른 계정(${email})으로 로그인됐습니다. 로그아웃 후 다시 해 주세요.`);
    }
    await sleep(2000);
  }
  console.log(ok ? `[${key}] 로그인 확인: ${want}` : `[${key}] 로그인 확인 실패`);
  if (ok) await sleep(3000); // 앱이 첫 화면을 그리고 세션을 저장할 시간
  process.exitCode = ok ? 0 : 1;
}

await context.close();
