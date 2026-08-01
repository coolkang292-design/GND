import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // git worktree(.gitignore 대상)에도 각자의 .next 빌드 산출물이 생긴다.
    // ".next/**"는 루트만 잡으므로 여기서 통째로 뺀다 — 안 그러면 다른 세션의
    // 워크트리 하나 때문에 `pnpm lint`가 1000건 넘는 오류를 뱉어 게이트를
    // 읽을 수 없게 된다 (2026-08-02에 실제로 그랬다).
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
