/**
 * 기능별 소스 클립 — features-plan.json의 기능마다 두 판을 만든다 (2026-10-02).
 *
 *   node features.mjs                 # 전부
 *   node features.mjs 05-evolution    # 하나만
 *   node features.mjs --overwrite     # 이미 있는 산출물도 다시
 *   node features.mjs --retap         # 손가락 위치를 다시 찾는다 (기본은 기존 taps-<key>.json 유지 —
 *                                     # 눈으로 확인하고 잘못된 탭을 지운 파일을 덮어쓰지 않게)
 *
 * 만드는 것 (artifacts/):
 *   gnd-src-<key>.mp4       카드 자막판 — 둥근 앱 화면 + 아래 흰 카드 자막 + 손가락
 *   gnd-src-<key>-raw.mp4   자막 없는 전체 화면판 — 릴스·쇼츠 편집에서 자막·음악을 직접 얹는 소스
 *
 * 계획 파일은 work/plans/에 풀어 쓰고 edit.mjs에 넘긴다. 손가락 위치는 taps.mjs가 찾는다
 * (결과는 녹화 폴더의 taps-check-*에서 눈으로 확인할 것).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, ensureDir } from "./lib.mjs";

const def = JSON.parse(readFileSync(join(ROOT, "features-plan.json"), "utf8"));
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const overwrite = process.argv.includes("--overwrite") ? ["--overwrite"] : [];
const plans = ensureDir(join(ROOT, "work", "plans"));
const repo = resolve(ROOT, "..", "..");

for (const f of def.features) {
  if (only.length && !only.includes(f.key)) continue;
  // 기능마다 다른 녹화를 쓸 수 있다 (09는 따로 찍었다)
  const run = resolve(ROOT, f.run ?? def.run);
  const name = `gnd-src-${f.key}`;
  const card = { name, layout: "card", nocaption: false, finger: true, tapsFile: `taps-${f.key}.json`, clips: f.clips };
  const raw = {
    name: `${name}-raw`,
    nocaption: false,
    clips: f.clips.map(({ caption, sub, ...rest }) => rest),
  };
  const cardFile = join(plans, `${name}.json`);
  const rawFile = join(plans, `${name}-raw.json`);
  writeFileSync(cardFile, JSON.stringify(card, null, 2));
  writeFileSync(rawFile, JSON.stringify(raw, null, 2));

  console.log(`\n=== ${f.key} ===`);
  // taps.mjs는 저장소 루트에서, 계획 경로는 tools/demo-video 기준으로 받는다
  if (process.argv.includes("--retap") || !existsSync(join(run, card.tapsFile))) execFileSync("node", ["tools/demo-video/taps.mjs", run, `work/plans/${name}.json`], { cwd: repo, stdio: "inherit" });
  for (const p of [cardFile, rawFile]) {
    execFileSync("node", ["edit.mjs", run, "--no-raw", "--plan", p, ...overwrite], { cwd: ROOT, stdio: "inherit" });
  }
}
