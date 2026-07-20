# Tabata Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타바타 4·8·16분 코스 + 세션 표식·배지 + 챌린지 "타바타 횟수" (spec: `docs/superpowers/specs/2026-07-19-tabata-courses-design.md`).

**Architecture:** 이어붙인 음원 3종(제작 완료) + `TABATA_TRACKS` 코스화 + `workout_sessions.tabata_minutes`(0019) + goal_type `tabata_count`.

**Tech Stack:** ffmpeg(완료), Supabase, Vitest

---

### Task 1: 코스 도메인·시트 (TDD)

**Files:** Modify `src/lib/domain/tabata.ts`(+test) — `TABATA_TRACKS`를 `{id,title,src,minutes:4|8|16}` 3종으로, minutes→track 조회 `tabataTrackForMinutes`. Modify `src/components/record/tabata-sheet.tsx` — 코스 버튼 3개(기본 4분), 선택 코스 음원 재생, `onBegin(picked, minutes)`.

- [ ] **Step 1:** 트랙 3종·조회 실패 테스트 → RED → 구현 → GREEN → 커밋.

### Task 2: 표식 저장·배지

**Files:** Create `supabase/migrations/0019_tabata.sql` — ①`workout_sessions.tabata_minutes int check in (4,8,16)` + `grant insert (tabata_minutes)`(0004 컬럼 그랜트 방식) ②`user_goals_goal_type_check`에 `tabata_count` 추가(0008 패턴). Modify `src/lib/workout.ts` `createDraftSession`에 `tabataMinutes?` — insert 포함. Modify record page `beginTabata` — 세션 생성 시 코스 분수 전달(일반 흐름은 null). Feed(`social.ts`+`feed-item.tsx`)·달력(`workout.ts`+`calendar-view.tsx`)에 `tabata_minutes` 조회·"🔥 타바타 N분" 배지. 픽스처 2곳 필드 추가.

- [ ] **Step 1:** 마이그레이션 작성·커밋(적용은 사용자).
- [ ] **Step 2:** 저장·배지 연결, 게이트 통과, 커밋.

### Task 3: 챌린지 tabata_count (TDD)

**Files:** Modify `src/lib/domain/goal-score.ts` — GoalType += `tabata_count`. Modify `src/lib/challenge.ts` — `GOAL_TYPE_META.tabata_count`(라벨 "타바타 횟수"·단위 회·기본 12·category bodyweight), `PeriodStats.tabataCount`+`EMPTY_STATS`, `PeriodSessionRow.tabataMinutes`, `foldPeriodStats`가 표식 세션 수 집계, `actualForGoal` case, `getPeriodStatsByUser` select에 `tabata_minutes`. Modify `src/components/challenge/setup-sheet.tsx` — bodyweight 카테고리에 추가, METRIC_LABEL "타바타", PER_DAY_DEFAULT 1. Test `src/lib/challenge.test.ts` — fold·actual 케이스.

- [ ] **Step 1:** fold/actual 실패 테스트 → RED → 구현 → GREEN → 커밋.

### Task 4: 검증·배포

- [ ] **Step 1:** 전체 게이트(unit·typecheck·lint·build) → **사용자 0019 적용** → 실 DB 게이트 재통과(기존 6종 + tabata_minutes insert 확인은 workout-plan-test 관례로 수동 REST 1회).
- [ ] **Step 2:** 실기기(8분 코스 블록 전환·자동 기록·피드 배지·챌린지 타바타 목표) → 배포 → PROGRESS 기록.
