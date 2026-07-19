# Exercise Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 카드 길게 누르기 → 드래그로 순서 이동/삭제 바텀시트 (spec: `docs/superpowers/specs/2026-07-19-exercise-reorder-design.md`).

**Architecture:** 순수 도메인(moveItem) + 길게 누르기 훅 + 시트 컴포넌트, record 페이지의 draft 배열만 재배열.

**Tech Stack:** React 19 pointer events, Vitest

---

### Task 1: moveItem 도메인 (TDD)

**Files:** Create `src/lib/domain/reorder.test.ts`, `src/lib/domain/reorder.ts`

- [x] **Step 1:** 실패 테스트 — 앞→뒤 이동, 뒤→앞 이동, from===to·범위 밖·빈 배열이면 동일 배열 반환(불변).
- [x] **Step 2:** RED 확인 → 최소 구현 → GREEN → 커밋 `feat: reorder domain helper`.

### Task 2: use-long-press 훅 (TDD)

**Files:** Create `src/hooks/use-long-press.test.tsx`, `src/hooks/use-long-press.ts`

- [x] **Step 1:** 실패 테스트(fake timers) — pointerdown 후 500ms 경과 시 콜백 1회, 450ms에 up이면 미발동, 10px 초과 move면 취소, leave/cancel 취소.
- [x] **Step 2:** 구현 — `useLongPress(onTrigger)`가 onPointerDown/Up/Move/Leave/Cancel/ContextMenu 핸들러 객체 반환. GREEN → 커밋 `feat: long-press hook`.

### Task 3: 순서 이동 시트 + 연결

**Files:** Create `src/components/record/exercise-reorder-sheet.tsx` · Modify `src/components/record/exercise-card.tsx`(헤더에 길게 누르기 핸들러 prop) · Modify `src/app/(tabs)/record/page.tsx`(시트 상태·onMove·onRemove)

- [x] **Step 1:** 시트 구현 — 행: `부위 | 이름` + 🗑 + ≡(touch-action none). 드래그: 핸들 pointerdown→setPointerCapture, move로 dy 추적, `Math.round(dy/행높이)` 칸 이동 시 onMove 호출·기준점 갱신, 드래그 행 translateY·나머지 transition.
- [x] **Step 2:** ExerciseCard 헤더 제목 줄에 `onLongPress` 연결(입력·버튼 제외 영역), record 페이지에 시트 open 상태 + `moveItem` 적용.
- [x] **Step 3:** 전체 게이트(test·typecheck·lint·build) → 커밋 `feat: exercise reorder sheet`.

### Task 4: 검증·배포

- [x] **Step 1:** 사용자 실기기 확인(준비 단계·운동 중 드래그, 새로고침 유지, 🗑) — **확인 후 배포**.
- [x] **Step 2:** `pnpm dlx vercel deploy --prod --yes` → 200 확인 → PROGRESS 기록 커밋.
