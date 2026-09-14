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

const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const runDir = resolve(process.argv[2] ?? "");
const PLAN_FILE = resolve(ROOT, argValue("--plan", "edit-plan.json"));
const plan = JSON.parse(readFileSync(PLAN_FILE, "utf8"));
/** 산출물 이름 — 계획 파일의 name, 없으면 60초판 이름 */
const NAME = plan.name ?? "gnd-influencer-demo-60s";
const OUT = ensureDir(join(ROOT, "..", "..", "artifacts"));
// ⚠️ 완성본 보호 (사용자 지시 2026-09-14 "편집 완료된 버전은 그대로 두고 새 파일로"):
//    같은 이름의 산출물이 있으면 멈춘다. 정말 다시 만들 때만 --overwrite.
if (existsSync(join(OUT, `${NAME}.mp4`)) && !process.argv.includes("--overwrite")) {
  console.error(`이미 있다: artifacts/${NAME}.mp4 — 보존 중인 완성본이면 계획의 name을 바꿔라 (덮어쓰려면 --overwrite)`);
  process.exit(1);
}
const TMP = ensureDir(join(runDir, "edit", NAME));

/**
 * layout "band": 앱 화면을 86%로 줄여 위에 두고, 맨 아래 띠에 자막을 쓴다 (사용자 지시 2026-09-14
 * "자막을 아래에, 글자 색을 다르게"). 화면 위에 자막을 얹으면 앱 UI(아래쪽 버튼 등)를 가린다.
 */
const BAND = plan.layout === "band";
const SCREEN = { w: 928, h: 1650, x: 76, y: 28 };
const BAND_TOP = SCREEN.y + SCREEN.h; // 1678
const ACCENT = "0xFFD34D";

/**
 * layout "card": 앱 화면(둥근 모서리·테두리)을 회색 배경 위에 두고, 아래 **흰 카드**에 검은 자막.
 * 사용자 지시 2026-09-14 — band 배치는 자막 띠와 앱 배경이 둘 다 검정이라 "자막인지 화면인지
 * 구분이 안 간다". 휴대폰 목업(노치·버튼)은 그리지 않는다 — 기획안의 "가짜 휴대폰 UI 금지".
 */
/**
 * layout "clean": 첫 접촉용 (2026-09-14 편집 지침 "앱 화면을 더 크게, 자막은 아래쪽에 작게,
 * 흰 설명판은 사용 설명 영상처럼 보인다"). 앱 화면 90% + 아래 좁은 영역에 작은 알약 자막.
 * card와 같은 틀(둥근 화면·테두리·회색 배경)을 쓰되 흰 카드는 없다.
 */
const CLEAN = plan.layout === "clean";
const CARD = plan.layout === "card" || CLEAN;
const CS = CLEAN
  ? { x: 54, y: 24, w: 972, h: 1728, r: 36 } // 앱 화면 (405:720 비율 유지)
  : { x: 100, y: 40, w: 880, h: 1564, r: 40 };
const CC = { x: 48, y: 1644, w: 984, h: 240, r: 36 }; // 자막 카드 (card 전용)
const CARD_BG = [46, 46, 54];
const GOLD = "0xE8B84A";

/** 배경·화면 구멍(투명)·테두리·(card면)흰 카드를 한 장의 RGBA PNG로 */
function cardFrame() {
  const file = join(TMP, "card-frame.png");
  if (existsSync(file)) return file;
  if (CLEAN) {
    const inS = (grow) => {
      const b = CS, x0 = b.x - grow, y0 = b.y - grow, x1 = b.x + b.w + grow, y1 = b.y + b.h + grow, r = b.r + grow;
      return `lte(pow(max(max(${x0 + r}-X,X-${x1 - r}),0),2)+pow(max(max(${y0 + r}-Y,Y-${y1 - r}),0),2),${r * r})*between(X,${x0},${x1})*between(Y,${y0},${y1})`;
    };
    const [br, bg, bb] = CARD_BG;
    const c = (border, back) => `if(${inS(0)},0,if(${inS(4)},${border},${back}))`;
    ff(["-f", "lavfi", "-i", "color=c=black:s=1080x1920", "-frames:v", "1", "-vf",
      `format=rgba,geq=r='${c(120, br)}':g='${c(120, bg)}':b='${c(132, bb)}':a='if(${inS(0)},0,255)'`, file]);
    return file;
  }
  const inside = (b, grow = 0) => {
    const x0 = b.x - grow, y0 = b.y - grow, x1 = b.x + b.w + grow, y1 = b.y + b.h + grow, r = b.r + grow;
    const dx = `max(max(${x0 + r}-X,X-${x1 - r}),0)`;
    const dy = `max(max(${y0 + r}-Y,Y-${y1 - r}),0)`;
    return `lte(pow(${dx},2)+pow(${dy},2),${r * r})*between(X,${x0},${x1})*between(Y,${y0},${y1})`;
  };
  const [br, bg, bb] = CARD_BG;
  // 사용자 지시 2026-09-14 "자막 칸을 명확히 — 테두리든 음영이든": 골드 테두리 + 아래 그림자
  const shadow = { ...CC, y: CC.y + 14 };
  const ch = (screen, border, cardEdge, card, shade, back) =>
    `if(${inside(CS)},${screen},if(${inside(CS, 5)},${border},` +
    `if(${inside(CC)},${card},if(${inside(CC, 5)},${cardEdge},if(${inside(shadow, 8)},${shade},${back})))))`;
  // 골드 #E8B84A, 그림자 #16161b
  ff(["-f", "lavfi", "-i", "color=c=black:s=1080x1920", "-frames:v", "1", "-vf",
    `format=rgba,geq=r='${ch(0, 120, 232, 255, 22, br)}':g='${ch(0, 120, 184, 255, 22, bg)}':b='${ch(0, 132, 74, 255, 27, bb)}':a='if(${inside(CS)},0,255)'`,
    file]);
  return file;
}

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

/** taps.mjs가 찾은 탭 (plan.finger일 때만 필요) */
const TAPS = plan.finger ? JSON.parse(readFileSync(join(runDir, plan.tapsFile ?? "taps.json"), "utf8")) : [];

/**
 * 손가락 아이콘 — `finger.mjs`가 미리 만든 PNG(윈도우 컬러 이모지 👆, 다운로드 없음)와 손끝 좌표.
 * 사용자 지시 2026-09-14 "클릭하는 걸 손가락으로 표시".
 */
let fingerCache = null;
function FINGER() {
  if (fingerCache) return fingerCache;
  const meta = join(ROOT, "work", "finger.json");
  if (!existsSync(meta)) throw new Error("손가락 이미지 없음 — node finger.mjs 먼저");
  fingerCache = JSON.parse(readFileSync(meta, "utf8"));
  return fingerCache;
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
  // hold: 클립 끝 화면을 N초 멈춰 보여 준다(결과 숫자 등 — 처음 보는 사람이 읽을 시간)
  const frameCount = list.frames + Math.round((clip.hold ?? 0) * FPS);
  const seconds = frameCount / FPS;

  // ⚠️ tpad: 마지막 프레임이 오래 멈춰 있으면 fps 필터가 스트림 끝을 채워 주지 않아
  //    클립이 짧아진다(챌린지 장면 5.6초 → 2.87초). 복제로 채우고 -frames:v로 자른다.
  //    hold도 이 복제로 만든다.
  const filters = [`fps=${FPS}`, "tpad=stop_mode=clone:stop=-1"];
  const esc = (p) => p.replace(/\\/g, "/").replace(":", "\\:");
  const out = join(TMP, `clip-${i}${withCaption ? "-c" : ""}.mp4`);
  if (CARD) {
    const texts = [];
    if (CLEAN && withCaption) {
      // 아래 영역(화면 끝 ~ 1920): 첫 몇 초 헤드라인(골드, 작게) + 알약 자막(흰 바탕·골드 테두리·그림자)
      const bottom = CS.y + CS.h; // 1752
      if (clip.headline) {
        const hf = join(TMP, `head-${i}.txt`);
        writeFileSync(hf, clip.headline);
        texts.push(`drawtext=fontfile='${FONT}':textfile='${esc(hf)}':expansion=none:fontsize=36:fontcolor=${ACCENT}:x=(w-tw)/2:y=${bottom + 12}`);
      }
      if (clip.caption) {
        const cf = join(TMP, `cap-${i}.txt`);
        writeFileSync(cf, clip.caption);
        const y = clip.headline ? bottom + 84 : bottom + 58;
        const base = `drawtext=fontfile='${FONT}':textfile='${esc(cf)}':expansion=none:fontsize=${clip.capSize ?? 44}:x=(w-tw)/2`;
        texts.push(
          `${base}:y=${y + 6}:fontcolor=black@0:box=1:boxcolor=black@0.45:boxborderw=26`, // 그림자
          `${base}:y=${y}:fontcolor=black@0:box=1:boxcolor=${GOLD}:boxborderw=26`, // 골드 테두리
          `${base}:y=${y}:fontcolor=0x111111:box=1:boxcolor=white:boxborderw=22`, // 흰 알약 + 글자
        );
      }
    }
    if (!CLEAN && withCaption && clip.caption) {
      const capFile = join(TMP, `cap-${i}.txt`);
      writeFileSync(capFile, clip.caption);
      const hasSub = Boolean(clip.sub);
      texts.push(
        `drawtext=fontfile='${FONT}':textfile='${esc(capFile)}':expansion=none:` +
          `fontsize=${clip.capSize ?? 54}:fontcolor=0x111111:x=(w-tw)/2:y=${hasSub ? CC.y + 46 : CC.y + 92}`,
      );
      if (hasSub) {
        const subFile = join(TMP, `sub-${i}.txt`);
        writeFileSync(subFile, clip.sub);
        texts.push(
          `drawtext=fontfile='${FONT_REG}':textfile='${esc(subFile)}':expansion=none:` +
            `fontsize=${clip.subSize ?? 38}:fontcolor=0x5a5a5a:x=(w-tw)/2:y=${CC.y + 134}`,
        );
      }
    }
    // ⚠️ 카드 이미지는 `-loop 1`로 넣는다 (2026-09-14 실측). 한 장짜리 입력 + eof_action=repeat로
    //    두니 클립 뒷부분(멈춤·tpad 복제 구간) 600프레임에서 카드가 안 겹쳐 검은 바탕에 어두운
    //    글씨만 남았다. 밝기 검사(카드 영역 YAVG)로 잡았다 — 밀착 인화 몇 칸만 어둡게 보였다.
    // 손가락: 이 클립의 실제 시간 조각 안에 든 탭 → 출력 시각 T로 옮긴다(skip·speed 반영)
    const fingers = [];
    for (const tp of plan.finger ? TAPS.filter((x) => x.acct === clip.acct) : []) {
      let acc = 0;
      for (const [a, b] of pieces) {
        if (tp.t >= a && tp.t <= b) {
          fingers.push({ T: acc + (tp.t - a) / speed, x: tp.x, y: tp.y });
          break;
        }
        acc += (b - a) / speed;
      }
    }
    const fingerChain = fingers.map((f, k) => {
      const f0 = FINGER();
      const X = Math.round(CS.x + f.x * (CS.w / 405) - f0.tipX);
      const Y = Math.round(CS.y + f.y * (CS.h / 720) - f0.tipY);
      const T = f.T.toFixed(3);
      // 0.45초 동안 오른쪽 아래에서 다가오고, 탭 순간 살짝 눌렀다(8px) 0.5초 뒤 사라진다
      const p = `clip((${T}-t)/0.45,0,1)`;
      return `[c${k}][f${k}]overlay=x='${X}+70*${p}':y='${Y}+110*${p}+8*between(t,${T},${T}+0.18)':` +
        `enable='between(t,${T}-0.5,${T}+0.5)':eval=frame:shortest=0[c${k + 1}]`;
    });
    const graph =
      `[0]${filters.join(",")},scale=${CS.w}:${CS.h}:flags=lanczos,pad=1080:1920:${CS.x}:${CS.y}:color=black[s];` +
      `[s][1]overlay=shortest=0[c0];` +
      (fingers.length ? `[2]split=${fingers.length}${fingers.map((_, k) => `[f${k}]`).join("")};${fingerChain.join(";")};` : "") +
      `[c${fingers.length}]${texts.length ? texts.join(",") + "," : ""}format=yuv420p[v]`;
    const fingerInput = fingers.length ? ["-loop", "1", "-framerate", String(FPS), "-i", FINGER().file] : [];
    ff(["-f", "concat", "-safe", "0", "-i", listFile, "-loop", "1", "-framerate", String(FPS), "-i", cardFrame(), ...fingerInput, "-filter_complex", graph,
      "-map", "[v]", "-an", "-frames:v", String(frameCount),
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), out]);
    return { out, seconds };
  }
  if (BAND) {
    filters.push(
      `scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos`,
      `pad=1080:1920:${SCREEN.x}:${SCREEN.y}:color=0x0d0d0f`,
    );
    if (withCaption && clip.caption) {
      const capFile = join(TMP, `cap-${i}.txt`);
      writeFileSync(capFile, clip.caption);
      const hasSub = Boolean(clip.sub);
      filters.push(
        `drawtext=fontfile='${FONT}':textfile='${esc(capFile)}':expansion=none:` +
          `fontsize=${clip.capSize ?? 58}:fontcolor=${ACCENT}:x=(w-tw)/2:y=${hasSub ? BAND_TOP + 30 : BAND_TOP + 80}`,
      );
      if (hasSub) {
        const subFile = join(TMP, `sub-${i}.txt`);
        writeFileSync(subFile, clip.sub);
        filters.push(
          `drawtext=fontfile='${FONT_REG}':textfile='${esc(subFile)}':expansion=none:` +
            `fontsize=40:fontcolor=white:x=(w-tw)/2:y=${BAND_TOP + 128}`,
        );
      }
    }
  } else {
    filters.push("scale=1080:1920:flags=lanczos");
    if (withCaption && clip.caption) {
      const capFile = join(TMP, `cap-${i}.txt`);
      writeFileSync(capFile, clip.caption);
      const y = clip.capPos === "bottom" ? "h-th-300" : "150";
      filters.push(
        `drawtext=fontfile='${FONT}':textfile='${esc(capFile)}':expansion=none:` +
          `fontsize=58:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=26:` +
          `x=(w-tw)/2:y=${y}`,
      );
    }
  }
  filters.push("format=yuv420p");
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
  writeFileSync(t2, plan.ending.sub ?? "");
  const esc = (p) => p.replace(/\\/g, "/").replace(":", "\\:");
  const out = join(TMP, "ending.mp4");
  // 문구 한 문장만 (사용자 지시 2026-09-15 "마지막 문구를 '팔로워와 첫 GND 챌린지를 함께 테스트해보세요'로")
  if (!plan.ending.sub && !plan.ending.cta) {
    // 줄마다 따로 가운데 정렬한다 — drawtext 여러 줄은 블록만 가운데고 줄은 왼쪽에 붙는다(2026-09-15 실측)
    const lines = plan.ending.text.split("\n");
    const size = plan.ending.size ?? 60;
    const gap = Math.round(size * 1.5);
    const top = 960 - 80 - Math.round((gap * (lines.length - 1) + size) / 2);
    const lineDraws = lines.map((line, k) => {
      const lf = join(TMP, `end-line-${k}.txt`);
      writeFileSync(lf, line);
      return `drawtext=fontfile='${FONT}':textfile='${esc(lf)}':expansion=none:fontsize=${size}:fontcolor=white:x=(w-tw)/2:y=${top + gap * k}`;
    });
    ff(["-loop", "1", "-t", String(plan.ending.dur), "-i", still, "-vf",
      [
        // 자막 카드 자리를 배경색으로 먼저 덮고 전체를 어둡게 — 아래 칸만 밝게 뜨지 않게
        ...(CARD ? [`drawbox=x=0:y=${CS.y + CS.h + 5}:w=iw:h=${1920 - CS.y - CS.h - 5}:color=0x${CARD_BG.map((v) => v.toString(16).padStart(2, "0")).join("")}:t=fill`] : []),
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.8:t=fill",
        ...lineDraws,
        `fps=${FPS}`, "format=yuv420p",
      ].join(","),
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), out]);
    return out;
  }
  if (CLEAN || plan.ending.cta) {
    // 첫 접촉용 마지막 화면: 문구 + GND Beta + CTA 한 줄 (편집 지침 2026-09-14). card 배치여도 cta가 있으면 이 모양
    const t3 = join(TMP, "end-3.txt");
    writeFileSync(t3, plan.ending.cta ?? "");
    const bgHex = `0x${CARD_BG.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    ff(["-loop", "1", "-t", String(plan.ending.dur), "-i", still, "-vf",
      [
        "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.8:t=fill",
        `drawbox=x=0:y=${CS.y + CS.h + 5}:w=iw:h=${1920 - CS.y - CS.h - 5}:color=${bgHex}:t=fill`,
        `drawtext=fontfile='${FONT}':textfile='${esc(t1)}':expansion=none:fontsize=62:line_spacing=22:fontcolor=white:x=(w-tw)/2:y=(h-th)/2-150`,
        `drawtext=fontfile='${FONT}':textfile='${esc(t2)}':expansion=none:fontsize=52:fontcolor=${ACCENT}:x=(w-tw)/2:y=h/2+60`,
        ...(plan.ending.cta ? [`drawtext=fontfile='${FONT_REG}':textfile='${esc(t3)}':expansion=none:fontsize=38:fontcolor=white@0.88:x=(w-tw)/2:y=h/2+150`] : []),
        `fps=${FPS}`, "format=yuv420p",
      ].join(","),
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", String(FPS), out]);
    return out;
  }
  ff(["-loop", "1", "-t", String(plan.ending.dur), "-i", still, "-vf",
    [
      "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.78:t=fill",
      // 띠 배치면 직전 장면 자막이 비치지 않게 띠를 완전히 덮는다
      ...(BAND ? [`drawbox=x=0:y=${BAND_TOP}:w=iw:h=${1920 - BAND_TOP}:color=0x0d0d0f:t=fill`] : []),
      // 카드 배치면 자막 카드 자리를 배경색으로 덮는다(직전 자막이 비치지 않게)
      ...(CARD ? [`drawbox=x=0:y=${CS.y + CS.h + 6}:w=iw:h=${1920 - CS.y - CS.h - 6}:color=0x${CARD_BG.map((v) => v.toString(16).padStart(2, "0")).join("")}:t=fill`] : []),
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
// plan.nocaption === false면 자막판 하나만 (사용자 지시 2026-09-14 "easy 파일만 쓸 거니 이것만")
for (const withCaption of plan.nocaption === false ? [true] : [true, false]) {
  const files = [];
  const sfxAt = []; // { t: 영상 시각(초), type, volume }
  let clipStart = 0;
  plan.clips.forEach((clip, i) => {
    const { out, seconds } = renderClip(i, clip, withCaption);
    files.push(out);
    for (const s of clip.sfx ?? []) sfxAt.push({ t: clipStart + s.at, type: s.type, volume: s.volume });
    clipStart += seconds;
    if (withCaption) report.push(`${String(i + 1).padStart(2)}. [${clip.acct}] ${clip.from} ${seconds.toFixed(1)}s ${clip.caption ?? ""}`);
  });
  if (withCaption && plan.ending) files.push(renderEnding(files[files.length - 1]));
  const name = withCaption ? `${NAME}.mp4` : `${NAME}-nocaption.mp4`;
  if (!plan.music) {
    const secs = joinClips(files, join(OUT, name));
    report.push(`→ ${name} ${secs.toFixed(1)}초`);
    continue;
  }
  // 배경음: 영상 길이로 자르고 앞 페이드인·끝 페이드아웃
  const silent = join(TMP, `silent-${name}`);
  const secs = joinClips(files, silent);
  const m = plan.music;
  const fo = m.fadeOut ?? 2.5;
  // 효과음 (sfx.mjs가 합성한 wav): 음악 위에 그 시각에만 얹는다. amix normalize=0 — 음악이 작아지지 않게
  const sfxInputs = sfxAt.flatMap((s) => ["-i", join(ROOT, "work", "sfx", `${s.type}.wav`)]);
  const sfxChains = sfxAt.map((s, k) => {
    const ms = Math.max(0, Math.round(s.t * 1000));
    return `[${k + 2}:a]adelay=${ms}|${ms},volume=${s.volume ?? 0.9}[s${k}]`;
  });
  const musicChain =
    `[1:a]atrim=start=${m.start ?? 0}:duration=${secs.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:d=${m.fadeIn ?? 0.6},afade=t=out:st=${(secs - fo).toFixed(3)}:d=${fo},volume=${m.volume ?? 0.8}`;
  const graph = sfxAt.length
    ? `${musicChain}[m];${sfxChains.join(";")};[m]${sfxAt.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfxAt.length + 1}:normalize=0:duration=first[a]`
    : `${musicChain}[a]`;
  ff(["-i", silent, "-i", resolve(ROOT, m.file), ...sfxInputs, "-filter_complex", graph,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-t", secs.toFixed(3), "-movflags", "+faststart", join(OUT, name)]);
  report.push(`→ ${name} ${duration(join(OUT, name)).toFixed(1)}초 (배경음 ${m.file}${sfxAt.length ? ` · 효과음 ${sfxAt.map((s) => `${s.type}@${s.t.toFixed(1)}s`).join(", ")}` : ""})`);
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

if (existsSync(PLAN_FILE)) copyFileSync(PLAN_FILE, join(TMP, "plan.used.json"));
console.log(report.join("\n"));
