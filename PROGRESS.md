# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `phase0-mockup.html`.

## 현재 상태 (2026-07-16 기준)

**Phase 0·1·2·3 완료. 다음 작업 = Phase 4 (완료 루프).**

| Phase | 상태 | 비고 |
|---|---|---|
| 0 목업 | ✅ | phase0-mockup.html |
| 1 웹앱 기반 | ✅ | 테마·5탭·익명인증·PWA·lib/domain/time (18 tests) |
| 2 신원·크루 | ✅ | 온보딩·초대링크·RLS — 2인 테스트 통과 |
| 3 운동 핵심 | ✅ | 세션·RPC·카탈로그·세트입력·휴식타이머·임시저장 — unit 47 + RLS 2인 40/40 통과 |
| 4~7 | 대기 | 계획서 §18 참조 |

### Phase 3 산출물

- `supabase/migrations/0004_workout_core.sql` — exercise_catalog(시드 29종)·workout_sessions·workout_exercises·workout_sets + RLS + active 유니크 부분 인덱스 + start/complete/cancel RPC. **status/started_at/completed_at은 컬럼 권한으로 클라 쓰기 차단**(RPC는 security definer라 통과), 세트 completed_at은 트리거가 서버시간 기록.
- `lib/domain/volume.ts`(완료 세트만·유형별 분리)·`lib/domain/streak.ts`(5일 소멸·단계 판정) — TDD 47 tests.
- 기록 탭: 검색/직접만들기 시트·세트 입력(직전값 복사·직전 기록 프리필)·휴식 사전설정+카운트다운 바·경과 타이머·이전 대비 볼륨.
- 임시저장: localStorage(`gnd-workout-draft:{userId}`) 자동 저장 + 마운트 시 서버 세션 상태와 대사(다른 기기 완료/취소 반영, 로컬 유실 시 active 세션 재입양). 운동·세트 DB 기록은 완료 시 일괄 저장.
- `scripts/rls-test.mjs` 15 → 40케이스 확장(카탈로그 격리·상태전이·컬럼 권한·크루 공개/비공개 경계) — **2026-07-16 실DB 40/40 통과**.

## 환경

- 저장소: `C:\Users\SAMSUNG\workout-app` (git 로컬 전용, 리모트 없음)
- 스택: Next.js 16 App Router · TS strict · Tailwind v4 · pnpm · Vitest
- 실행: `pnpm dev` → http://localhost:3000
- 검증: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
- Supabase: 프로젝트 `cjdskubyxlnojwzhwbfx`, 익명 인증 ON, 키는 `.env.local`(커밋 안 됨)
- RLS 검증: `node scripts/rls-test.mjs` (익명 2인 픽스처 15케이스)

## DB 마이그레이션 절차 (중요)

CLI/DB 비밀번호 없음 → **사용자가 SQL Editor에 수동 붙여넣기**로 적용한다.
`supabase/migrations/` 번호 순서대로. **0001~0004 적용 완료됨** (재실행 금지).
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

## 다음 세션 할 일

1. 실기기 스모크: 운동 추가→시작→세트 완료(휴식 타이머)→종료→완료 화면, 새로고침 복구
2. Phase 4 착수 (완료 루프): 사진 압축·업로드·완료·달력 스탬프(계산)·날짜상세·지난 운동 복사 — `calendar.ts` tz TDD, Storage 버킷(avatars·workout-images) 생성 필요
