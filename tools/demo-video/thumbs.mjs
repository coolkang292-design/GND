/**
 * 장면 확인용 밀착 인화 — 장면 표시 시각(+오프셋)에 보이던 프레임을 모아 한 장으로.
 *   node thumbs.mjs work/rec/<run> B "m01-home+1,m02-feed+2" out.png
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [runArg, acct, spec, outArg] = process.argv.slice(2);
const dir = join(resolve(runArg), acct);
const { frames } = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
const marks = JSON.parse(readFileSync(join(dir, "marks.json"), "utf8"));
const sorted = [...frames].sort((a, b) => a.t - b.t);

const picks = spec.split(",").map((s) => {
  const m = s.match(/^(.+?)([+-][\d.]+)?$/);
  const mark = marks.find((x) => x.name === m[1]);
  if (!mark) throw new Error(`표시 없음: ${m[1]}`);
  const t = mark.t + Number(m[2] ?? 0);
  let f = sorted[0];
  for (const x of sorted) if (x.t <= t) f = x;
  return join(dir, "frames", f.file);
});

const inputs = picks.flatMap((p) => ["-i", p]);
const scaled = picks.map((_, i) => `[${i}]scale=216:384[s${i}]`).join(";");
const cols = Math.min(6, picks.length);
const rows = [];
for (let r = 0; r * cols < picks.length; r++) {
  const idx = picks.map((_, i) => i).slice(r * cols, r * cols + cols);
  while (idx.length < cols) idx.push(null);
  rows.push(idx);
}
let graph = scaled;
const blank = picks.length % cols ? `;color=black:s=216x384:d=1[bk]` : "";
graph += blank;
let bkUsed = 0;
rows.forEach((row, r) => {
  const labels = row.map((i) => {
    if (i !== null) return `[s${i}]`;
    bkUsed++;
    return "[bk]";
  });
  graph += `;${labels.join("")}hstack=${cols}[r${r}]`;
});
graph += rows.length > 1 ? `;${rows.map((_, r) => `[r${r}]`).join("")}vstack=${rows.length}` : "";
if (bkUsed > 1) throw new Error("빈 칸이 2개 이상 — 개수를 6의 배수에 맞춰 주세요");
const out = resolve(outArg);
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", graph.replace(/\[r0\]$/, ""), "-frames:v", "1", out]);
console.log(out);
