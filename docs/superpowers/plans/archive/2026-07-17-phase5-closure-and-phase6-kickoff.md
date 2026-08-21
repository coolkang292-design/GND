# Phase 5 마무리(커밋) + Phase 6 착수 준비 계획

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 미커밋 상태인 Phase 5.2~5.3 작업(카테고리 목표·burnfit 시드·홈 크루 사진·맨몸 칩·0010 루틴 시드·RLS 보정)을 실기기 확인 → build → 명시적 커밋으로 마감하고, Phase 6(소셜)을 설계부터 시작할 수 있는 상태로 만든다.

**Architecture:** 코드 변경 없음(전부 완료·검증됨). 남은 것은 사용자 확인 게이트 → 최종 build → 파일 명시 커밋 → 문서 병합 → Phase 6 브레인스토밍 순서의 절차 작업이다.

**Tech Stack:** Next.js 16 · pnpm · Vitest · Supabase (SQL Editor 수동 마이그레이션)

**이미 완료된 전제 (2026-07-17, 이 계획에서 다시 하지 말 것):**
- DB 0001~0009 적용 완료. `scripts/rls-test.mjs` 레거시 goal_type 3곳 보정 후 현재 DB 기준 **RLS 68/68 통과**.
- typecheck·lint·unit **96 tests** 통과 (맨몸 칩 포함 코드 기준).
- dev 서버 실행 중 (`pnpm exec next dev -H 0.0.0.0`, localhost:3000).

---

### Task 1: 사용자 — 0010 마이그레이션 적용

**Files:**
- 읽기만: `supabase/migrations/0010_bodyweight_routine_exercises.sql`

- [ ] **Step 1: SQL Editor에 적용**

사용자가 직접: 파일 열기 → 전체 복사 → Supabase Dashboard(프로젝트 `cjdskubyxlnojwzhwbfx`) → SQL Editor → Run.
Expected: `Success. No rows returned`. (`on conflict ... do nothing`이라 재실행 안전)

- [ ] **Step 2: 적용 확인**

SQL Editor에서:
```sql
select name from public.exercise_catalog
where name in ('점프 스쿼트','마운틴 클라이머','슈퍼맨 로우','인치웜 푸시업','라잉 Y 레이즈','타이슨 푸시업');
```
Expected: 6행 반환.

### Task 2: 사용자 — 실기기 확인 6항목

dev 서버 주소: 같은 와이파이 `http://192.168.219.112:3000` / Tailscale `http://100.85.240.15:3000` / PC `http://localhost:3000`.

- [ ] 챌린지 탭: 카테고리별 목표(웨이트/유산소/맨몸) 설정 흐름
- [ ] 기록 탭: 맨몸 시간형 종목(플랭크 등) 분 단위 세트 입력
- [ ] 기록 탭 운동 추가: `클린 앤 저크`·`사이드 플랭크`·`줄넘기` 중 1개 검색됨 (0009)
- [ ] 기록 탭 운동 추가: **"맨몸" 칩** 탭 → bodyweight 종목만 필터됨
- [ ] 기록 탭 운동 추가: `점프 스쿼트`·`타이슨 푸시업` 검색됨 (0010 적용 후)
- [ ] 홈: "최근 친구 활동" 자리에 크루 인증사진 카드 노출 (인증사진 있는 크루 완료 세션 필요)

문제 발견 시: 여기서 멈추고 superpowers:systematic-debugging으로 원인 규명 → 수정 → 이 태스크 재확인.

### Task 3: 최종 build (dev 서버 종료 후)

- [ ] **Step 1: dev 서버 종료**

실행 중인 `next dev` 백그라운드 프로세스를 종료한다 (교훈 8: dev와 build 동시 실행 금지).
확인: `Get-NetTCPConnection -LocalPort 3000 -State Listen` 결과 없음.

- [ ] **Step 2: build 실행**

Run: `pnpm build` (저장소 루트)
Expected: exit 0, 컴파일 에러 없음.

### Task 4: 명시적 커밋 (git add . 금지)

- [ ] **Step 1: 커밋 대상만 stage**

```powershell
git add supabase/migrations/0007_weight_days_goal.sql supabase/migrations/0009_burnfit_exercises.sql supabase/migrations/0010_bodyweight_routine_exercises.sql src/lib/workout.ts src/components/crew-latest-workout.tsx "src/components/record/exercise-picker.tsx" "src/app/(tabs)/home/page.tsx" docs/superpowers/plans/archive/2026-07-17-challenge-category-goals.md docs/superpowers/plans/archive/2026-07-17-phase5-closure-and-phase6-kickoff.md PROGRESS.md scripts/rls-test.mjs
```

- [ ] **Step 2: stage 상태 검증**

Run: `git status --porcelain`
Expected: `.claude/settings.local.json`이 staged에 **없음**(untracked로 남음). staged 목록이 위 11개 파일과 일치.

- [ ] **Step 3: 커밋**

```powershell
git commit -m "feat: Phase 5.2~5.3 마감 - 카테고리 목표 마이그레이션·burnfit/맨몸루틴 시드·홈 크루 사진·맨몸 칩·RLS 픽스처 보정"
```

### Task 5: PROGRESS.md ⚠️ 섹션 병합 + 문서 커밋

- [ ] **Step 1:** PROGRESS.md의 "⚠️ 진행 중 작업" 섹션을 삭제하고 내용 요약을 "Phase 5 산출물"에 병합(0007~0010 적용 완료·RLS 68/68·실기기 확인 완료 기록. "다음 세션 할 일 = Phase 6" 유지, 마이그레이션 번호 0011 유지).
- [ ] **Step 2:** `git add PROGRESS.md` → `git commit -m "docs: Phase 5 마감 반영, 인수인계 섹션 병합"`

### Task 6: Phase 6 착수 — 설계 먼저 (별도 계획으로 분리)

Phase 6(소셜: 피드·반응·응원·찌르기·알림)은 독립 서브시스템이므로 이 계획에 구현 태스크를 두지 않는다 (Scope Check).

- [ ] **Step 1:** superpowers:brainstorming 스킬로 Phase 6 요구사항 탐색 (입력: `PROGRESS.md` "다음 세션 할 일 = Phase 6" 8항목 + 계획서 §9·§14·§18)
- [ ] **Step 2:** 설계 산출물을 `docs/superpowers/specs/YYYY-MM-DD-phase6-social-design.md`로 저장
- [ ] **Step 3:** superpowers:writing-plans로 `docs/superpowers/plans/YYYY-MM-DD-phase6-social.md` 작성 — 마이그레이션 **0011**(reactions·cheers·notifications·notification_settings·workout_events + RLS)부터 태스크 분해, 도메인 로직은 `src/lib/domain/`에 TDD

**핵심 결정 사항(브레인스토밍에서 다룰 것):** ① 타인용 알림 쓰기 경로 — service_role 없이 definer RPC로 갈지 ② 응원 스팸 제한(세션당 3회·10초 쿨다운)을 DB 제약으로 강제할지 RPC 검증으로 할지 ③ Realtime 채널 설계(크루 단위 vs 세션 단위).
