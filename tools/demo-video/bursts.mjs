// 장면 표시별로 이후 화면 변화 구간(버스트)을 출력 — 편집 구간 잡기용
import { readFileSync } from "node:fs";
const [run, acct, ...names] = process.argv.slice(2);
const { frames } = JSON.parse(readFileSync(`${run}/${acct}/frames.json`, "utf8"));
const marks = JSON.parse(readFileSync(`${run}/${acct}/marks.json`, "utf8"));
const fs_ = [...frames].sort((a, b) => a.t - b.t);
for (const n of names) {
  const m = marks.find((x) => x.name === n);
  if (!m) { console.log(n, "없음"); continue; }
  const w = fs_.filter((f) => f.t >= m.t - 1 && f.t <= m.t + 25);
  const bursts = [];
  for (const f of w) {
    const last = bursts[bursts.length - 1];
    if (last && f.t - last.e < 0.35) { last.e = f.t; last.n++; } else bursts.push({ s: f.t, e: f.t, n: 1 });
  }
  console.log(n.padEnd(22), bursts.map((b) => `[${(b.s - m.t).toFixed(1)}~${(b.e - m.t).toFixed(1)} ${b.n}]`).join(" "));
}
