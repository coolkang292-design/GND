// 배지 시트(격자 이미지) → 낱장 PNG 분리
//
// 실행:  npm i -D sharp  (또는 별도 폴더에 설치)  후
//        node scripts/slice-badge-sheets.mjs
//        BADGE_SHEETS=경로 로 원본 폴더를 바꿀 수 있다 (기본 '배지이미지').
//
// 왜 좌표로 안 자르나: 생성물의 격자가 매번 조금씩 밀린다. 알파 채널에서
// 배지 덩어리를 직접 찾아 자르면 격자가 삐뚤어도 정확히 잘린다.
//
// 주의 — 시트를 만들 때 세로 간격을 가로만큼 띄울 것. 1차 시도에서 세로가
// 31px(가로는 137px)이라 위아래 배지 꼭짓점이 딸려 들어왔다. 지금은 이웃
// 중심까지의 거리로 축별 여백을 잘라 막고 있지만, 애초에 넉넉한 편이 낫다.
//
// 설계: docs/superpowers/specs/2026-07-27-badge-catalog-and-point-economy-design.md
// 규격: docs/badge-asset-prompts.md
import sharp from "sharp";
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = process.env.BADGE_SHEETS ?? "배지이미지";
const OUT = "public/badges";
const CORE = 160, MIN_PX = 3000, EXPAND = 1.30, SIZE = 384;
const CORE_FRAC = 0.74; // 배지 본체가 캔버스에서 차지할 비율 (나머지는 글로우 여백)

// 시트별 읽는 순서 → badge_key. null은 건너뛴다(빈 배지).
const MAP = {
  "(1)": ["workout_1","workout_10","minutes_300","streak_5","volume_1t","volume_5t","cardio_10k","record_beaten_1","record_beaten_5"],
  "(2)": ["workout_30","workout_50","minutes_1200","streak_best_15","volume_20t","volume_50t","cardio_42k","cardio_100k","record_beaten_10"],
  "(3)": ["workout_100","minutes_3000","streak_best_30","streak_best_60","volume_100t","cardio_250k","record_beaten_25"],
  "(4)": ["workout_200","minutes_6000","streak_best_100","volume_250t","cardio_500k"],
};

function blobs(data, w, h, c) {
  const seen = new Uint8Array(w * h), out = [], stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (seen[p] || data[p * c + 3] < CORE) continue;
    let sp = 0; stack[sp++] = p; seen[p] = 1;
    let minX = w, maxX = -1, minY = h, maxY = -1, n = 0;
    while (sp > 0) {
      const q = stack[--sp], x = q % w, y = (q / w) | 0;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (!seen[r] && data[r * c + 3] >= CORE) { seen[r] = 1; stack[sp++] = r; }
      }
    }
    if (n >= MIN_PX) out.push({ minX, minY, maxX, maxY });
  }
  const rows = [];
  out.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
  for (const b of out) {
    const row = rows.find((r) => Math.abs(r[0].minY - b.minY) < 120);
    if (row) row.push(b); else rows.push([b]);
  }
  for (const r of rows) r.sort((a, b) => a.minX - b.minX);
  return rows.flat();
}

mkdirSync(OUT, { recursive: true });
let made = 0;
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".png")).sort()) {
  const tag = f.match(/\((\d)\)/)?.[0];
  const keys = MAP[tag];
  if (!keys) { console.log(`건너뜀 (매핑 없음): ${f}`); continue; }

  const img = sharp(join(SRC, f)).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const found = blobs(data, w, h, c);
  if (found.length !== keys.length) {
    console.log(`⚠️  ${tag} 검출 ${found.length} ≠ 매핑 ${keys.length} — 건너뜀`);
    continue;
  }

  for (let i = 0; i < found.length; i++) {
    const key = keys[i];
    if (!key) { console.log(`   · ${tag}#${i+1} 빈 배지 — 건너뜀`); continue; }
    const b = found[i];
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;

    // 원하는 여백만큼 넓히되, 이웃 배지 중심까지의 절반을 넘지 않게 축별로 자른다.
    // 시트에 따라 세로 간격이 31px밖에 안 되는 곳이 있어(가로는 137px)
    // 사방을 똑같이 넓히면 위아래 배지 꼭짓점이 딸려 들어온다.
    let halfW = (bw * EXPAND) / 2, halfH = (bh * EXPAND) / 2;
    for (let j = 0; j < found.length; j++) {
      if (j === i) continue;
      const o = found[j];
      const ox = (o.minX + o.maxX) / 2, oy = (o.minY + o.maxY) / 2;
      const dx = Math.abs(cx - ox), dy = Math.abs(cy - oy);
      if (dx > dy) halfW = Math.min(halfW, (dx / 2) * 0.96);
      else halfH = Math.min(halfH, (dy / 2) * 0.96);
    }
    // 잘라낸 사각형은 정사각이 아니어도 된다 — resize의 contain이 투명으로 채운다
    let left = Math.round(cx - halfW), top = Math.round(cy - halfH);
    const sideW = Math.round(halfW * 2), sideH = Math.round(halfH * 2);
    const padL = Math.max(0, -left), padT = Math.max(0, -top);
    const padR = Math.max(0, left + sideW - w), padB = Math.max(0, top + sideH - h);
    left = Math.max(0, left); top = Math.max(0, top);
    const cw = Math.min(sideW - padL - padR, w - left), ch = Math.min(sideH - padT - padB, h - top);

    // 본체(코어) 크기를 기준으로 정규화한다 — 안 하면 이웃 간격에 따라
    // 잘린 여백이 달라져서 나란히 놓았을 때 크기가 들쭉날쭉해 보인다.
    const scale = (SIZE * CORE_FRAC) / Math.max(bw, bh);
    const sw = Math.max(1, Math.round(cw * scale)), sh = Math.max(1, Math.round(ch * scale));
    const scaled = await sharp(join(SRC, f))
      .ensureAlpha()
      .extract({ left, top, width: cw, height: ch })
      .extend({ top: padT, bottom: padB, left: padL, right: padR,
                background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(sw, sh)
      .toBuffer();

    // 코어 중심이 정확히 캔버스 한가운데 오도록 얹는다
    const coreCx = (cx - (left - padL)) * scale, coreCy = (cy - (top - padT)) * scale;
    const offX = Math.round(SIZE / 2 - coreCx), offY = Math.round(SIZE / 2 - coreCy);
    const exL = Math.max(0, -offX), exT = Math.max(0, -offY);
    const exW = Math.min(sw - exL, SIZE - Math.max(0, offX));
    const exH = Math.min(sh - exT, SIZE - Math.max(0, offY));
    const piece = await sharp(scaled)
      .extract({ left: exL, top: exT, width: exW, height: exH })
      .toBuffer();

    await sharp({ create: { width: SIZE, height: SIZE, channels: 4,
                            background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: piece, left: Math.max(0, offX), top: Math.max(0, offY) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(join(OUT, `${key}.png`));
    made++;
  }
  console.log(`✅ ${tag} → ${keys.filter(Boolean).length}장`);
}
console.log(`\n총 ${made}장 생성`);
