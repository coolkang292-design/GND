# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `phase0-mockup.html`.

## 현재 상태 (2026-07-15 기준)

**Phase 0·1·2 완료. 다음 작업 = Phase 3 (운동 핵심).**

| Phase | 상태 | 비고 |
|---|---|---|
| 0 목업 | ✅ | phase0-mockup.html |
| 1 웹앱 기반 | ✅ | 테마·5탭·익명인증·PWA·lib/domain/time (18 tests) |
| 2 신원·크루 | ✅ | 온보딩·초대링크·RLS — 2인 테스트 15/15 통과 |
| 3 운동 핵심 | ⬅️ 다음 | 세션·상태전이 RPC·운동검색/직접만들기·세트입력·휴식타이머·임시저장 |
| 4~7 | 대기 | 계획서 §18 참조 |

## 환경

- 저장소: `C:\Users\SAMSUNG\workout-app` (git 로컬 전용, 리모트 없음)
- 스택: Next.js 16 App Router · TS strict · Tailwind v4 · pnpm · Vitest
- 실행: `pnpm dev` → http://localhost:3000
- 검증: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
- Supabase: 프로젝트 `cjdskubyxlnojwzhwbfx`, 익명 인증 ON, 키는 `.env.local`(커밋 안 됨)
- RLS 검증: `node scripts/rls-test.mjs` (익명 2인 픽스처 15케이스)

## DB 마이그레이션 절차 (중요)

CLI/DB 비밀번호 없음 → **사용자가 SQL Editor에 수동 붙여넣기**로 적용한다.
`supabase/migrations/` 번호 순서대로. **0001~0003 적용 완료됨** (재실행 금지).
새 마이그레이션 만들면 사용자에게 "파일 열기 → 전체 복사 → SQL Editor → Run"으로 안내.

## 코드 구조 요약

- `src/app/(tabs)/` — 하단 5탭 화면 (home/feed/record/challenge/profile)
- `src/app/onboarding/` — 3단계 온보딩 (아바타 9종·닉네임·주간목표 → 크루 만들기/참여)
- `src/app/invite/[code]/` — 초대 링크 자동 합류
- `src/components/` — auth-provider(익명인증)·onboarding-gate·tab-bar·crew-card 등
- `src/lib/domain/` — 순수 함수 + TDD (time.ts, invite-code.ts) ← 새 도메인 로직은 여기에 TDD로
- `src/lib/supabase/` — browser/server 클라이언트
- `src/lib/crew.ts` — profiles/groups 데이터 헬퍼

## 이번 세션에서 얻은 교훈 (재발 방지)

1. **INSERT ... RETURNING은 SELECT 정책 검사를 받는다** — 생성 직후 본인이 못 읽는 정책이면 42501. owner 조건을 SELECT 정책에 포함할 것 (0002).
2. **plpgsql `returns table(...)` 컬럼명이 실제 테이블 컬럼과 겹치면** on conflict 등에서 42702 ambiguous → `#variable_conflict use_column` (0003).
3. RLS는 반드시 실제 2인 픽스처로 검증 — 위 두 버그 모두 코드 리뷰가 아닌 실행 테스트로 발견됨.
4. eslint `react-hooks/set-state-in-effect` — effect 안 동기 setState 금지. localStorage 프리필은 lazy useState 초기화로.

## Phase 3 착수 시 할 일 (계획서 §10·§13·§15·§16·§18)

1. 마이그레이션 0004: `exercise_catalog`(기본 시드 포함)·`workout_sessions`·`workout_exercises`·`workout_sets` + RLS + active 세션 유니크 부분 인덱스
2. 상태전이 RPC: 운동 시작(중복 active 확인→started_at 서버시간)·완료·취소 — 클라가 started_at/completed_at 직접 쓰기 금지
3. `lib/domain/volume.ts` TDD (완료 세트만, 유형별 분리 집계)
4. 기록 탭 UI: 운동 검색/직접 만들기 → 세트 입력(중량×횟수, 직전값 복사) → 휴식 타이머(운동 전 사전설정, 10초 단위, 기본 90초)
5. 임시저장·새로고침 복구
6. 검증: volume TDD + RLS(세션 비공개/타인 수정 차단) + lint·typecheck·build
