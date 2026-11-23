#!/usr/bin/env node
// 작업 복사본(git worktree)에서 개발 서버를 띄울 때만 .env.local을 빌려 오고, 끝나면 지운다.
//
//   node scripts/copy-env-to-worktree.mjs copy    # 메인 폴더의 .env.local → 이 작업 복사본으로 복사
//   node scripts/copy-env-to-worktree.mjs clean   # 이 작업 복사본의 .env.local(과 node_modules 연결)을 지운다
//
// 안전 규칙 — 이 스크립트가 다음을 하지 않는 것이 핵심이다.
//  - 열쇠 값을 화면에 찍지 않는다 (파일 크기만 말한다)
//  - 메인 폴더에서는 동작하지 않는다 (.worktrees 아래의 연결된 작업 복사본에서만)
//  - 지울 때는 이 작업 복사본의 .env.local 하나와 node_modules '연결'만 지운다
//    (node_modules 연결을 지워도 원본 폴더의 내용은 그대로다 — 연결만 끊는다)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, rmSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const cwdRoot = resolve(git("rev-parse", "--show-toplevel"));
const gitDir = resolve(git("rev-parse", "--git-dir"));
const commonDir = resolve(git("rev-parse", "--git-common-dir"));
const mainRoot = dirname(commonDir);

function fail(msg) {
  console.error(`중단: ${msg}`);
  process.exit(1);
}

// 연결된 작업 복사본에서만 동작한다 (메인 폴더면 git-dir == common-dir)
if (gitDir === commonDir) fail("메인 폴더에서는 쓰지 않는다. .worktrees 아래 작업 복사본 안에서 실행하라.");
if (!cwdRoot.startsWith(join(mainRoot, ".worktrees") + sep)) fail(`.worktrees 아래가 아니다: ${cwdRoot}`);

const source = join(mainRoot, ".env.local");
const target = join(cwdRoot, ".env.local");
const modules = join(cwdRoot, "node_modules");
const mode = process.argv[2] ?? "copy";

if (mode === "copy") {
  if (!existsSync(source)) fail(`원본이 없다: ${source}`);
  copyFileSync(source, target);
  console.log(`복사 완료: ${target} (${statSync(target).size} bytes) — 내용은 출력하지 않는다`);
  console.log("끝나면: node scripts/copy-env-to-worktree.mjs clean");
} else if (mode === "clean") {
  if (existsSync(target)) {
    rmSync(target, { force: true });
    console.log(`삭제 완료: ${target}`);
  } else {
    console.log("지울 .env.local이 없다 (이미 깨끗함)");
  }
  // node_modules가 '연결(junction/symlink)'일 때만 연결을 끊는다. 진짜 폴더면 건드리지 않는다.
  try {
    if (lstatSync(modules).isSymbolicLink()) {
      try { unlinkSync(modules); } catch { rmdirSync(modules); } // 비재귀: 원본 내용은 지워지지 않는다
      console.log("node_modules 연결 해제 (원본 폴더는 그대로)");
    }
  } catch { /* 없으면 넘어간다 */ }
  console.log(existsSync(target) ? "⚠️ 아직 남아 있다" : "확인: .env.local 없음");
} else {
  fail(`알 수 없는 명령: ${mode} (copy | clean)`);
}
