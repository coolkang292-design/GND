# 달력 운동 예정표 구현 계획

**설계:** `docs/superpowers/specs/2026-07-18-calendar-workout-plans-design.md`

### Task 1: 도메인 모델 TDD

- `src/lib/domain/workout-plan.test.ts`에 날짜·변환·검증 실패 케이스를 먼저 작성한다.
- `src/lib/domain/workout-plan.ts`에 순수 함수와 저장 타입을 구현한다.

### Task 2: 0015와 실 DB 검증

- `supabase/migrations/0015_workout_plans.sql`에 테이블, 인덱스, RLS, 이동 RPC를 작성한다.
- `scripts/workout-plan-test.mjs`로 본인 CRUD·타인 차단·중복·이동·과거 날짜를 검증한다.
- SQL Editor 적용 전에는 정적 검사만 하고, 실 DB 스크립트는 실행하지 않는다.

### Task 3: 데이터 함수

- `src/lib/workout-plan.ts`에 조회·저장·이동·삭제 함수를 구현한다.
- `WorkoutDraft`에 불러온 예정표 ID를 보관하고 기존 version 1 임시저장을 안전하게 읽는다.

### Task 4: 달력 UI와 운동 준비 연결

- `calendar-view.tsx`: 복사 대상 날짜 선택, 예정 라벨, 상세 관리 UI.
- `record/page.tsx`: 예정표 저장·준비 목록 불러오기, 운동 완료 성공 후 예정표 삭제.
- 완료 운동·통계·챌린지 집계 코드는 수정하지 않는다.

### Task 5: 리뷰와 검증

- 독립 코드 리뷰에서 권한, 데이터 손실, 모바일 레이아웃을 확인한다.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`를 실행한다.
- 사용자 `0015` 적용 후 `node scripts/workout-plan-test.mjs`와 기존 RLS 테스트를 실행한다.
- 검증 결과를 `PROGRESS.md`에 기록하고 운영 배포는 별도 승인받는다.
