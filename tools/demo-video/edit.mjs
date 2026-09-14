/**
 * 편집 — 녹화 프레임을 장면 표시(marks)대로 잘라 붙인다. **실제 화면만** 쓴다.
 *
 *   node edit.mjs work/rec/<run>            # edit-plan.json 기준
 *
 * 만드는 것 (artifacts/):
 *   gnd-influencer-demo-60s.mp4             자막 + 마지막 문구
 *   gnd-influencer-demo-60s-nocaption.mp4   자막 없음 (화면만)
 *   gnd-influencer-demo-raw-B.mp4 / -A.mp4  자르지 않은 원본 녹화
 *
 * 편집 원칙 (기획안 §6): 컷 편집만. 전환 효과·모션그래픽·가짜 UI 없음.
 * 로딩 대기는 `skip`으로 빼되, 앱이 보여 주는 화면 자체를 바꾸지는 않는다.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, ensureDir } from "./lib.mjs";
import { resampledList } from "./screencast.mjs";

const runDir = resolve(process.argv[2] ?? "");
const plan = JSON.parse(readFileSync(join(ROOT, "edit-plan.json"), "utf8"));
const OUT = ensureDir(join(ROOT, "..", "..", "artifacts"));
const TMP = ensureDir(join(runDir, "edit"));

const FONT = "C\\:/Windows/Fonts/NotoSansKR-Bold.ttf";
const FONT_REG = "C\\:/Windows/Fonts/NotoSansKR-Medium.ttf";
const FPS = 30;

const load = (acct) => {
  const dir = join(runDir, acct);
  const { frames, end } = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
  const marks = JSON.parse(readFileSync(join(dir, "marks.json"), "utf8"));
  return { dir, frames, end, marks };
};
const tracks = { A: load("A"), B: load("B") };

function ff(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}
function duration(file) {
  return Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
      .toString()
      .trim(),
  );
}

function markTime(track, name, acct) {
  const m = track.marks.find((x) => x.name === name);
  if (!m) throw new Error(`[${acct}] 장면 표시 없음: ${name}`);
  return m.t;
}

/** 한 구간 → 정규화된 mp4 (1080×1920, 30fps, H.264). skip 구간은 잘라 낸다 */
function renderClip(i, clip, withCaption) {
  const track = tracks[clip.acct];
  const from = markTime(track, clip.from, clip.acct) + (clip.offset ?? 0);
  const to = clip.to
    ? markTime(track, clip.to, clip.acct) + (clip.toOffset ?? 0)
    : from + clip.dur;
  // 로딩 대기 같은 구간을 빼고 이어 붙인다: skip = [[s,e], ...] (clip 시작 기준 초)
  const pieces = [];
  let cursor = from;
  for (const [s, e] of clip.skip ?? []) {
    pieces.push([cursor, from + s]);
    cursor = from + e;
  }
  pieces.push([cursor, to]);

  // 1/30초 격자로 다시 샘플링한다 — 간격 그대로 넘기면 길이가 어긋난다(screencast.mjs 주석)
  const speed = clip.speed ?? 1;
  // speed 0.5 = 두 배 느리게: 실제 시간을 1/(30/0.5)초 간격으로 뽑아 1/30초씩 보여 준다
  const list = resampledList(join(track.dir, "frames"), track.frames, pieces, FPS / speed);
  const listFile = join(TMP, `clip-${i}.txt`);
  writeFileSync(listFile, list.text.replace(/^duration ([\d.]+)$/gm, (_, d) => `duration ${(Number(d) / speed).toFixed(6)}`));
  const frameCount = list.frames;
  const seconds = frameCount / FPS;

  // ⚠️ tpad: 마지막 프레임이 오래 멈춰 있으면 fps 필터가 스트림 끝을 채워 주지 않아
  //    클립이 짧아진다(챌린지 장면 5.6초 → 2.87초). 복제로 채우고 -frames:v로 자른다.
  const filters = [`fps=${FPS}`, "tpad=stop_mode=clone:stop=-1", "scale=1080:1920:flags=lanczos", "format=yuv420p"];
  if (withCaption && clip.caption) {
    const capFile = join(TMP, `cap-${i}.txt`);
    writeFileSync(capFile, clip.caption);
    const y = clip.capPos === "bottom" ? "h-th-300" : "150";
    filters.splice(
      2,
      0,
      `drawtext=fontfile='${FONT}':textfile='${capFile.replace(/\\/g, "/").replace(":", "\\:")}':` +
        `fontsize=58:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=26:` +
        `x=(w-tw)/2:y=${y}`,
    );
  }
  const out = join(TMP, `clip-${i}${withCaption ? "-c" : ""}.mp4`);
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", filters.join(","), "-an",
    "-frames:v", String(frameCount),
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), out]);
  return { out, seconds };
}

/** 마지막 문구 — 마지막 컷의 끝 프레임을 어둡게 깔고 글자만 올린다(그래픽 없음) */
function renderEnding(lastClip) {
  const still = join(TMP, "ending-still.png");
  const d = duration(lastClip);
  ff(["-sseof", "-0.05", "-i", lastClip, "-frames:v", "1", still]);
  const t1 = join(TMP, "end-1.txt");
  const t2 = join(TMP, "end-2.txt");
  writeFileSync(t1, plan.ending.text);
  writeFileSync(t2, plan.ending.sub);
  const esc = (p) => p.replace(/\\/g, "/").replace(":", "\\:");
  const out = join(TMP, "ending.mp4");
  ff(["-loop", "1", "-t", String(plan.ending.dur), "-i", still, "-vf",
    [
      "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.78:t=fill",
      `drawtext=fontfile='${FONT}':textfile='${esc(t1)}':fontsize=62:line_spacing=22:fontcolor=white:x=(w-tw)/2:y=(h-th)/2-60`,
      `drawtext=fontfile='${FONT_REG}':textfile='${esc(t2)}':fontsize=40:fontcolor=white@0.7:x=(w-tw)/2:y=h/2+170`,
      `fps=${FPS}`, "format=yuv420p",
    ].join(","),
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), out]);
  void d;
  return out;
}

function joinClips(files, out) {
  const list = join(TMP, `join-${Date.now()}.txt`);
  writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n") + "\n");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
  return duration(out);
}

// ── 본편 ────────────────────────────────────────────────────────────
const report = [];
for (const withCaption of [true, false]) {
  const files = [];
  plan.clips.forEach((clip, i) => {
    const { out, seconds } = renderClip(i, clip, withCaption);
    files.push(out);
    if (withCaption) report.push(`${String(i + 1).padStart(2)}. [${clip.acct}] ${clip.from} ${seconds.toFixed(1)}s ${clip.caption ?? ""}`);
  });
  if (withCaption && plan.ending) files.push(renderEnding(files[files.length - 1]));
  const name = withCaption ? "gnd-influencer-demo-60s.mp4" : "gnd-influencer-demo-60s-nocaption.mp4";
  const secs = joinClips(files, join(OUT, name));
  report.push(`→ ${name} ${secs.toFixed(1)}초`);
}

// ── 원본 (자르지 않은 녹화) ───────────────────────────────────────────
// 26분짜리 1080×1920이라 오래 걸린다. 편집만 다시 할 때는 --no-raw.
for (const acct of process.argv.includes("--no-raw") ? [] : ["B", "A"]) {
  const t = tracks[acct];
  const first = Math.min(...t.frames.map((f) => f.t));
  const list = resampledList(join(t.dir, "frames"), t.frames, [[first, t.end]], FPS);
  const listFile = join(TMP, `raw-${acct}.txt`);
  writeFileSync(listFile, list.text);
  const out = join(OUT, `gnd-influencer-demo-raw-${acct}.mp4`);
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", `fps=${FPS},format=yuv420p`,
    "-frames:v", String(list.frames),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", out]);
  report.push(`→ gnd-influencer-demo-raw-${acct}.mp4 ${duration(out).toFixed(1)}초`);
}

const planCopy = join(runDir, "edit-plan.used.json");
if (existsSync(join(ROOT, "edit-plan.json"))) copyFileSync(join(ROOT, "edit-plan.json"), planCopy);
console.log(report.join("\n"));
