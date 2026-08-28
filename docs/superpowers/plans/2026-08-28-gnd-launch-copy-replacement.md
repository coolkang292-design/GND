# GND Launch Copy Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GND 시작 이미지의 장면은 유지하고 하단 문구만 “의지가 꺾인 날에도 / 계속한 사람이, 결국 이긴다”로 교체한다.

**Architecture:** 기존 `v4` 이미지를 ImageGen의 text-localization 편집 대상으로 사용하고, 승인된 결과만 새 `v5` 자산으로 저장한다. 앱은 기존 세션 게이트와 타이머를 유지하며 이미지 경로, 숨김 접근성 설명, 이미지 실패 대체 문구만 함께 교체한다.

**Tech Stack:** ImageGen built-in edit, Next.js 16 App Router, React 19, TypeScript strict, Next Image, Vitest 4, Testing Library

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `public/splash/gnd-launch-motivation-v5.png` | 승인된 새 카피가 포함된 최종 9:16 시작 이미지 |
| `src/components/launch-motivation-splash.tsx` | `v5` 로드, 숨김 설명, 이미지 실패 대체 문구 |
| `src/components/launch-motivation-splash.test.tsx` | 새 경로와 새 문구, 이전 문구 부재 회귀 테스트 |
| `docs/superpowers/specs/2026-08-28-gnd-launch-copy-replacement-design.md` | 승인된 A안 설계 |
| `PROGRESS.md` | 실제 검증·커밋·배포 상태 요약 |
| `docs/superpowers/HANDOFF-2026-08-17-gnd-launch-splash.md` | 시작 화면 현행 사실과 다음 할 일 |

DB, Supabase, 인증, 서비스 워커, 세션 게이트 파일은 수정하지 않는다.

### Task 1: 격리 작업 공간을 준비한다

**Files:**
- Read: `CLAUDE.md`
- Read: `PROGRESS.md`
- Read: `docs/superpowers/HANDOFF-2026-08-17-gnd-launch-splash.md`

- [ ] **Step 1: 현재 저장소와 사용자 변경을 확인한다**

Run in PowerShell from `C:\Users\SAMSUNG\workout-app`:

```powershell
git rev-parse --show-toplevel
git status --short
git log -1 --oneline
```

Expected: 저장소 루트는 `C:/Users/SAMSUNG/workout-app`. `analytics.ts`, 관리자 스냅샷,
아바타 목업 등 기존 사용자 변경은 이번 커밋에 포함하지 않는다.

- [ ] **Step 2: using-git-worktrees 절차로 별도 브랜치를 만든다**

Branch: `codex/gnd-launch-copy-v5`

Expected: 새 worktree의 `git status --short`가 깨끗하고, 시작점에 설계·계획 문서
커밋이 포함된다.

### Task 2: 이미지 문구 교체 시안을 만들고 승인받는다

**Files:**
- Edit target: `public/splash/gnd-launch-motivation-v4.png`
- Preview output: `$CODEX_HOME/generated_images/.../*.png`
- Create after approval: `public/splash/gnd-launch-motivation-v5.png`

- [ ] **Step 1: 기존 원본을 이미지 편집 입력으로 확인한다**

Use the built-in image viewing tool on:

```text
public/splash/gnd-launch-motivation-v4.png
```

Expected: `941×1672` 세로 이미지, 상단 골드 GND, 남녀 배틀로프, 하단 기존 두 줄 문구.

- [ ] **Step 2: ImageGen으로 하단 문구만 편집한다**

Use the built-in ImageGen edit mode with this prompt:

```text
Use case: text-localization
Asset type: GND mobile app launch splash, portrait 9:16
Input image: edit target; preserve every visual element outside the existing lower text area
Primary request: Replace only the existing two-line Korean copy at the bottom.
Text (verbatim), line 1: "의지가 꺾인 날에도"
Text (verbatim), line 2: "계속한 사람이, 결국 이긴다"
Typography: preserve the existing bold condensed forward-leaning sports-poster style; line 1 white, line 2 gold
Constraints: keep GND logo, both athletes, faces, bodies, battle ropes, rain droplets, steam, wet floor, lighting, crop, color, and resolution unchanged; erase all old Korean copy; no extra text; no watermark
Avoid: spelling errors, duplicated glyphs, missing comma, altered anatomy, changed pose, changed logo, changed composition
```

Expected: 장면은 유지되고 하단에 지정된 두 줄만 정확히 보인다.

- [ ] **Step 3: 시안을 검수한다**

Check all of the following before showing it:

```text
의지가 꺾인 날에도
계속한 사람이, 결국 이긴다
```

Expected: `꺾인`, `계속한`, `사람이,`, `결국`, `이긴다`가 정확하고 이전
`매일 1도의 방향이` / `1년뒤 도착지를 뒤바꾼다`가 없다. 장면·GND·인물 구성이
입력 이미지와 같다.

- [ ] **Step 4: 사용자에게 시안을 보여주고 승인을 기다린다**

Expected: 승인 전에는 프로젝트 자산·컴포넌트·테스트를 수정하지 않는다. 수정 요청이
있으면 한 번에 한 가지 차이만 ImageGen에 지시해 다시 검수한다.

- [ ] **Step 5: 승인 이미지를 새 버전 자산으로 복사한다**

Copy the approved generated output to:

```text
public/splash/gnd-launch-motivation-v5.png
```

Run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'public\splash\gnd-launch-motivation-v5.png'
```

Expected: 생성 원본과 앱 자산의 SHA256가 동일하다. `v4`는 즉시 삭제하지 않아 Git
기록과 롤백 근거를 유지한다.

### Task 3: 새 이미지와 문구를 TDD로 연결한다

**Files:**
- Modify: `src/components/launch-motivation-splash.test.tsx:49-145`
- Modify: `src/components/launch-motivation-splash.tsx:115-164`

- [ ] **Step 1: 새 요구사항을 단언하는 실패 테스트를 작성한다**

Update the first component test to include:

```tsx
expect(image.getAttribute("src")).toBe(
  "/splash/gnd-launch-motivation-v5.png",
);

expect(description.textContent).toBe(
  "의지가 꺾인 날에도 계속한 사람이, 결국 이긴다",
);

expect(description.textContent).not.toContain("매일 1도의 방향이");
expect(description.textContent).not.toContain("1년뒤 도착지를 뒤바꾼다");
```

Update the fallback test to include:

```tsx
expect(screen.getByText("의지가 꺾인 날에도")).toBeTruthy();
expect(screen.getByText("계속한 사람이, 결국 이긴다")).toBeTruthy();
expect(screen.queryByText("매일 1도의 방향이,")).toBeNull();
```

- [ ] **Step 2: 테스트가 올바르게 실패하는지 확인한다**

Run:

```powershell
pnpm exec vitest run src/components/launch-motivation-splash.test.tsx
```

Expected: `v4` 경로 또는 이전 문구를 받았다는 이유로 실패한다.

- [ ] **Step 3: 컴포넌트를 최소 변경한다**

Change the image path:

```tsx
src="/splash/gnd-launch-motivation-v5.png"
```

Change the hidden description:

```tsx
의지가 꺾인 날에도 계속한 사람이, 결국 이긴다
```

Change only the fallback lines:

```tsx
<span className="block text-[clamp(1.8rem,7.5vw,2.4rem)] font-black leading-[1.04] tracking-[-0.055em] text-text">
  의지가 꺾인 날에도
</span>
<span className="mt-1 block text-[clamp(1.25rem,5.25vw,1.7rem)] font-black leading-[1.04] tracking-[-0.055em] text-accent">
  계속한 사람이, 결국 이긴다
</span>
```

Do not change `DISPLAY_MS`, `FADE_MS`, `MAX_BLOCK_MS`, `unoptimized`, `sizes`,
the session gate, or the click handler.

- [ ] **Step 4: 관련 테스트를 통과시킨다**

Run:

```powershell
pnpm exec vitest run 'src/components/launch-motivation-splash.test.tsx' 'src/app/(tabs)/layout.test.tsx' 'src/lib/domain/launch-splash.test.ts'
```

Expected: 3 test files, 13 tests pass.

- [ ] **Step 5: 구현 커밋을 만든다**

Stage only:

```powershell
git add -- `
  'public/splash/gnd-launch-motivation-v5.png' `
  'src/components/launch-motivation-splash.tsx' `
  'src/components/launch-motivation-splash.test.tsx'
git commit -m "fix: GND 시작 이미지 문구 교체"
```

### Task 4: 개발 서버에서 실제 사용자 흐름을 확인한다

**Files:**
- Verify: `src/components/launch-motivation-splash.tsx`
- Verify: `public/splash/gnd-launch-motivation-v5.png`

- [ ] **Step 1: 개발 서버를 실행한다**

Run in the isolated worktree:

```powershell
pnpm dev -- --hostname 0.0.0.0 --port 3011
```

Expected: `http://localhost:3011`에서 Next 개발 서버가 응답한다.

- [ ] **Step 2: 새 세션 첫 실행을 실제 브라우저로 확인한다**

Open a fresh browser storage context at `http://localhost:3011/home` and inspect the rendered
element.

Expected:

- 시작 오버레이 1개
- `currentSrc`가 `/splash/gnd-launch-motivation-v5.png`
- 이미지의 두 줄이 정확함
- 이전 두 줄은 0개
- `naturalWidth`와 `naturalHeight`가 승인 이미지와 같음
- 자동 압축 `_next/image` 주소가 아니라 원본 PNG 주소

- [ ] **Step 3: 종료 흐름과 세션 중복 방지를 조작한다**

Expected:

- 그대로 두면 이미지 로드 뒤 1.5초 + 180ms 안에 오버레이 0개
- 새 세션에서 화면 터치 전 1개 → 터치 후 0개
- 같은 세션 새로고침 0개
- `/record` 이동 뒤 0개
- 브라우저 오류 0개

### Task 5: 전체 검증과 종료 기록을 남긴다

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/HANDOFF-2026-08-17-gnd-launch-splash.md`

- [ ] **Step 1: 전체 검증을 한 번 실행한다**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: 모두 exit 0. 테스트 수는 실제 출력값을 문서에 기록한다.

- [ ] **Step 2: 종료 문서를 실제 결과로 갱신한다**

Record:

- 최종 카피와 `v5` 경로·크기·SHA256
- 개발 서버 조작 결과
- lint, typecheck, 전체 test, build의 실제 수치
- DB/마이그레이션 변경 없음
- 운영 배포 안 함
- 다음 할 일 1개: GitHub 푸시 여부 결정 후 별도 운영 배포 승인

- [ ] **Step 3: 문서 커밋을 만든다**

```powershell
git add -- 'PROGRESS.md' 'docs/superpowers/HANDOFF-2026-08-17-gnd-launch-splash.md'
git commit -m "docs: GND 시작 이미지 문구 교체 기록"
```

- [ ] **Step 4: GitHub 푸시 여부를 사용자에게 묻는다**

Report the exact outgoing commit count, destination `origin/main`, remaining unrelated files,
and the `v5` binary size. If approved, scan the outgoing diff for literal secrets, push without
`--force`, then run:

```powershell
git fetch origin --prune
git rev-list --left-right --count origin/main...main
git ls-remote --symref origin HEAD
```

Expected after an approved push: divergence `0 0`, server default branch `refs/heads/main`.

- [ ] **Step 5: 운영 배포는 별도 승인을 받는다**

Do not treat GitHub push as deployment. After explicit deployment approval, use the verified
local `main` clean-copy Vercel CLI process from `CLAUDE.md`, then confirm `READY`, alias
`gnd-one.vercel.app`, the production `v5` asset hash, one visible splash, and automatic close.
