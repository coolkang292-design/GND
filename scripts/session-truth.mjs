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

// 5) 운영 앱 — 먼저 앱이 직접 말하는 커밋(/api/version)을 origin/main과 대조한다.
//    엔드포인트가 아직 없는 옛 배포본이면 업데이트 소식 대조(근사치)로 내려간다.
async function getText(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", cache: "no-store" });
    clearTimeout(t);
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

const SHA40 = /^[0-9a-f]{40}$/;
let prodChecked = false;
const ver = await getText(`${PROD_URL}/api/version`);
if (ver === null) {
  warnings.push(`운영 앱(${PROD_URL})을 열지 못했다. 운영에 무엇이 도는지 확인하지 못했다 [미검증].`);
  prodChecked = true;
} else if (ver.ok) {
  let info = null;
  try {
    info = JSON.parse(ver.body);
  } catch {
    info = null;
  }
  const sha = typeof info?.commit === "string" && SHA40.test(info.commit) ? info.commit : null;
  if (sha) {
    prodChecked = true;
    const short = sha.slice(0, 7);
    const built = info.builtAt
      ? ` · 빌드 ${new Date(info.builtAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}`
      : "";
    const known = git(["cat-file", "-e", `${sha}^{commit}`]) !== null;
    const mainSha = git(["rev-parse", MAIN]);
    if (sha === mainSha) {
      lines.push(`- 운영 앱(${PROD_URL}): 커밋 ${short} = origin/main과 같음 ✅${built}`);
    } else if (!known) {
      lines.push(`- 운영 앱(${PROD_URL}): 커밋 ${short} — 이 컴퓨터의 git 기록에 없는 커밋 ⚠️${built}`);
      warnings.push(`운영 앱이 이 컴퓨터가 모르는 커밋(${short})으로 돌고 있다. 푸시 안 된 곳에서 배포했을 수 있다. 사용자에게 알려라.`);
    } else if (git(["merge-base", "--is-ancestor", sha, MAIN]) !== null) {
      const behind = git(["rev-list", "--count", `${sha}..${MAIN}`]);
      lines.push(`- 운영 앱(${PROD_URL}): 커밋 ${short} — origin/main보다 ${behind}커밋 뒤 (아직 배포 안 된 커밋이 있다)${built}`);
    } else {
      lines.push(`- 운영 앱(${PROD_URL}): 커밋 ${short} — origin/main에 들어 있지 않은 커밋 ⚠️${built}`);
      warnings.push(
        `운영 앱이 main에 없는 커밋(${short})으로 돌고 있다. 작업 브랜치에서 배포됐을 수 있다. ` +
          `"git branch -a --contains ${short}"로 출처를 확인하고 사용자에게 알려라.`,
      );
    }
  } else {
    lines.push(`- 운영 앱(${PROD_URL}): /api/version이 커밋을 모른다(${info?.commit ?? "응답 이상"}) — 업데이트 소식으로 대신 본다`);
  }
}

if (!prodChecked) {
  let notes = null;
  try {
    const raw = git(["show", `${MAIN}:${RELEASE_NOTES}`]);
    notes = raw ? JSON.parse(raw) : null;
  } catch {
    notes = null;
  }
  const page = Array.isArray(notes) && notes.length > 0 ? await getText(`${PROD_URL}/whats-new`) : null;
  if (!page?.ok) {
    warnings.push(`운영 앱(${PROD_URL})의 업데이트 소식을 읽지 못했다. 운영에 무엇이 도는지 확인하지 못했다 [미검증].`);
  } else {
    const html = page.body;
    const recent = notes.slice(0, 5);
    const missing = recent.filter((n) => n?.title && !html.includes(n.title));
    if (missing.length === 0) {
      lines.push(`- 운영 앱(${PROD_URL}): main의 최신 업데이트 소식 「${recent[0].title}」까지 보인다 ✅ (근사치)`);
    } else {
      lines.push(`- 운영 앱(${PROD_URL}): main의 최근 소식 ${recent.length}개 중 ${missing.length}개가 운영에 없다 ⚠️ (근사치)`);
      warnings.push(
        `운영 앱이 main보다 뒤처졌을 수 있다(운영에 없는 소식: 「${missing[0].title}」 외 ${missing.length - 1}개). ` +
          `배포가 안 됐거나 /whats-new 캐시일 수 있다. 원인을 단정하지 말고 번들 문구로 확인하라.`,
      );
    }
    lines.push(`  (운영이 아직 /api/version을 모르는 옛 배포본이라 소식으로 대신 봤다. 소식 없는 수정은 안 보인다)`);
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
