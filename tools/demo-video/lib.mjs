/**
 * 데모 영상 도구 공용 모듈.
 *
 * ⚠️ 이 폴더는 앱 코드와 섞지 않는다. 운영 앱을 **바깥에서** 사람처럼 조작할 뿐이다.
 * ⚠️ 비밀번호를 여기서 다루지 않는다. 로그인은 `login.mjs`가 연 창에서 사람이 직접 하고,
 *    세션은 `.profiles/<계정>/`(gitignore)에 브라우저 프로필로 남는다.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const WORK = join(ROOT, "work");
export const PROD_URL = process.env.DEMO_URL ?? "https://gnd-one.vercel.app";

/** Supabase 프로젝트 ref — 세션 쿠키 이름에 들어간다(비밀값 아님) */
const SUPABASE_REF = "cjdskubyxlnojwzhwbfx";

export const ACCOUNTS = {
  A: { email: "dev-fixture-a@gnd.local", role: "먼저 운동한 친구 · 반응하는 쪽" },
  B: { email: "dev-fixture-b@gnd.local", role: "주인공 · 운동 기록·사진 인증·완료" },
};

/**
 * 9:16 세로. 405×720 CSS px × 8/3 = **1080×1920** 실픽셀.
 * 안드로이드 크롬 UA — 실제 폰에서 여는 것과 같은 분기를 타게 한다.
 */
export const MOBILE = {
  viewport: { width: 405, height: 720 },
  deviceScaleFactor: 8 / 3,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
};

export function profileDir(key) {
  return join(ROOT, ".profiles", key);
}

/**
 * @param hires 녹화용. ⚠️ 헤드리스 screencast는 기기 배율 에뮬레이션만으로는 **405×720**
 *   프레임을 준다(2026-09-14 실측). `--force-device-scale-factor`를 **같이** 줘야
 *   1080×1920이 나오고, 에뮬레이션도 남겨야 페이지가 고해상도 이미지를 고른다(dpr 2.67).
 */
export async function launchAccount(key, { headless = true, args = [], hires = false } = {}) {
  if (!ACCOUNTS[key]) throw new Error(`계정은 A 또는 B: ${key}`);
  const context = await chromium.launchPersistentContext(profileDir(key), {
    headless,
    ...MOBILE,
    // 알림 권한 팝업이 영상에 끼지 않게 — 거부도 허용도 아닌 "묻지 않음"은 없어서
    // 권한을 주지 않고 둔다(앱의 푸시 카드는 그대로 실제 UI다).
    args: [
      "--hide-scrollbars",
      "--disable-features=Translate",
      ...(hires ? ["--force-device-scale-factor=2.6666667"] : []),
      ...args,
    ],
  });
  return context;
}

/**
 * 컨텍스트의 Supabase 세션이 **어느 이메일**인지. 토큰 값은 밖으로 내보내지 않는다.
 * @supabase/ssr 쿠키: `sb-<ref>-auth-token`(길면 `.0`,`.1`… 로 쪼개짐), 값은 `base64-<b64url JSON>`.
 */
export async function sessionEmail(context) {
  const name = `sb-${SUPABASE_REF}-auth-token`;
  const cookies = (await context.cookies(PROD_URL)).filter(
    (c) => c.name === name || c.name.startsWith(`${name}.`),
  );
  if (cookies.length === 0) return null;
  cookies.sort((a, b) => {
    const ia = a.name === name ? -1 : Number(a.name.split(".").pop());
    const ib = b.name === name ? -1 : Number(b.name.split(".").pop());
    return ia - ib;
  });
  let raw = cookies.map((c) => c.value).join("");
  try {
    raw = decodeURIComponent(raw);
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
    }
    const session = JSON.parse(raw);
    // 익명 계정은 email이 빈 문자열("")이다 — `??`로는 안 걸린다
    if (session?.user?.is_anonymous || !session?.user?.email) {
      return session?.user ? "(익명)" : null;
    }
    return session.user.email;
  } catch {
    return null;
  }
}

/**
 * 탭 표시 — 안드로이드 개발자 옵션 "탭 표시"와 같은 역할의 반투명 원.
 * 앱 DOM을 바꾸지 않도록 `pointer-events:none` 오버레이만 얹는다.
 */
export async function installTapIndicator(context) {
  await context.addInitScript(() => {
    const draw = (x, y) => {
      const host = document.body ?? document.documentElement;
      if (!host) return;
      const dot = document.createElement("div");
      dot.setAttribute("data-demo-tap", "");
      Object.assign(dot.style, {
        position: "fixed",
        left: `${x - 22}px`,
        top: `${y - 22}px`,
        width: "44px",
        height: "44px",
        borderRadius: "9999px",
        background: "rgba(255,255,255,0.38)",
        border: "2px solid rgba(255,255,255,0.75)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        zIndex: "2147483647",
        transform: "scale(0.6)",
        opacity: "1",
        transition: "transform 380ms ease-out, opacity 380ms ease-out",
      });
      host.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = "scale(1)";
        setTimeout(() => {
          dot.style.opacity = "0";
        }, 260);
      });
      setTimeout(() => dot.remove(), 800);
    };
    window.addEventListener(
      "pointerdown",
      (e) => draw(e.clientX, e.clientY),
      { capture: true, passive: true },
    );
  });
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
