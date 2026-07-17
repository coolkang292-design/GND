# GND 진행 기록 (새 세션 시작용)

> 새 세션은 이 파일 + `C:\Users\SAMSUNG\Desktop\Workout app\IMPLEMENTATION_PLAN.md`(단일 진실)만 읽으면 바로 이어서 작업할 수 있다.
> 시각 스펙: 같은 폴더의 `phase0-mockup.html`.

## 현재 상태 (2026-07-16 기준)

**Phase 0~5 완료 (2026-07-17). 다음 작업 = Phase 6 (소셜: 피드·반응·응원·찌르기·알림).**

| Phase | 상태 | 비고 |
|---|---|---|
| 0 목업 | ✅ | phase0-mockup.html |
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
- 검증: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`
- Supabase: 프로젝트 `cjdskubyxlnojwzhwbfx`, 익명 인증 ON, 키는 `.env.local`(커밋 안 됨)
- RLS 검증: `node scripts/rls-test.mjs` (익명 2인 픽스처 40케이스, 저장소 루트에서 실행)

## DB 마이그레이션 절차 (중요)

CLI/DB 비밀번호 없음 → **사용자가 SQL Editor에 수동 붙여넣기**로 적용한다.
`supabase/migrations/` 번호 순서대로. **0001~0006 적용 완료됨** (재실행 금지).
새 마이그레이션 만들면 사용자에게 "파일 열기 → 전체 복사 → SQL Editor → Run"으로 안내.
Storage 버킷도 SQL로 생성 가능했음(`insert into storage.buckets`, 0005) — Dashboard 수동 생성 불필요.

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

## 다음 세션 할 일 = Phase 6 (소셜, 계획서 §9·§18)

1. 마이그레이션 0007: `reactions`(unique(session,user,type))·`cheers`(sender≠receiver, 크루 active 세션만)·`notifications`+`notification_settings`·`workout_events` + RLS(§14: 타인용 알림은 service_role만… MVP는 definer RPC로 대체 검토)
2. **그룹 피드**: 크루 공개 completed 최신순 — 인증사진(signed URL)·요약(볼륨·시간)·현재 스트릭·반응
3. **이모지 반응** fire/clap/like: 추가·취소·중복방지·낙관적 UI
4. **운동 시작 알림 + 진행 중 카드**: start_workout RPC에 workout_events·크루 알림 추가(0004 RPC 수정 마이그레이션), 피드/홈 진행 중 카드
5. **응원(cheer, Realtime)**: active 세션에 응원 → Realtime 인앱 배너. 스팸 제한(세션당 3회·10초 쿨다운·본인 금지)
6. **찌르기**: 오늘 미운동 크루원 찌르기 → 알림
7. 알림함(🔔+뱃지) + 등수변동 알림(Phase 5 이월분)
8. 검증: RLS(스팸·크루 경계) + E2E(2인: A 시작→B 응원→A 완료→B 피드 반응) + lint·typecheck·build

**실기기 스모크 (아직 안 한 것)**: 폰에서 사진 인증 → 달력 🔥/● 확인, 챌린지 2인 흐름(폰+PC로 KPI 게이트·진행중 잠금 확인)
