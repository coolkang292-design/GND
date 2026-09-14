/**
 * 손가락 아이콘 PNG 만들기 — 윈도우 컬러 이모지 👆(Segoe UI Emoji)를 헤드리스 크롬 캔버스에 그린다.
 * 외부 이미지를 내려받지 않는다. 손끝 좌표를 같이 재서 work/finger.json에 쓴다.
 *
 *   node finger.mjs        → work/finger.png, work/finger.json {file, w, h, tipX, tipY}
 *
 * 사용자 지시 2026-09-14 "클릭을 하는 걸 손가락으로 표시하면서 표현". edit.mjs가 탭 위치에 얹는다.
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ensureDir } from "./lib.mjs";

const SIZE = Number(process.env.FINGER_PX ?? 118);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const r = await page.evaluate(async (size) => {
  await document.fonts.ready;
  const W = size * 3;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = W;
  const g = c.getContext("2d");
  g.font = `${size}px 'Segoe UI Emoji'`;
  g.textBaseline = "top";
  // 어두운 앱 화면·노란 버튼 위 어디서든 보이게 그림자
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 12;
  g.shadowOffsetY = 5;
  g.fillText("👆", size * 0.8, size * 0.8);
  const d = g.getImageData(0, 0, W, W).data;
  let minX = W, minY = W, maxX = 0, maxY = 0, solidTop = W;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a > 12) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (a > 230 && y < solidTop) solidTop = y;
    }
  }
  // 손끝 = 불투명 픽셀이 처음 나오는 줄부터 8줄의 가운데
  let sx = 0, n = 0;
  for (let y = solidTop; y < solidTop + 8; y++) {
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 230) { sx += x; n++; }
  }
  const pad = 4;
  const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
  const cw = Math.min(W, maxX + pad) - cx, chh = Math.min(W, maxY + pad) - cy;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = chh;
  out.getContext("2d").drawImage(c, cx, cy, cw, chh, 0, 0, cw, chh);
  return { url: out.toDataURL("image/png"), w: cw, h: chh, tipX: Math.round(sx / n - cx), tipY: solidTop - cy };
}, SIZE);
await browser.close();

const dir = ensureDir(join(ROOT, "work"));
const file = join(dir, "finger.png");
writeFileSync(file, Buffer.from(r.url.split(",")[1], "base64"));
writeFileSync(join(dir, "finger.json"), JSON.stringify({ file, w: r.w, h: r.h, tipX: r.tipX, tipY: r.tipY }, null, 2));
console.log(`손가락 ${r.w}×${r.h}, 손끝 (${r.tipX}, ${r.tipY}) → ${file}`);
