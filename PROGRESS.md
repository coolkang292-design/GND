# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `운동앱-목업.html`.

## ⚠️ 진행 중 작업 (2026-07-17, 미커밋 — 실기기 확인 후 커밋 대기)

**세 작업 흐름의 코드는 완료·검증(typecheck·lint·test·build 통과)됐고 0007~0009 DB 적용도 확인됐다. 다만 `0007`·`0009` 파일, 홈 크루 사진 코드, 이 인수인계 문서는 아직 미커밋이며, 실기기 확인이 남았다.**
메모리 규칙: 기능완성 → 검증 → **사용자 실기기 확인 → 그다음 커밋**. 아직 커밋하지 마라.

### 1) 챌린지 목표 카테고리 우선 개편 (Phase 5.2) — 코드 커밋 완료(`63e5c27`~`88d959b`), DB 적용 확인 완료 ✅
목표를 **웨이트/유산소/맨몸 카테고리 우선**으로 재편. goal_type 7종 + 레거시 volume:
`weight_reps·weight_days·cardio_distance·cardio_time·bodyweight_reps·bodyweight_time·bodyweight_days`.
맨몸운동은 `measure`(reps/time)로 횟수형/시간형 구분(매달리기·플랭크·사이드플랭크·핸드스탠드=time). `*_days`는 하루 N부위/N종목+ 조건(`qualifier`).
설계·계획 문서: `docs/superpowers/specs/2026-07-17-challenge-category-goals-design.md`, `docs/superpowers/plans/2026-07-17-challenge-category-goals.md`.
`supabase/migrations/0007_weight_days_goal.sql`과 위 계획 문서는 아직 Git 미추적 상태이므로 최종 커밋 범위에 명시적으로 포함할 것.

**⚠️ DB 마이그레이션 의존성 (가장 중요한 인수인계 항목):**
- 카테고리 코드는 `workout_exercises.body_part`·`user_goals.qualifier`(**0007**)와 `*.measure`·확장 goal_type(**0008**)를 **모두 쿼리**한다. 하나라도 미적용이면 챌린지 화면이 400/런타임 에러.
- **0008 = 사용자 적용 완료 ✅** ("Success. No rows returned" 확인).
- **0007 = 적용 완료 확인 ✅** — 2026-07-17 아래 검증 쿼리 결과 `has_body_part=true`, `has_qualifier=true`, `has_measure=true` 확인. 다시 실행하지 말 것:
  ```sql
  select
    exists(select 1 from information_schema.columns
           where table_name='workout_exercises' and column_name='body_part') as has_body_part,
    exists(select 1 from information_schema.columns
           where table_name='user_goals' and column_name='qualifier') as has_qualifier,
    exists(select 1 from information_schema.columns
           where table_name='exercise_catalog' and column_name='measure') as has_measure;
  ```
  위 결과는 적용 근거 기록용이다. 현재 셋 다 true이므로 **0007·0008을 다시 실행하지 말 것**.

### 2) burnfit.io 운동 카탈로그 확장 (Phase 5.3) — 파일 미커밋, DB 적용 완료 ✅
- `supabase/migrations/0009_burnfit_exercises.sql` (**사용자 적용 완료 ✅**, "Success. No rows returned" 확인) — https://burnfit.io/라이브러리/ 의 운동 40종 시드. 기존 시드(0004)·매달리기(0008)와 중복은 제외. 맨몸은 measure 지정, `on conflict (name) where created_by is null do nothing`로 재실행 안전.
- 남은 확인: 실기기 운동 검색에서 `클린 앤 저크`·`사이드 플랭크`·`줄넘기` 중 하나가 조회되는지 확인.

### 3-b) 맨몸 카테고리 칩 + 맨몸 루틴 종목 시드 (2026-07-17 사용자 요청) — 미커밋, **DB 0010 미적용**
- `src/components/record/exercise-picker.tsx`: 부위 칩 뒤에 **"맨몸" 칩** 추가 — body_part가 아니라 `exercise_type === 'bodyweight'` 모달리티 필터(FILTERS = PARTS + 맨몸). 직접 만들기 부위 select에는 미포함(부위 아님).
- `supabase/migrations/0010_bodyweight_routine_exercises.sql`: 맨몸 루틴 신규 6종 시드(점프 스쿼트·마운틴 클라이머·슈퍼맨 로우 / 인치웜 푸시업·라잉 Y 레이즈·타이슨 푸시업, 전부 bodyweight·reps). 푸시업(0004)·사이드/덤벨 레터럴 레이즈(0004·0009)는 기존 종목 사용으로 중복 제외. **사용자가 SQL Editor로 적용해야 신규 종목이 보임.**
- 루틴 자체(종목 묶음 템플릿) 기능은 별개 주제 — 현재는 "지난 운동 복사"로 대체, 필요하면 Phase 6 이후 별도 설계.

### 3) 홈 '최근 친구 활동' — 크루 최근 인증사진 (Phase 5.3) — 미커밋
- `src/lib/workout.ts` → `getLatestCrewWorkoutWithPhoto(groupId)`: 크루 공개 완료 세션 중 인증사진 있는 최신 1건, 비공개 버킷이라 `createSignedUrl`(1h)로 노출. 반환 `LatestCrewWorkout`.
- `src/components/crew-latest-workout.tsx`(신규): 사진 카드 + 닉네임·"n분 전 운동 완료" 오버레이. 사진 없으면 렌더 안 함.
- `src/app/(tabs)/home/page.tsx`: **목업 순서 존중** — 크루 사진을 **"최근 친구 활동" 섹션(제목 + 피드 전체 링크) 자리**에 배치(운동 시작하기 바로 밑 아님). 앱 공통 디자인 토큰 사용.
- 목업 홈의 스트릭 카드·주간 stat·그룹 공동목표·오늘 그룹 현황·꾸준왕 섹션은 **아직 미구현**(실데이터 필요 → Phase 6 소셜에서). 현재 홈 = 헤더 → 운동 시작하기 → 크루 카드 → 최근 친구 활동(사진) → 인증상태.

### ✅ RLS 픽스처 보정 완료 (2026-07-17)

- `scripts/rls-test.mjs` Phase 5 픽스처의 0008 이전 goal_type 3곳(`distance`×2 → `cardio_distance`, `frequency`×1 → `weight_days`) 보정 완료.
- 보정 후 현재 DB(0008 적용 후) 대상 **RLS 68/68 통과 (2026-07-17)**. typecheck·lint·unit 96 tests도 같이 통과.
- 참고: `distance` 2곳은 "≥400 기대" 네거티브 테스트라 보정 전에는 RLS가 아닌 check 제약 위반으로도 통과하는 가짜 통과였다 — 보정으로 실제 RLS 거부를 검증하게 됨.
- `pnpm build`만 남음: 실기기 확인용 dev 서버가 떠 있어 동시 실행 금지(교훈 8) → 실기기 확인 끝나고 dev 서버 종료 후 실행.

### 남은 절차
1. 사용자: **0010을 SQL Editor로 적용**(파일 열기 → 전체 복사 → Run) — 그래야 맨몸 루틴 신규 6종이 검색됨.
2. 사용자: **실기기 확인 6항목**(카테고리별 목표 설정·맨몸 시간형 분 입력·burnfit 신규 종목 검색·홈 크루 사진 노출·**맨몸 칩 필터**·**루틴 신규 종목 검색(0010 적용 후)**). dev 서버는 2026-07-17 현재 실행 중(localhost:3000 HTTP 200 확인).
3. 확인 후 dev 서버 종료 → `pnpm build` 최종 확인.
4. 아래 "커밋 대상" 파일만 명시적으로 커밋. `.claude/settings.local.json`은 개인 설정이므로 제외.
5. 커밋 후 이 ⚠️ 섹션을 삭제하고 아래 Phase 5 산출물에 병합.

### 다음 에이전트 시작 체크리스트

1. 저장소 `C:\Users\SAMSUNG\workout-app`, 브랜치 `main`, 현재 HEAD `88d959b`에서 시작. 작업트리는 의도적으로 미커밋 상태이므로 초기화·되돌리기 금지.
2. **DB 0007·0008·0009는 모두 적용 완료**. SQL 파일을 다시 실행하지 말 것.
3. 현재 커밋 대상:
   - `supabase/migrations/0007_weight_days_goal.sql`
   - `supabase/migrations/0009_burnfit_exercises.sql`
   - `supabase/migrations/0010_bodyweight_routine_exercises.sql`
   - `src/lib/workout.ts`
   - `src/components/crew-latest-workout.tsx`
   - `src/components/record/exercise-picker.tsx` (맨몸 칩)
   - `src/app/(tabs)/home/page.tsx`
   - `docs/superpowers/plans/2026-07-17-challenge-category-goals.md`
   - `docs/superpowers/plans/2026-07-17-phase5-closure-and-phase6-kickoff.md`
   - `PROGRESS.md`
   - `scripts/rls-test.mjs` (레거시 goal_type 픽스처 보정 완료, 68/68 통과)
4. **커밋 제외:** `.claude/settings.local.json`(개인 설정). `git add .` 사용 금지. 위 파일을 경로로 명시해서 stage할 것.
5. 개발 서버는 필요할 때 저장소 루트에서 `pnpm exec next dev -H 0.0.0.0`으로 시작. 현재 인수인계 작성 시점에는 3000번 포트 listener 없음.
6. 픽스처 보정·typecheck·lint·unit 96·RLS 68/68은 2026-07-17 완료. 실기기 항목이 통과하면 **개발 서버를 먼저 종료하고 `pnpm build`만** 최종 확인하면 된다(맨몸 칩·0010 이후 코드 기준 build는 아직 안 돌림).
7. 사용자 확인 전에는 커밋하지 말 것. 확인 후 기능 커밋을 만들고, 이 ⚠️ 섹션을 Phase 5 산출물로 병합한 뒤 문서 커밋.

---

## 현재 상태 (2026-07-17 기준)

**Phase 0~5 완료 (2026-07-17). 다음 작업 = Phase 6 (소셜: 피드·반응·응원·찌르기·알림).**

| Phase | 상태 | 비고 |
|---|---|---|
| 0 목업 | ✅ | 운동앱-목업.html |
| 1 웹앱 기반 | ✅ | 테마·5탭·익명인증·PWA·lib/domain/time (18 tests) |
| 2 신원·크루 | ✅ | 온보딩·초대링크·RLS — 2인 테스트 통과 |
| 3 운동 핵심 | ✅ | 세션·RPC·카탈로그·세트입력·휴식타이머·임시저장 — unit 47 + RLS 40/40 + PC·폰 스모크 통과 |
| 4 완료 루프 | ✅ | 달력(`9e540ef`)·지난 운동 복사(`1f3281d`)·인증사진(`a1a6e1a`) — unit 63 + RLS 54/54 + E2E 2종 통과 |
| 5 챌린지 | ✅ | goal-score TDD 20케이스·KPI 게이트·진행중 비공개·시상대(`ea6fb60`) — unit 83 + RLS 68/68 + E2E 통과 |
| 6~7 | 대기 | 계획서 §18 참조 |

### Phase 5 산출물 (2026-07-17)

- `lib/domain/goal-score.ts` TDD 20케이스 (§7 그대로): rate 정규화→평균(개수중립)→100% 상한→overall 0.8/0.2→동점 ①달성률②참여율③선착④완료목표수⑤공동순위. `plannedDaysForPeriod`(주N일→기간 환산)·`gndLabel`(탈출/탈출중/확정).
- 0006: `challenges`(살아있는 챌린지 크루당 1개 partial unique)·`user_goals`(unique(user,challenge,type), **setup 단계만 쓰기 = 기록 보존**) + `start_challenge`(전원 KPI 게이트)·`cancel_challenge`(생성자)·`finalize_challenge`(KST 종료일 지나야) RPC.
- `lib/challenge.ts`: CRUD·지난 KPI 불러오기·`getPeriodStatsByUser`(기간 실적: 운동일·볼륨·거리·시간·맨몸횟수 — tz dayKey로 기간 필터)·`actualForGoal`.
- 챌린지 탭: 없음→만들기 시트 / setup→내 KPI·참여자 현황·전원 게이트 / active→내 진행률만(🔒 타인 잠금)·D-day / ended→시상대(👑)+상세 순위 카드.
- **미구현(Phase 6으로)**: 등수변동 알림(§18 Phase 5 항목이지만 notifications 테이블이 Phase 6) — 진행중 비공개라 실질 발동은 종료 시점, Phase 6 알림함과 함께.
- **결정 변경 (2026-07-17, 사용자)**: ① KPI 입력은 "하루량 × 주 N일 → 기간 총량 자동계산"이 기본(총량 직접 입력 토글 유지, `cdac252`). ② **volume(총볼륨)은 챌린지 목표 선택지에서 제외** — 부위·종목별 중량이 달라 기간 목표로 감 잡기 어려움(계획서 §7 "volume 포함" 결정 변경). DB·점수 산식·과거 데이터 렌더링은 유지, UI 선택지만 제거. ③ **reps = '총 반복 횟수'로 확장** — 맨몸 전용이 아니라 웨이트+맨몸 완료 세트 회수 합(`86f58c7`). 웨이트 유저 추천 = 운동 시간·총 반복 횟수.
- 한계(기록): 진행중 타인 진행률 숨김은 UI 레벨 — 완료 세션 자체는 크루 공개 데이터라 API로는 계산 가능. 실사용 리스크 낮음, §6 취지는 충족.

### Phase 4 산출물 (2026-07-16~17)

- **인증사진** (`a1a6e1a`): 0005 마이그레이션(버킷 2개 SQL 생성·workout_images+RLS·storage 정책·`set_workout_verification` RPC — 사진 존재해야 인증 인정). 완료 화면에서 촬영/앨범 → `lib/image.ts` 압축(≤1280px JPEG) → 비공개 업로드 → 오버레이 스탬프(화면만). 세션당 1장(unique). 달력 스탬프 ✓→🔥/● 자동 전환 확인(E2E).
- **지난 운동 복사** (`1f3281d`): 달력 상세 시트 "📋 복사" → 종목·세트 구조를 오늘 draft로(완료 여부 초기화), 운동 탭 자동 전환. 온보딩 게이트 401 경합 재시도 수정 포함.
- **E2E 스크립트**(scratchpad, puppeteer-core+Chrome): 신규유저→온보딩→운동완료→달력→복사 / →사진 업로드→● 스탬프. 새 세션에서 재작성 필요하면 위 흐름 참고.

- **달력 완료** (커밋 `9e540ef`):
  - `lib/domain/calendar.ts` — completed 세션 → tz 기준 날짜별 스탬프·월간요약·달성률. **순수함수 TDD 16케이스**(자정·월·연 경계 포함). unit 총 **63 tests**.
    - `computeDayStamps` / `sessionsInMonth`(제네릭) / `sessionsOnDay`(제네릭·상세시트·복사용) / `summarizeMonth`.
    - **달성률 정의**: `min(1, 운동일수 / (weeklyGoal/7 × 그달일수))` — 주간목표를 월 일수로 환산한 기대치 대비. (사용자 확인 완료)
  - `lib/workout.ts getCompletedSessions(userId)` — 완료 세션 + 종목명 조회(`CalendarSession = CompletedSession + {id, exerciseNames}`). 스탬프의 read-time 원천.
  - `components/record/calendar-view.tsx` — 월간요약(횟수·총시간·달성률)·‹오늘›월이동·인증수준별 스탬프(🔥카메라/●업로드/✓없음)·횟수뱃지·오늘강조·날짜 탭 상세 시트.
  - record 페이지: **운동/달력 서브탭** 추가(`subTab` state).
  - **verification은 아직 전부 none** — 인증사진 미구현이라 모든 스탬프가 ✓. 사진 붙으면 자동으로 🔥/● 전환(계산·표시 로직 준비됨).

### Phase 3 산출물 요약

- `supabase/migrations/0004_workout_core.sql` — exercise_catalog(시드 29종)·workout_sessions·workout_exercises·workout_sets + RLS + active 유니크 부분 인덱스 + start/complete/cancel RPC. **status/started_at/completed_at은 컬럼 권한으로 클라 쓰기 차단**(RPC는 security definer라 통과), 세트 completed_at은 트리거가 서버시간 기록.
- `lib/domain/volume.ts`(완료 세트만·유형별 분리)·`lib/domain/streak.ts`(5일 소멸·단계 판정) — TDD 47 tests.
- 기록 탭: 검색/직접만들기 시트·세트 입력(직전값 복사·직전 기록 프리필)·휴식 사전설정+카운트다운 바·경과 타이머·이전 대비 볼륨.
- 임시저장: localStorage(`gnd-workout-draft:{userId}`) 자동 저장 + 마운트 시 서버 세션 상태와 대사(다른 기기 완료/취소 반영, 로컬 유실 시 active 세션 재입양). 운동·세트 DB 기록은 완료 시 일괄 저장.
- `scripts/rls-test.mjs` 15 → 40케이스 확장 — 2026-07-16 실DB 40/40 통과.

## 환경 · 실행

- 저장소: `C:\Users\SAMSUNG\workout-app` (git 로컬 전용, 리모트 없음)
- 스택: Next.js 16 App Router · TS strict · Tailwind v4 · pnpm · Vitest
- 실행(PC만): `pnpm dev` → http://localhost:3000
- **실행(폰 테스트 포함)**: `pnpm exec next dev -H 0.0.0.0` 후
  - 같은 와이파이: `http://192.168.219.112:3000`
  - Tailscale(외부에서도): `http://100.85.240.15:3000`
  - 두 IP는 `next.config.ts allowedDevOrigins`에 등록돼 있음. IP가 바뀌면 거기도 갱신할 것.
  - 방화벽: 포트 3000 Private 프로필 인바운드 허용 규칙("GND dev server 3000 (Private)") 추가돼 있음 (Tailscale 경로용). Node.js Public 허용은 원래 있었음(와이파이 경로용).
  - 2026-07-17 확인: 최초 `/home` 컴파일은 느린 파일시스템 경고와 함께 약 20초 걸렸지만 이후 Wi-Fi·Tailscale 주소 모두 HTTP 200(약 0.4초). 첫 접속만 기다릴 것.
- 검증: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
- Supabase: 프로젝트 `cjdskubyxlnojwzhwbfx`, 익명 인증 ON, 키는 `.env.local`(커밋 안 됨)
- RLS 검증: `node scripts/rls-test.mjs` (68개 검사). 2026-07-17 픽스처 보정 후 현재 DB 기준 68/68 통과.

## DB 마이그레이션 절차 (중요)

CLI/DB 비밀번호 없음 → **사용자가 SQL Editor에 수동 붙여넣기**로 적용한다.
`supabase/migrations/` 번호 순서대로. 새 마이그레이션 만들면 사용자에게 "파일 열기 → 전체 복사 → SQL Editor → Run"으로 안내.
Storage 버킷도 SQL로 생성 가능했음(`insert into storage.buckets`, 0005) — Dashboard 수동 생성 불필요.

**적용 현황 (2026-07-17):**
- 0001~0006: 적용 완료 (재실행 금지)
- 0007(body_part·qualifier): 적용 완료 확인 ✅ (2026-07-17, 검증 쿼리 세 컬럼 모두 true)
- 0008(measure·카테고리 goal_type): 적용 완료 ✅
- 0009(burnfit 시드): 적용 완료 ✅ (2026-07-17, "Success. No rows returned" 확인)
- **0010(맨몸 루틴 6종 시드): 미적용 ⏳ — 사용자가 SQL Editor로 적용 필요** (on conflict do nothing이라 재실행 안전)
- 컬럼 추가·시드 위주라 idempotent 안전장치(`on conflict`, `if not exists` 성격) 있는 편이나, 재실행 시 `alter table add column`은 중복 에러 → 각 파일 1회만.

## 코드 구조 요약

- `src/app/(tabs)/` — 하단 5탭 화면 (home/feed/record/challenge/profile)
- `src/app/(tabs)/record/page.tsx` — 운동 기록 화면 전체 (상태·타이머·완료 흐름)
- `src/app/onboarding/` — 3단계 온보딩 · `src/app/invite/[code]/` — 초대 링크 자동 합류
- `src/components/record/` — exercise-picker(검색/직접만들기 시트)·exercise-card(세트 테이블)·rest-bar(휴식 카운트다운)·**calendar-view(달력 서브탭 전체)**
- `src/components/` — auth-provider(익명인증, 실패 사유 error로 노출)·onboarding-gate·tab-bar·crew-card 등
- `src/lib/domain/` — 순수 함수 + TDD (time·invite-code·volume·streak) ← 새 도메인 로직은 여기에 TDD로
- `src/lib/workout.ts` — 세션/카탈로그/세트 데이터 헬퍼 + localStorage 임시저장 + `localId()`(uuid 폴백)
- `src/lib/crew.ts` — profiles/groups 헬퍼 · `src/lib/supabase/` — browser/server 클라이언트

## 누적 교훈 (재발 방지)

1. **INSERT ... RETURNING은 SELECT 정책 검사를 받는다** — 생성 직후 본인이 못 읽는 정책이면 42501. owner 조건을 SELECT 정책에 포함할 것 (0002).
2. **plpgsql `returns table(...)` 컬럼명이 실제 테이블 컬럼과 겹치면** 42702 ambiguous → `#variable_conflict use_column` (0003).
3. RLS는 반드시 실제 2인 픽스처로 검증 — 코드 리뷰가 아닌 실행 테스트로만 발견되는 버그가 있다.
4. eslint `react-hooks/set-state-in-effect` — effect 안 동기 setState 금지. localStorage 프리필은 lazy useState 초기화, 시트 초기화는 언마운트→마운트로.
5. **폰 실기기 테스트(IP 접속)는 두 가지가 함께 막는다**: ① Next 16은 크로스 오리진 dev 리소스를 기본 차단 → 하이드레이션 자체가 안 됨(화면은 SSR 초기 상태로 박제, 에러도 안 뜸) → `allowedDevOrigins` 등록. ② http+IP는 비보안 컨텍스트 → `crypto.randomUUID`·`crypto.subtle` 없음 → `lib/workout.ts localId()` 폴백 사용.
6. **Windows 방화벽은 인터페이스 프로필별로 먹는다** — 이 PC는 와이파이=Public, Tailscale=Private. Node 허용이 Public에만 있어서 Tailscale 접속만 타임아웃됐음. 포트 3000 Private 허용 규칙로 해결.
7. **카카오톡 인앱 브라우저는 HTML에 속성을 주입**해 하이드레이션 경고(1 Issue 오버레이)를 띄운다 — 실제 오류 아님. `layout.tsx`의 html/body에 `suppressHydrationWarning` 적용해 억제. dev 오버레이는 프로덕션에선 안 뜸.
8. **개발 서버 실행 중 `pnpm build`를 동시에 돌리지 말 것** — 둘 다 `.next`를 사용해 기존 dev 서버가 3000번 포트를 잡은 채 요청에 응답하지 않는 상태가 발생했다. 최종 검증은 dev 서버를 먼저 종료하고 build를 실행한 뒤, 실기기 테스트가 더 필요하면 dev 서버를 새로 시작한다.

## 다음 세션 할 일 = Phase 6 (소셜, 계획서 §9·§18)

1. 마이그레이션 **0011**(0007~0010 사용됨): `reactions`(unique(session,user,type))·`cheers`(sender≠receiver, 크루 active 세션만)·`notifications`+`notification_settings`·`workout_events` + RLS(§14: 타인용 알림은 service_role만… MVP는 definer RPC로 대체 검토)
2. **그룹 피드**: 크루 공개 completed 최신순 — 인증사진(signed URL)·요약(볼륨·시간)·현재 스트릭·반응
3. **이모지 반응** fire/clap/like: 추가·취소·중복방지·낙관적 UI
4. **운동 시작 알림 + 진행 중 카드**: start_workout RPC에 workout_events·크루 알림 추가(0004 RPC 수정 마이그레이션), 피드/홈 진행 중 카드
5. **응원(cheer, Realtime)**: active 세션에 응원 → Realtime 인앱 배너. 스팸 제한(세션당 3회·10초 쿨다운·본인 금지)
6. **찌르기**: 오늘 미운동 크루원 찌르기 → 알림
7. 알림함(🔔+뱃지) + 등수변동 알림(Phase 5 이월분)
8. 검증: RLS(스팸·크루 경계) + E2E(2인: A 시작→B 응원→A 완료→B 피드 반응) + lint·typecheck·build

**실기기 스모크 (아직 안 한 것)**: 폰에서 사진 인증 → 달력 🔥/● 확인, 챌린지 2인 흐름(폰+PC로 KPI 게이트·진행중 잠금 확인)
