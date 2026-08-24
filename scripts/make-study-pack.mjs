#!/usr/bin/env node
/**
 * GPT 프로젝트에 올릴 학습 교재 묶음을 만든다.
 *
 * GPT 프로젝트는 이 저장소를 볼 수 없다. 커리큘럼이 "실제 파일을 열어 확인한다"고
 * 하는데 파일이 없으면 GPT는 **그럴듯한 경로를 지어낸다** — 배우는 사람에게는
 * 모르는 것보다 나쁘다. 그래서 앵커 파일을 통째로 묶어 올린다.
 *
 *   node scripts/make-study-pack.mjs
 *   → study-pack/ 에 9개 파일. ChatGPT 프로젝트에 그대로 업로드한다.
 *
 * ⚠️ 이 묶음은 커밋하지 않는다(생성물). 저장소가 바뀌면 다시 돌려서 다시 올린다.
 * ⚠️ .env 계열은 매니페스트에 넣어도 아래 가드가 막는다 — 키가 새면 되돌릴 수 없다.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "study-pack");

/** .env·키·인증서는 어떤 경로로도 못 들어온다. 매니페스트 실수를 여기서 막는다. */
const FORBIDDEN = /(^|[\\/])\.env|\.pem$|\.key$|credentials|secret/i;

function read(rel) {
  if (FORBIDDEN.test(rel)) {
    throw new Error(`거부: 비밀이 담길 수 있는 경로다 — ${rel}`);
  }
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`없는 파일: ${rel}`);
  return readFileSync(p, "utf8");
}

const FENCE = { ".ts": "ts", ".tsx": "tsx", ".sql": "sql", ".json": "json", ".mjs": "js" };

/** 파일 여러 개를 제목 붙여 한 문서로 묶는다. 경로를 반드시 남긴다 — 인용 근거가 된다. */
function bundle(title, intro, paths) {
  const parts = [`# ${title}\n`, `${intro}\n`];
  for (const rel of paths) {
    const lang = FENCE[extname(rel)] ?? "";
    const body = read(rel);
    const lines = body.split("\n").length;
    parts.push(`\n---\n\n## \`${rel}\` (${lines}줄)\n\n\`\`\`${lang}\n${body}\n\`\`\`\n`);
  }
  return parts.join("");
}

function write(name, content) {
  writeFileSync(join(OUT, name), content, "utf8");
  const kb = (Buffer.byteLength(content, "utf8") / 1024).toFixed(0);
  console.log(`  ${name.padEnd(28)} ${kb.padStart(5)} KB`);
}

// ── 03 구조 지도: 저장소를 재서 만든다 (손으로 적으면 곧 어긋난다) ────────────
function countFiles(dir, test, acc = { files: 0, lines: 0 }) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) countFiles(p, test, acc);
    else if (test(e.name)) {
      acc.files += 1;
      acc.lines += readFileSync(p, "utf8").split("\n").length;
    }
  }
  return acc;
}

function grepCount(rel, re) {
  return (read(rel).match(re) ?? []).length;
}

function structureMap() {
  const src = countFiles(join(ROOT, "src"), (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
  const tests = countFiles(join(ROOT, "src"), (n) => n.includes(".test."));
  const domain = readdirSync(join(ROOT, "src/lib/domain")).filter((n) => n.endsWith(".ts"));
  const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"));

  const tables = new Set();
  for (const m of migrations) {
    const sql = readFileSync(join(ROOT, "supabase/migrations", m), "utf8");
    for (const hit of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)) {
      tables.add(hit[1]);
    }
  }

  let clientComponents = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && readFileSync(p, "utf8").includes('"use client"')) {
        clientComponents += 1;
      }
    }
  };
  walk(join(ROOT, "src"));

  const snapshot = read("docs/db-current-schema.sql");
  const fns = (snapshot.match(/^CREATE OR REPLACE FUNCTION/gim) ?? []).length;

  return `# GND 구조 지도 (자동 생성)

> \`node scripts/make-study-pack.mjs\`가 저장소를 실제로 재서 만든 것이다.
> 손으로 고치지 마라 — 저장소가 바뀌면 다시 돌려라.

## 규모

| 항목 | 수 |
|---|---|
| 앱 코드 (\`src/**/*.ts,tsx\`) | ${src.files}개 파일 · ${src.lines.toLocaleString()}줄 |
| 그중 테스트 파일 | ${tests.files}개 |
| \`"use client"\` 붙은 파일 | ${clientComponents}개 |
| 판단 로직 모듈 (\`src/lib/domain/\`) | ${domain.filter((n) => !n.includes(".test.")).length}개 (+ 테스트 ${domain.filter((n) => n.includes(".test.")).length}개) |
| DB 테이블 | ${tables.size}개 |
| DB 함수 (스냅샷 기준) | ${fns}개 |
| DB 변경 이력 (마이그레이션) | ${migrations.length}개 |

## 폴더가 뜻하는 것

| 경로 | 무엇이 사는가 | 커리큘럼 회차 |
|---|---|---|
| \`src/app/\` | 화면과 주소. 폴더 이름 = URL | 2 |
| \`src/components/\` | 화면 조각(컴포넌트) | 2 |
| \`src/lib/domain/\` | **판단 규칙 (순수 함수)** + 1:1 테스트 | 3·4 |
| \`src/lib/supabase/\` | DB에 접속하는 통로 | 5·6 |
| \`src/app/api/\` | 서버에서 도는 코드 (2개뿐) | 5 |
| \`supabase/migrations/\` | **DB를 바꾼 역사.** 번호순 | 9 |
| \`docs/db-current-schema.sql\` | DB의 **현행** 정의 스냅샷 | 7·8 |
| \`scripts/\` | 검증·운영 스크립트 | 4 |

## 테이블 ${tables.size}개

${[...tables].sort().map((t) => `- \`${t}\``).join("\n")}

## 마이그레이션 ${migrations.length}개 (= 앱의 역사)

${migrations.map((m) => `- \`${m}\``).join("\n")}
`;
}

// ── 00 프로젝트 안내: 커리큘럼에서 회차·용어를 직접 읽어 만든다 ──────────────
// 회차와 용어를 여기 손으로 적으면 커리큘럼과 어긋난다. 원본에서 파싱한다.
function parseCurriculum() {
  const md = read("docs/GND-학습-커리큘럼.md");
  const sessions = [];
  const re = /^## (\d+)회차 — (.+)$/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    const rest = md.slice(m.index);
    const terms = rest.match(/^\*\*용어:\*\* (.+)$/m);
    sessions.push({
      no: Number(m[1]),
      title: m[2].replace(/\*\*/g, "").replace(/\s*\(.*\)\s*$/, "").trim(),
      terms: terms ? terms[1].replace(/\s*·\s*/g, " · ").trim() : "(실습 회차)",
    });
  }
  if (sessions.length < 10) throw new Error(`커리큘럼 파싱 실패: ${sessions.length}회차만 찾음`);
  return sessions;
}

function projectGuide(sessions) {
  const rows = sessions
    .map((s) => `| ${s.no} | ${s.title} | ${s.terms} | ☐ |`)
    .join("\n");

  return `# 프로젝트 안내 — 내가 무슨 목표로 질문하는지

> **이 파일을 먼저 읽어라.** 학습자가 누구이고, 무엇을 향해 묻고 있으며,
> 지금 어디까지 배웠는지가 여기 있다. 다른 첨부 파일은 교재이고, 이 파일은 **지도**다.

---

## 1. 나는 누구인가

- **비개발자다.** 코드를 직접 쓰지 않고, 앞으로도 쓸 계획이 없다.
- 하지만 **GND라는 앱의 주인**이다. 내가 기획하고 운영하며, 실제 사용자가 쓰고 있다.
- GND는 **AI에게 시켜서 만들었다.** 그래서 구조 중 상당 부분은 내가 고른 게 아니라
  **AI가 그때 제안한 것**이다. 어디까지가 필연이고 어디부터가 AI의 선택인지 나는 아직 모른다.
- 지금 가장 힘든 것: **작업 중 AI가 뱉는 용어 자체를 못 알아듣는다.**
  설명을 들어도 그 설명 안에 또 모르는 말이 나와서 막힌다.

## 2. 왜 묻는가 (최종 목표)

> **다음 홈페이지·앱을 만들기 전에, 기본 개념과 구조와 용어를 제대로 갖추는 것.**

세부 목표 네 가지:

| # | 목표 | 되면 무엇이 달라지나 |
|---|---|---|
| 1 | AI가 쓰는 **용어를 알아듣는다** | 대화 중간에 흐름을 놓치지 않는다 |
| 2 | AI가 **나 대신 정한 결정을 알아챈다** | 평서문에 숨은 선택을 되물을 수 있다 |
| 3 | "다 됐습니다"를 **검증할 줄 안다** | 폰에서 깨진 걸 뒤늦게 발견하지 않는다 |
| 4 | GND의 **법칙과 선택을 가른다** | 다음 앱에 우연한 선택을 베끼지 않는다 |

**코드를 쓰게 되는 것은 목표가 아니다.** 읽고, 판단하고, 지시하고, 검증하는 것이 목표다.

## 3. 그래서 답변은 이렇게 해 달라

- **전문용어는 그대로 써라.** 쉬운 말로 바꾸면 나중에 AI가 그 단어를 썼을 때 또 못 알아듣는다.
- **설명은 초등학생 수준으로.** 단어는 어렵게, 설명은 쉽게.
- **설명 안에 새 용어가 나오면 그 자리에서 풀어라.** 이게 제일 중요하다.
- **작동 원리를 순서대로.** "무엇인가"보다 "어떤 순서로 무슨 일이 벌어지나"가 궁금하다.
- **상세하게.** 짧게 요약하지 마라. 쉬운 말로 길게 써 달라.
- **법칙(🔒)인지 선택(🔀)인지 항상 표시해 달라.**

## 4. GND는 어떤 앱인가

운동 기록 앱이다. 혼자 쓰는 기능과 **여럿이 함께하는 기능이 섞여 있다** — 이게 구조를 복잡하게 만든 원인이다.

| 갈래 | 기능 |
|---|---|
| 혼자 | 운동 기록·세트·휴식 타이머·루틴·달력 |
| 성장 | 경험치·레벨·배지·포인트·스트릭(연속 운동일) |
| 함께 | 크루·챌린지·응원·찌르기·알림·푸시 |
| 운영 | 버그 신고·관리자 화면·릴리스 공지 |

**기술 구성:** Next.js(화면) + Supabase/PostgreSQL(데이터베이스) + Vercel(배포)

**구조의 핵심 한 줄:**
> 앱이 서버를 거치지 않고 **데이터베이스에 직접** 말한다. 그래서 **권한과 로직이 데이터베이스 안에** 들어 있다.
> (서버 API가 2개밖에 없는 이유다. 자세한 규모는 \`03-구조지도.md\`.)

## 5. 커리큘럼 — 지금 어디까지 왔나

내가 따라가는 11회차 계획이다. **☑ 표시된 회차의 용어는 자유롭게 써도 된다.
☐ 인 회차의 용어를 쓸 때는 반드시 그 자리에서 풀어 달라.**

| 회차 | 주제 | 용어 | 배움 |
|---|---|---|---|
${rows}

> 회차를 마칠 때마다 이 표의 ☐를 ☑로 바꾸고 파일을 다시 올린다.
> 전체 내용은 \`01-커리큘럼.md\`에 있다.

**졸업 기준:** 용어를 외웠는지가 아니라, **다음 앱의 구조를 한 장으로 그릴 수 있는지**다.

## 6. 첨부 파일

| 파일 | 내용 | 언제 |
|---|---|---|
| \`00-프로젝트-안내.md\` | **이 파일.** 목표·진도·구조 요약 | 항상 |
| \`01-커리큘럼.md\` | 11회차 전체 계획 | 진도 나갈 때 |
| \`02-작업지침-사고기록.md\` | 실제로 난 사고와 그래서 생긴 규칙 | "없으면 어떻게 되나"를 물을 때 |
| \`03-구조지도.md\` | 실측 규모·폴더·테이블·이력 | 전체 그림 |
| \`04-화면-코드.md\` | 화면을 그리는 코드 | 2회차 |
| \`05-로직-코드.md\` | 판단 규칙과 테스트 | 3·4회차 |
| \`06-통신-인증-코드.md\` | 요청·응답, 로그인·세션 | 5·6회차 |
| \`07-DB-스키마.md\` | 데이터베이스 현행 정의 전량 | 7·8회차 |
| \`08-마이그레이션-사례.md\` | 한 기능을 세 번 고친 기록 | 9회차 |

⚠️ **이 묶음은 전체 저장소가 아니라 발췌다.** 여기 없는 파일·함수·줄번호를 **추측해서 말하지 마라.**
없으면 "첨부에 없다"고 말해 달라. 그럴듯한 거짓이 모르는 것보다 훨씬 나쁘다.

⚠️ 코드 블록 위에 **원래 파일 경로**가 적혀 있다. 인용할 때 항상 그 경로를 함께 말해 달라 —
내가 실제 저장소에서 열어 보고 확인할 것이다.
`;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
console.log("study-pack/ 생성:\n");

const sessions = parseCurriculum();
console.log(`  (커리큘럼에서 ${sessions.length}회차 읽음)\n`);

write("00-프로젝트-안내.md", projectGuide(sessions));
write("01-커리큘럼.md", read("docs/GND-학습-커리큘럼.md"));
write("02-작업지침-사고기록.md", read("CLAUDE.md"));
write("03-구조지도.md", structureMap());

write(
  "04-화면-코드.md",
  bundle(
    "화면을 그리는 코드 (커리큘럼 2회차)",
    "홈 화면 하나가 어떻게 조각으로 나뉘는지 보여주는 최소 묶음이다.\n" +
      "`home/page.tsx`(서버, 3줄)가 `home-client.tsx`(클라이언트, 200줄)를 부르는 구조에 주목하라.",
    [
      "src/app/(tabs)/layout.tsx",
      "src/app/(tabs)/home/page.tsx",
      "src/components/home/home-client.tsx",
      "src/components/home/streak-card.tsx",
      "src/components/tab-bar.tsx",
    ],
  ),
);

write(
  "05-로직-코드.md",
  bundle(
    "판단 규칙과 그 테스트 (커리큘럼 3·4회차)",
    "`streak.ts`와 `streak.test.ts`를 **나란히** 읽어라.\n" +
      "테스트의 `it(\"...\")` 문장이 한국어로 규칙을 진술한다 — 비개발자에게 가장 읽기 쉬운 명세다.",
    [
      "src/lib/domain/streak.ts",
      "src/lib/domain/streak.test.ts",
      "src/lib/domain/time.ts",
      "src/lib/domain/viewing-pass.ts",
    ],
  ),
);

write(
  "06-통신-인증-코드.md",
  bundle(
    "요청·응답과 로그인 (커리큘럼 5·6회차)",
    "GND는 앱이 DB에 **직접** 말한다 — 그래서 서버 API가 2개뿐이다.\n" +
      "`proxy.ts`의 주석은 '전부 클라이언트 컴포넌트로 만든 선택'이 무엇을 부작용으로 낳았는지 보여준다(11회차 재료).",
    [
      "src/lib/supabase/client.ts",
      "src/lib/supabase/server.ts",
      "src/proxy.ts",
      "src/components/auth-provider.tsx",
      "src/app/api/briefing/route.ts",
      "src/app/api/push/notify/route.ts",
    ],
  ),
);

write(
  "07-DB-스키마.md",
  bundle(
    "데이터베이스 현행 정의 (커리큘럼 7·8회차)",
    "운영 DB에서 뽑은 스냅샷 전량이다. 함수·RLS 정책·인덱스가 순서대로 들어 있다.\n" +
      "`accept_challenge_invite` 하나에 SECURITY DEFINER·락·트랜잭션이 모두 들어 있으니 8회차의 주 교재로 쓴다.",
    ["docs/db-current-schema.sql"],
  ),
);

write(
  "08-마이그레이션-사례.md",
  bundle(
    "한 기능을 세 번 고친 기록 (커리큘럼 9회차)",
    "챌린지 시작 기능을 0045 → 0046 → 0047로 **세 번** 고쳤다.\n" +
      "이유는 `02-작업지침-사고기록.md`에 있다: 고칠 함수만 보고 **같은 전제를 공유하는 형제 함수**를 놓쳤다.\n" +
      "그 결과 '챌린지를 영영 시작할 수 없는 상태'가 운영에 배포됐다.",
    [
      "supabase/migrations/0045_start_challenge_participants.sql",
      "supabase/migrations/0046_challenge_rpcs_participants.sql",
      "supabase/migrations/0047_approvals_select_participants.sql",
    ],
  ),
);

console.log(`\n완료 → ${OUT}`);
console.log("ChatGPT 프로젝트에 9개 파일을 업로드하고, docs/GPT-프로젝트-지침.md의 지침을 붙여넣어라.");
