/**
 * 화면 녹화 — Chrome DevTools Protocol `Page.startScreencast`.
 *
 * 왜 Playwright `recordVideo`가 아닌가: recordVideo는 뷰포트 CSS 픽셀 크기(405×720)로
 * 낮은 비트레이트 VP8을 뽑는다. screencast는 **기기 픽셀(1080×1920) JPEG**를 화면이
 * 바뀔 때마다 시각과 함께 준다 → 선명하고, 멈춘 구간은 시각 차로 정확히 늘어난다.
 *
 * 프레임은 `<dir>/frames/000001.jpg`, 시각은 `<dir>/frames.json`에 남는다.
 * 장면 표시는 `<dir>/marks.json` — 편집 스크립트가 이걸로 자른다.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir } from "./lib.mjs";

export async function startRecording(page, dir, { quality = 90 } = {}) {
  ensureDir(join(dir, "frames"));
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const marks = [];
  let n = 0;
  let pending = Promise.resolve();

  cdp.on("Page.screencastFrame", (ev) => {
    const idx = ++n;
    const file = `${String(idx).padStart(6, "0")}.jpg`;
    // 저장은 순서대로, ack는 즉시 — ack가 늦으면 다음 프레임이 안 온다
    cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
    const t = ev.metadata.timestamp; // 초 단위 epoch
    pending = pending.then(() => {
      writeFileSync(join(dir, "frames", file), Buffer.from(ev.data, "base64"));
      frames.push({ file, t });
    });
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth: 1080,
    maxHeight: 1920,
    everyNthFrame: 1,
  });

  const api = {
    /** 장면 경계. 편집에서 [mark, 다음 mark) 구간을 쓴다 */
    mark(name, extra = {}) {
      const m = { name, t: Date.now() / 1000, ...extra };
      marks.push(m);
      console.log(`  ▸ ${dir.split(/[\\/]/).pop()} · ${name}`);
      return m;
    },
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await pending;
      const end = Date.now() / 1000;
      writeFileSync(join(dir, "frames.json"), JSON.stringify({ frames, end }, null, 0));
      writeFileSync(join(dir, "marks.json"), JSON.stringify(marks, null, 2));
      await cdp.detach().catch(() => {});
      return { frames: frames.length, marks: marks.length };
    },
  };
  return api;
}

/**
 * 프레임 → **고정 fps로 다시 샘플링한** ffmpeg concat 목록.
 *
 * ⚠️ `concatList`(프레임 간격 그대로)를 인코딩에 쓰지 마라 (2026-09-14 실측).
 *    screencast 간격은 0.014~0.43초로 들쭉날쭉해서, 그 duration을 concat에 넘기면
 *    30fps 경계에서 반올림이 쌓여 클립 길이가 계획과 ±2.7초씩 어긋났다.
 *    여기서는 k/fps 시각마다 "그때 화면에 보이던 프레임"을 골라, 같은 프레임이
 *    이어지는 구간을 한 줄로 묶는다 → 모든 duration이 1/fps의 배수가 된다.
 *
 * @param pieces [[from, to], ...] epoch 초. 조각을 이어 붙인다(로딩 대기 건너뛰기).
 */
export function resampledList(framesDir, frames, pieces, fps = 30) {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const step = 1 / fps;
  const runs = [];
  let idx = 0;
  for (const [from, to] of pieces) {
    idx = 0;
    const n = Math.round((to - from) * fps);
    for (let k = 0; k < n; k++) {
      const t = from + k * step;
      while (idx + 1 < sorted.length && sorted[idx + 1].t <= t) idx++;
      const file = sorted[idx].file;
      const last = runs[runs.length - 1];
      if (last && last.file === file) last.n++;
      else runs.push({ file, n: 1 });
    }
  }
  // ⚠️ 같은 프레임이 이어져도 **한 줄로 묶지 않는다** (2026-09-14 실측).
  //    `duration 3.77` 한 줄로 두면 fps 필터가 맨 앞의 긴 정지 프레임을 버리고
  //    다음 프레임부터 시작했다(출력 start_time=3.8 — 챌린지 58% 카드가 통째로 빠짐).
  //    1/fps마다 한 줄씩 풀어 쓰면 복제 동작에 기대지 않는다.
  const lines = ["ffconcat version 1.0"];
  for (const r of runs) {
    const path = `file '${join(framesDir, r.file).replace(/\\/g, "/")}'`;
    for (let k = 0; k < r.n; k++) {
      lines.push(path);
      lines.push(`duration ${(1 / fps).toFixed(6)}`);
    }
  }
  if (runs.length) lines.push(`file '${join(framesDir, runs[runs.length - 1].file).replace(/\\/g, "/")}'`);
  const frameCount = runs.reduce((s, r) => s + r.n, 0);
  return { text: lines.join("\n") + "\n", frames: frameCount, seconds: frameCount / fps };
}

/**
 * 프레임 → ffmpeg concat 목록 (간격 그대로 — 분석용). 각 프레임은 다음 프레임 시각까지 유지된다.
 * [from, to] (epoch 초) 구간만 뽑을 수 있다. 구간 시작 시점에 보이던 프레임부터 쓴다.
 */
export function concatList(framesDir, frames, end, from = -Infinity, to = Infinity) {
  const lines = ["ffconcat version 1.0"];
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = i + 1 < sorted.length ? sorted[i + 1].t : end;
    const a = Math.max(cur.t, from);
    const b = Math.min(next, to);
    if (b <= a) continue;
    const dur = b - a;
    lines.push(`file '${join(framesDir, cur.file).replace(/\\/g, "/")}'`);
    lines.push(`duration ${dur.toFixed(4)}`);
    total += dur;
  }
  // concat demuxer는 마지막 duration을 무시하므로 마지막 파일을 한 번 더 적는다
  const last = lines.filter((l) => l.startsWith("file ")).pop();
  if (last) lines.push(last);
  return { text: lines.join("\n") + "\n", seconds: total };
}
