#!/usr/bin/env node
// 세션 시작 때 "지금의 사실"을 기계가 직접 확인해 보여준다. (SessionStart 훅, 2026-11-25)
//
// 왜: 새 세션이 옛 브랜치·옛 요약·옛 인수인계서를 최신으로 믿고 헷갈리는 일이 반복됐다.
//   - 2026-11-25 기본 폴더가 main보다 256커밋 뒤진 feat/posthog-funnel에 머물러 있었다
//   - 같은 날 "운영은 10/8 옛 코드"라는 틀린 결론이 세션 요약을 타고 다음 세션에 옮겨졌다
// 그래서 기억이 아니라 지금 상태를 매번 재서 맨 앞에 둔다.
//
// 읽기 전용이다. 하는 일: git fetch(원격 기록 받아오기) + git 조회 + 운영 /whats-new 한 번 받기.
// 어느 단계가 실패해도 훅을 막지 않고 "확인 못 함"으로 쓴다.
//
//   node scripts/session-truth.mjs
//   GND_PROD_URL=https://example.invalid node scripts/session-truth.mjs   # 운영 확인 실패 시험

import { spawnSync } from "node:child_process";
import path from "node:path";

const PROD_URL = process.env.GND_PROD_URL ?? "https://gnd-one.vercel.app";
const RELEASE_NOTES = "src/lib/domain/release-notes.data.json";
const MAIN = "origin/main";

function git(args, { timeout = 5000 } = {}) {
  const r = spawnSync("git", args, { encoding: "utf8", timeout, windowsHide: true });
  if (r.status !== 0 || r.error) return null;
  return r.stdout.trim();
}

const lines = [];
const warnings = [];
const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

// 1) 원격 기록 받아오기 — 이게 없으면 origin/main 자체가 낡은 값일 수 있다
const fetched = git(["fetch", "origin", "--prune", "--quiet"], { timeout: 10000 }) !== null;
if (!fetched) warnings.push("원격(깃허브) 기록을 받아오지 못했다. 아래 origin/main은 이 컴퓨터에 남은 마지막 값이라 낡았을 수 있다.");

// 2) 최신 코드 = origin/main
const mainHead = git(["log", "-1", "--format=%h|%cd|%s", "--date=format:%m-%d %H:%M", MAIN]);
if (mainHead) {
  const [sha, date, subject] = mainHead.split("|");
  lines.push(`- 최신 코드(${MAIN}): ${sha} · ${date} · ${subject}`);
} else {
  warnings.push(`${MAIN}을 찾지 못했다. 최신 코드가 무엇인지 확인하지 못했다.`);
}

// 3) 이 폴더
const top = git(["rev-parse", "--show-toplevel"]);
const branch = git(["branch", "--show-current"]) || "(브랜치 없음 — 특정 커밋에 고정)";
const dirty = (git(["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
const counts = mainHead ? git(["rev-list", "--left-right", "--count", `${MAIN}...HEAD`]) : null;
let relation = "origin/main과 비교 못 함";
if (counts) {
  const [behind, ahead] = counts.split(/\s+/).map(Number);
  if (behind === 0 && ahead === 0) relation = "origin/main과 같음 ✅";
  else {
    relation = `origin/main보다 ${behind}커밋 뒤, ${ahead}커밋 앞`;
    if (behind > 0) {
      warnings.push(
        `이 폴더는 최신 코드보다 ${behind}커밋 뒤처져 있다. 여기 파일·CLAUDE.md를 "현재"로 믿지 마라. ` +
          `최신은 \`git show ${MAIN}:<파일>\`로 읽고, 이 폴더에서 계속 일할지 사용자에게 먼저 알려라.`,
      );
    }
  }
}
lines.push(`- 이 폴더: ${top ? path.normalize(top) : "(git 폴더 아님)"} · 브랜치 ${branch} · ${relation} · 저장 안 된 변경 ${dirty}개`);

// 4) 기본 폴더(새 세션이 처음 여는 곳) — 작업 복사본 목록의 첫 줄이 기본 폴더다
const wt = git(["worktree", "list", "--porcelain"]);
if (wt) {
  const first = wt.split("\n\n")[0];
  const wtPath = first.match(/^worktree (.+)$/m)?.[1];
  const wtBranch = first.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "(고정 커밋)";
  const wtCount = wt.split("\n\n").filter((b) => b.startsWith("worktree ")).length;
  const isHere = top && wtPath && path.resolve(top) === path.resolve(wtPath);
  if (wtBranch !== "main") {
    warnings.push(
      `기본 폴더(${path.normalize(wtPath)})가 main이 아니라 ${wtBranch}에 있다. 다음 새 세션이 옛 코드를 최신으로 착각한다. 사용자에게 알려라.`,
    );
  }
  if (!isHere) lines.push(`- 기본 폴더: ${path.normalize(wtPath)} · 브랜치 ${wtBranch}${wtBranch === "main" ? " ✅" : " ⚠️"}`);
  lines.push(`- 작업 복사본(worktree) ${wtCount}개 — 목록: \`git worktree list\``);
}

// 5) 운영 앱 — 앱이 아직 자기 커밋을 말해주지 않으므로, main의 최신 업데이트 소식이 운영 /whats-new에 있는지로 본다
let notes = null;
try {
  const raw = git(["show", `${MAIN}:${RELEASE_NOTES}`]);
  notes = raw ? JSON.parse(raw) : null;
} catch {
  notes = null;
}
if (Array.isArray(notes) && notes.length > 0) {
  let html = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${PROD_URL}/whats-new`, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (res.ok) html = await res.text();
  } catch {
    html = null;
  }
  if (html === null) {
    warnings.push(`운영 앱(${PROD_URL})을 열지 못했다. 운영에 무엇이 도는지 확인하지 못했다 [미검증].`);
  } else {
    const recent = notes.slice(0, 5);
    const missing = recent.filter((n) => n?.title && !html.includes(n.title));
    if (missing.length === 0) {
      lines.push(`- 운영 앱(${PROD_URL}): main의 최신 업데이트 소식 「${recent[0].title}」까지 보인다 ✅`);
    } else {
      lines.push(`- 운영 앱(${PROD_URL}): main의 최근 소식 ${recent.length}개 중 ${missing.length}개가 운영에 없다 ⚠️`);
      warnings.push(
        `운영 앱이 main보다 뒤처졌을 수 있다(운영에 없는 소식: 「${missing[0].title}」 외 ${missing.length - 1}개). ` +
          `배포가 안 됐거나 /whats-new 캐시일 수 있다. 원인을 단정하지 말고 번들 문구로 확인하라.`,
      );
    }
    lines.push(`  (업데이트 소식이 없는 수정은 이 방법으로 안 보인다. 그건 운영 번들 문구로 따로 확인한다)`);
  }
}

const out = [
  `[지금의 사실 — ${now} 기계가 직접 확인 · scripts/session-truth.mjs]`,
  `세션 요약·기억(memory)·인수인계서는 "그때의 메모"다. 아래와 다르면 아래를 믿어라.`,
  ...lines,
];
if (warnings.length > 0) {
  out.push("", "⚠️ 주의:");
  for (const w of warnings) out.push(`- ${w}`);
}
// process.exit()를 쓰지 않는다: Windows에서 fetch 연결이 닫히는 중에 exit하면
// "Assertion failed: UV_HANDLE_CLOSING"으로 비정상 종료한다(2026-11-25 실측).
process.stdout.write(out.join("\n") + "\n");
process.exitCode = 0;
