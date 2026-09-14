/**
 * 효과음 합성 — 외부 음원을 받지 않고 ffmpeg 수식(사인파 + 감쇠)으로 만든다. 저작권 문제 없음.
 *
 *   node sfx.mjs     → work/sfx/{chime,complete,rise}.wav
 *
 * 편집 지침(2026-09-14): "응원 도착, 운동 완료, 달성률 상승 순간에만 가벼운 효과음. 음악이 화면보다
 * 앞서면 안 된다." → 짧고(0.4~0.7초) 작게. 음량은 편집 계획의 sfx[].volume으로 한 번 더 줄인다.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, ensureDir } from "./lib.mjs";

const dir = ensureDir(join(ROOT, "work", "sfx"));
const tone = (hz, start, decay = 9, amp = 0.35) =>
  `gte(t,${start})*sin(2*PI*${hz}*(t-${start}))*exp(-${decay}*(t-${start}))*${amp}`;

const SOUNDS = {
  // 응원 도착: E6 → A6 두 음 (메신저 알림처럼 가볍게)
  chime: { d: 0.7, expr: `${tone(1318.5, 0)}+${tone(1760, 0.09)}` },
  // 운동 완료: C6 E6 G6 C7 올라가는 화음
  complete: { d: 0.9, expr: `${tone(1046.5, 0, 7, 0.28)}+${tone(1318.5, 0.07, 7, 0.28)}+${tone(1568, 0.14, 7, 0.28)}+${tone(2093, 0.21, 6, 0.24)}` },
  // 달성률 상승: 520→1560Hz로 0.35초 올라가는 부드러운 음 + 끝에 반짝
  rise: {
    d: 0.8,
    expr: `lt(t,0.4)*sin(2*PI*(520*t+1485.7*t*t))*(t/0.4)*0.22+${tone(1568, 0.36, 8, 0.26)}+${tone(2093, 0.42, 8, 0.2)}`,
  },
};

for (const [name, s] of Object.entries(SOUNDS)) {
  const file = join(dir, `${name}.wav`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
    `aevalsrc='${s.expr}|${s.expr}':s=44100:d=${s.d}`,
    "-af", "afade=t=out:st=" + (s.d - 0.12).toFixed(2) + ":d=0.12", file]);
  console.log(`${name} → ${file}`);
}
