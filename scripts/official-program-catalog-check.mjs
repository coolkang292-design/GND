// 공식 프로그램 종목명이 운영 exercise_catalog 시드에 모두 있는지 읽기 전용으로 확인한다.
// 실행: pnpm programs:check-catalog
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredNames = [
  "바벨 백스쿼트",
  "벤치프레스",
  "시티드 로우",
  "숄더프레스",
  "사이드 레터럴 레이즈",
  "루마니안 데드리프트",
  "랫풀다운",
  "인클라인 벤치프레스",
  "페이스풀",
  "덤벨 컬",
  "레그프레스",
  "덤벨 벤치프레스",
  "바벨 로우",
  "덤벨 레터럴 레이즈",
  "케이블 푸시다운",
  "덤벨 플라이",
  "체스트프레스 머신",
  "푸시업",
  "덤벨 해머 컬",
  "벤치 딥스",
  "맨몸 스쿼트",
  "덤벨 로우",
  "레그 익스텐션",
  "레그 컬",
  "런지",
  "힙 브릿지",
  "크런치",
];

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const worktreeMarker = `${sep}.worktrees${sep}`;
const worktreeMarkerIndex = repoRoot.indexOf(worktreeMarker);
const mainRepoRoot =
  worktreeMarkerIndex === -1
    ? undefined
    : repoRoot.slice(0, worktreeMarkerIndex);

export function loadEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(repoRoot, ".env.local"),
    mainRepoRoot && resolve(mainRepoRoot, ".env.local"),
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
  const envPath = candidates.find((candidate) => existsSync(candidate));

  if (!envPath) {
    throw new Error(".env.local을 찾을 수 없습니다");
  }

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
}

export async function fetchCatalogNames({ url, key, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `${url}/rest/v1/exercise_catalog?select=name&is_custom=eq.false`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`exercise_catalog 조회 실패 (${response.status})`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("exercise_catalog 응답 형식이 올바르지 않습니다");
  }

  return rows.map((row) => row.name).filter((name) => typeof name === "string");
}

export function findMissingNames(catalogNames) {
  const availableNames = new Set(catalogNames);
  return requiredNames.filter((name) => !availableNames.has(name));
}

export async function run() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(".env.local에 Supabase 설정이 없습니다");
  }

  const catalogNames = await fetchCatalogNames({ url, key });
  const missing = findMissingNames(catalogNames);

  if (missing.length > 0) {
    for (const name of missing) {
      console.log(`MISSING ${name}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`PASS ${requiredNames.length}/${requiredNames.length} official-program exercise names`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
