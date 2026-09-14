/**
 * 녹화 프레임에서 **탭 위치·시각**을 찾는다 — 편집에서 손가락 아이콘을 얹기 위해.
 *
 *   node taps.mjs work/rec/<run> edit-plan-easy.json     → work/rec/<run>/taps.json + taps-check/*.png
 *
 * 왜 필요한가: 2026-09-14 녹화는 탭 좌표를 기록하지 않았다. 대신 `lib.mjs`의 탭 표시(흰 원,
 * 44 CSS px, 0.8초)가 프레임에 찍혀 있다. 그 원을 찾는다.
 *   1) 시각: 화면이 몰려 바뀌는 0.45~1.6초짜리 프레임 묶음의 시작 = 탭 후보
 *   2) 위치: 탭+0.2초 프레임과 원이 사라진 뒤(+1.0초) 또는 탭 직전 프레임을 비교해
 *      "밝아진 회백색·동그란 덩어리"를 찾는다. 스크롤처럼 원이 없는 묶음은 버려진다.
 * ⚠️ 결과는 반드시 taps-check 이미지로 눈으로 확인한다. 틀린 탭은 taps.json에서 지운다.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(resolve("node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"));

const run = resolve(process.argv[2]);
const plan = JSON.parse(readFileSync(resolve("tools/demo-video", process.argv[3] ?? "edit-plan-easy.json"), "utf8"));
const W = 270, H = 480; // 분석 해상도 (1080×1920의 1/4)
const CSS = 405 / W; // 분석 px → CSS px

const tracks = {};
for (const acct of ["A", "B"]) {
  const { frames, end } = JSON.parse(readFileSync(join(run, acct, "frames.json"), "utf8"));
  const marks = JSON.parse(readFileSync(join(run, acct, "marks.json"), "utf8"));
  tracks[acct] = { frames: [...frames].sort((a, b) => a.t - b.t), end, marks };
}
const markT = (acct, name) => {
  const m = tracks[acct].marks.find((x) => x.name === name);
  if (!m) throw new Error(`표시 없음 ${acct} ${name}`);
  return m.t;
};

// 편집에 쓰이는 실제 시간 구간
const windows = { A: [], B: [] };
for (const c of plan.clips) {
  const from = markT(c.acct, c.from) + (c.offset ?? 0);
  const to = c.to ? markT(c.acct, c.to) + (c.toOffset ?? 0) : from + c.dur;
  windows[c.acct].push([from - 0.6, to + 0.2]);
}

const frameAt = (acct, t) => {
  const fs = tracks[acct].frames;
  let lo = 0, hi = fs.length - 1, best = fs[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fs[mid].t <= t) { best = fs[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
};
const cache = new Map();
async function pixels(acct, file) {
  const key = `${acct}/${file}`;
  if (!cache.has(key)) {
    const { data } = await sharp(join(run, acct, "frames", file)).resize(W, H).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    cache.set(key, data);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

/** a에서 밝아진 회백색 동그란 덩어리 (b 대비) → {x,y,score} 또는 null */
function findCircle(a, b) {
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) {
    const r = a[p], g = a[p + 1], bl = a[p + 2];
    const la = (r + g + bl) / 3;
    const lb = (b[p] + b[p + 1] + b[p + 2]) / 3;
    const grayish = Math.max(r, g, bl) - Math.min(r, g, bl) < 40;
    if (la - lb > 28 && la > 70 && grayish) mask[i] = 1;
  }
  const seen = new Uint8Array(W * H);
  let best = null;
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W, y = (i / W) | 0;
      n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j >= 0 && j < W * H && mask[j] && !seen[j] && Math.abs((j % W) - x) <= 1) { seen[j] = 1; stack.push(j); }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    // 원 지름: 44 CSS px × 0.6~1.0 = 26~44 CSS = 17~30 분석 px (여유를 둔다)
    if (w < 12 || h < 12 || w > 40 || h > 40) continue;
    const aspect = w / h;
    const fill = n / (w * h);
    if (aspect < 0.7 || aspect > 1.4 || fill < 0.35) continue;
    const score = fill * Math.min(w, h);
    if (!best || score > best.score) best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, score, w, h };
  }
  return best;
}

const out = [];
const checkDir = join(run, `taps-check-${(plan.tapsFile ?? "taps.json").replace(/\.json$/, "")}`);
mkdirSync(checkDir, { recursive: true });

/**
 * plan.taps가 있으면 **알려진 시간 창 안에서만** 찾는다 (2026-09-14: 전체 자동 검출은 14개 중
 * 2개 오검출·연속 탭 합쳐짐·5개 누락). 창은 녹화 때 보낸 명령 순서(장면 표시 + 대기 ms)로 적는다.
 *   { "acct": "B", "mark": "m04-set1", "within": [0.4, 1.0] }
 */
if (plan.taps?.length) {
  for (const tp of plan.taps) {
    const m0 = markT(tp.acct, tp.mark);
    // 좌표를 직접 준 탭 — 원이 노란 버튼 위라 회백색 판정에 안 걸리는 경우(사진 버튼)
    if (tp.x != null && tp.y != null) {
      out.push({ acct: tp.acct, mark: tp.mark, t: m0 + tp.at, x: tp.x, y: tp.y, score: "수동" });
      continue;
    }
    const [w0, w1] = tp.within;
    const cands = tracks[tp.acct].frames.filter((f) => f.t >= m0 + w0 && f.t <= m0 + w1 + 0.35);
    const pre = await pixels(tp.acct, frameAt(tp.acct, m0 + w0 - 0.08).file);
    let best = null;
    const hits = [];
    for (const f of cands) {
      const a = await pixels(tp.acct, f.file);
      const post = await pixels(tp.acct, frameAt(tp.acct, f.t + 0.95).file);
      const c = [findCircle(a, post), findCircle(a, pre)].filter(Boolean).sort((p, q) => q.score - p.score)[0];
      if (!c) continue;
      hits.push({ t: f.t, ...c });
      if (!best || c.score > best.score) best = { t: f.t, ...c };
    }
    if (!best) {
      console.log(`  ⚠️ 못 찾음: ${tp.acct} ${tp.mark} ${tp.within}`);
      continue;
    }
    // 탭 시각 = 같은 자리에서 원이 처음 보인 프레임
    const first = hits.filter((h) => Math.hypot(h.x - best.x, h.y - best.y) < 8).sort((p, q) => p.t - q.t)[0];
    out.push({
      acct: tp.acct, mark: tp.mark, t: first.t - 0.02,
      x: Math.round(best.x * CSS), y: Math.round(best.y * CSS), score: Number(best.score.toFixed(1)),
    });
  }
}

for (const acct of plan.taps?.length ? [] : ["A", "B"]) {
  const fs = tracks[acct].frames;
  for (const [w0, w1] of windows[acct]) {
    const inWin = fs.filter((f) => f.t >= w0 && f.t <= w1);
    const bursts = [];
    for (const f of inWin) {
      const last = bursts[bursts.length - 1];
      if (last && f.t - last.e < 0.12) { last.e = f.t; last.n++; } else bursts.push({ s: f.t, e: f.t, n: 1 });
    }
    for (const bu of bursts.filter((x) => x.n >= 12 && x.e - x.s >= 0.3)) {
      const t0 = bu.s;
      if (out.some((o) => o.acct === acct && Math.abs(o.t - t0) < 0.5)) continue;
      const a = await pixels(acct, frameAt(acct, t0 + 0.2).file);
      const post = await pixels(acct, frameAt(acct, t0 + 1.05).file);
      const pre = await pixels(acct, frameAt(acct, t0 - 0.05).file);
      const c1 = findCircle(a, post);
      const c2 = findCircle(a, pre);
      const c = [c1, c2].filter(Boolean).sort((p, q) => q.score - p.score)[0];
      if (!c) continue;
      out.push({ acct, t: t0, x: Math.round(c.x * CSS), y: Math.round(c.y * CSS), score: Number(c.score.toFixed(1)) });
    }
  }
}
out.sort((p, q) => p.acct.localeCompare(q.acct) || p.t - q.t);
// 계획마다 따로 쓴다 — 다른 계획의 탭 파일(보존 중인 완성본의 입력)을 덮지 않게
writeFileSync(join(run, plan.tapsFile ?? "taps.json"), JSON.stringify(out, null, 2));

// 확인용 이미지: 탭+0.2초 프레임에 빨간 십자
let k = 0;
for (const tp of out) {
  const f = frameAt(tp.acct, tp.t + 0.2);
  const x = tp.x * (1080 / 405), y = tp.y * (1920 / 720);
  const svg = Buffer.from(`<svg width="1080" height="1920"><circle cx="${x}" cy="${y}" r="70" fill="none" stroke="red" stroke-width="10"/><line x1="${x - 100}" y1="${y}" x2="${x + 100}" y2="${y}" stroke="red" stroke-width="6"/><line x1="${x}" y1="${y - 100}" x2="${x}" y2="${y + 100}" stroke="red" stroke-width="6"/></svg>`);
  // ⚠️ sharp는 resize를 composite보다 먼저 적용한다 → 합성 결과를 버퍼로 뽑은 뒤 줄인다
  const marked = await sharp(join(run, tp.acct, "frames", f.file)).composite([{ input: svg }]).png().toBuffer();
  await sharp(marked).resize(216, 384).toFile(join(checkDir, `${String(++k).padStart(2, "0")}-${tp.acct}.png`));
}
console.log(`탭 ${out.length}개 → ${join(run, plan.tapsFile ?? "taps.json")}`);
console.log(out.map((o, i) => `${String(i + 1).padStart(2)} ${o.acct} +${(o.t - tracks[o.acct].frames[0].t).toFixed(1)}s (${o.x},${o.y}) s=${o.score}`).join("\n"));
