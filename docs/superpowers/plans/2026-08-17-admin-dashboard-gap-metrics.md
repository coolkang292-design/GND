# 관리자 대시보드 공백 지표 채우기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin`이 **신규 기능의 효과를 못 보고 있다.** 프로그램·운동 제안·개인화 알림·열람권·초대가 전부 출시됐는데 대시보드에는 패널이 없다. 데이터는 이미 DB에 쌓이고 있으므로 **집계 패널만 붙인다.**

**Architecture:** 기존 `/admin`의 규약을 그대로 따른다 — **조회는 `lib/admin/queries.ts`, 계산은 `lib/domain/analytics*.ts` 순수 함수, 표시는 `_components/*.tsx`.** 새 계산은 도메인 두 파일로 나눈다(`analytics-program.ts` · `analytics-engagement.ts`). 화면 컴포넌트는 기존 `.panel` / `.funnel` / `.summary` / `.rings` CSS를 재사용하고 **새 CSS를 만들지 않는다.**

**Tech Stack:** Next.js 16 App Router (서버 컴포넌트) · TypeScript strict · Vitest + `renderToStaticMarkup` · Supabase service_role · 새 마이그레이션 **0건**

**근거 문서:** `docs/GND-기능-전량-정리.md` §5.3 「측정 공백」

---

## 🟢 현재 저장소 상태 (2026-08-17 08:21 실측)

**전체 테스트 green: 147 파일 / 2,182건 통과.** 이 상태에서 이어받으면 된다.

### 이미 끝난 것 — Task 1은 **작업 완료**다 (아래 체크박스 참조)

| 파일 | 상태 |
|---|---|
| `src/lib/domain/analytics-program.ts` | **신규 작성 완료** |
| `src/lib/domain/analytics-program.test.ts` | **신규 작성 완료 · 8건 통과** |
| `src/lib/domain/program-schedule.ts` | **수정 완료** — `PROGRAM_TOTAL_SESSIONS = 18` export + 배치 루프가 그 상수를 쓰게 함 |

⚠️ **셋 다 미커밋이다.** Task 0에서 브랜치를 판 뒤 이 세 파일을 첫 커밋에 담아라.

### 작업 트리 주의

`git status`에 **무관한 미커밋 변경이 다수** 있다(`.gitignore`, `docs/GND-*.md`, 이미지 폴더 등).
**`git add -A`를 쓰지 마라.** 경로를 명시해서 담는다.

---

## 착수 전 실측 (2026-08-17 확인 완료 — 다시 조사하지 마라)

### 운영 DB에 실제로 쌓인 데이터 (읽기 전용 조회로 확인)

| 테이블 | 행 수 | 내용 |
|---|---|---|
| `program_enrollments` | **17** | `active` 2 · `cancelled` 15 · `completed` **0** |
| ↳ 프로그램별 | | `shoulder-frame-6w` 8 · `interval-burn-6w` 7 · `chest-frame-6w` 2 |
| `workout_sessions` (program 컬럼 있는 행) | **3** | 전부 `completed_at` null |
| `notifications` | **537** | 아래 유형 분포 참조 |
| ↳ `morning_briefing` | 103 | 읽음 **73** |
| ↳ `workout_suggestion` | 3 | 읽음 **0** |
| ↳ `challenge_peek_unlocked` | 3 | |
| `record_views` | **0** | ⚠️ **꾸준왕 열람권을 아무도 쓴 적이 없다** |
| `challenge_peek_picks` | **2** | |
| `crew_links` | 7 | |
| `profiles` | 7 | 전원 `invite_code` 보유 |
| `workout_sessions` 전체 | 120 | `completed` 109 · `cancelled` 11 |

> **화면 확인 때 이 숫자를 기대값으로 써라.** 특히 `record_views` 0행은 버그가 아니라 사실이다 — 패널이 "0회 사용"을 정확히 그리는지가 검증 포인트다.

### 컬럼명 (틀리면 `/admin`이 500이 된다)

```
program_enrollments(id, user_id, program_key, program_version, title_snapshot,
                    level_at_start, start_date, timezone, preferred_slots,
                    status, completed_at, cancelled_at, created_at, updated_at)
  status check: 'active' | 'completed' | 'cancelled'

workout_sessions(... , program_enrollment_id, program_week, program_session,
                 program_template_version)          ← 0067에서 추가

notifications(id, user_id, actor_id, type, reference_id, title, body,
              read_at, created_at, dedupe_key, pushed_at)

record_views(id, viewer_id, target_id, challenge_id, viewed_at)

challenge_peek_picks(viewer_id, challenge_id, pick_date, target_id, created_at)

crew_links(user_a, user_b, created_at)             ← user_a < user_b 강제

crew_requests(id, requester_id, addressee_id, status, created_at, responded_at)
  ⚠️ target_id가 **아니다** — `addressee_id`다. 내가 실제로 이걸로 한 번 틀렸다.
```

### 저장소 규약 (전부 확인함)

| 항목 | 사실 |
|---|---|
| `pnpm lint` | `eslint` — `next lint`가 **아니다** |
| `pnpm typecheck` / `test` / `build` | `tsc --noEmit` / `vitest run` / `next build` |
| `/admin` 게이트 | `requireAdmin()` — **이 줄 위에 어떤 조회도 두지 마라** (`page.tsx:39`) |
| 캐시 | `layout.tsx`가 `dynamic='force-dynamic'`, `revalidate=0` |
| 조회 클라이언트 | `getSupabaseAdminClient()` (service_role, `server-only`) |
| 비율 표시 | **`formatRatio(Ratio)`를 반드시 쓴다** — 모수 0 → `—`, 모수 5 미만 → `2/4`, 그 외 `30% (3/10)` |
| `MIN_RATIO_SAMPLE` | 5 (`analytics.ts:29`) |
| 패널 테스트 | `renderToStaticMarkup`으로 SSR 문자열 단언 (`_components/panels.test.tsx`) |
| 새 CSS | **만들지 마라.** `admin.css` 97줄이 전부다 — 아래 클래스만 쓴다 |

### 재사용할 CSS 클래스 (`src/app/admin/admin.css`)

```
.panel .panel-title .kicker .muted        ← 패널 껍데기
.funnel .frow .track .loss                ← 가로 막대 목록 (라벨 130px + 바 + 우측 36px)
.summary (4칸 그리드) .summary small/b/.gold
.rings .ring (--p: deg)                   ← 도넛
.insight .insight b                        ← 하단 설명 상자
.grid / .grid.equal                        ← 2단 배치
.card .card-head .card-foot .up .sub       ← KPI 카드
```

---

## File Structure

| 파일 | 무엇을 맡나 | 신규/수정 |
|---|---|---|
| `src/lib/domain/program-schedule.ts` | `PROGRAM_TOTAL_SESSIONS` export | ✅ **수정 완료** |
| `src/lib/domain/analytics-program.ts` | 프로그램 등록·완주·이탈 집계 | ✅ **신규 완료** |
| `src/lib/domain/analytics-program.test.ts` | 위의 단위 테스트 8건 | ✅ **신규 완료** |
| `src/lib/domain/analytics-engagement.ts` | 알림 전환 · 시각 슬롯 · 열람권 · 확산 | 신규 |
| `src/lib/domain/analytics-engagement.test.ts` | 위의 단위 테스트 | 신규 |
| `src/lib/admin/queries.ts` | `fetchProgramDataset()` · `fetchEngagementDataset()` | 수정 |
| `src/app/admin/_components/program-panel.tsx` | 프로그램 패널 | 신규 |
| `src/app/admin/_components/notification-panel.tsx` | 알림 → 행동 전환 패널 | 신규 |
| `src/app/admin/_components/engagement-panel.tsx` | 열람권 + 확산 패널 | 신규 |
| `src/app/admin/_components/panels.test.tsx` | 새 패널 3종 렌더 회귀선 | 수정 |
| `src/app/admin/page.tsx` | 조회·계산 배선 + 사이드바 nav 2줄 | 수정 |
| `scripts/admin-dashboard-check.mjs` | 새 테이블·컬럼 실 DB 검증 | 수정 |
| `PROGRESS.md` · `docs/GND-기능-전량-정리.md` | 기록 갱신 | 수정 |

**마이그레이션 0건.** 전부 이미 있는 테이블을 읽기만 한다.

---

## ⚠️ 이 계획에서 가장 조용히 틀리는 곳 셋

### ① 프로그램에 기간 필터를 적용하면 완주가 영원히 0이다

6주짜리를 7일 창으로 자르면 완주가 0일 수밖에 없다 — 그 0은 "아무도 못 끝냈다"가 아니라 **"볼 수 없는 창으로 봤다"**는 뜻이다.

→ **상태·완주율·퍼널은 누적**, 기간 지표는 `newEnrollmentsInPeriod` **하나뿐.**
`analytics-program.ts`가 이미 이 규칙으로 짜여 있고 테스트가 고정한다. 패널에도 이 사실을 `.insight`로 적어라.

### ② "알림 → 운동"은 인과가 아니라 상관이다

알림을 받은 날 그 사람이 운동했다는 것이지, **알림 때문에 했다는 증거가 아니다.**
클릭 추적 계측이 저장소에 **없다**(`read_at`은 알림함에서 열어 봤다는 뜻이지 푸시를 눌렀다는 뜻이 아니다).

→ 패널 문구를 `전환율`이 아니라 **`받은 날 운동 완료`**로 쓴다. `.insight`에 한계를 명시한다.
→ 라벨을 "클릭률"로 바꾸지 마라. 그 순간 없는 계측을 있다고 말하는 화면이 된다.

### ③ 바이럴 계수는 **지금 데이터로 계산할 수 없다**

`crew_links(user_a, user_b, created_at)`에 **출처 컬럼이 없다.** 검색으로 맺었는지, 초대 링크로 왔는지, 챌린지 신입 자동 연결인지 구분이 안 된다. `profiles.invite_code`는 발급만 기록한다.

→ **가짜 숫자를 만들지 마라.** 패널에는 셀 수 있는 것만 낸다:
- 크루 연결 수 · 크루 보유율 · 1인 평균 크루 수 · 초대 코드 발급률
- 그리고 **"출처 미기록 — 바이럴 계수는 계측 추가 필요"**를 `.insight`에 명시

→ 계측을 붙이려면 `crew_links`에 `origin text` 컬럼(`search|invite_link|challenge`)을 더하고 3개 RPC(`accept_crew_request`·`accept_friend_invite`·`accept_challenge_invite`)가 채우게 해야 한다. **이번 범위 밖이다.** 별도 스프린트로 남긴다.

---

### Task 0: 작업 브랜치를 판다

**Files:** 없음

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout -b feat/admin-gap-metrics
```

- [ ] **Step 2: 이미 작성된 3파일을 첫 커밋에 담는다**

```bash
git add src/lib/domain/analytics-program.ts src/lib/domain/analytics-program.test.ts src/lib/domain/program-schedule.ts
git commit
```

커밋 메시지: `feat(admin): 프로그램 등록·완주·이탈 집계 순수 함수`
본문에 `PROGRAM_TOTAL_SESSIONS`를 상수로 뺀 이유(화면과 배치 루프가 같은 18을 써야 한다)를 적는다.

---

### Task 1: 프로그램 집계 순수 함수 — ✅ **완료됨**

**Files:** `src/lib/domain/analytics-program.ts` · `.test.ts` · `program-schedule.ts`

- [x] `PROGRAM_TOTAL_SESSIONS = 18`을 `program-schedule.ts`에서 export하고 배치 루프가 쓰게 한다
- [x] `buildProgramMetrics(enrollments, programSessions, activeUsers, period)` 구현
- [x] 테스트 8건 — 빈 입력 / 상태별 개수 / 등록률 모수 / 퍼널 / 미완료 회차 제외 / 이탈 평균 / 기간 분리 / 프로그램별 정렬

**산출된 지표:** `enrollments` `enrolledUsers` `newEnrollmentsInPeriod` `adoption` `active` `completed` `cancelled` `completionRate` `funnel(4단계)` `avgSessionsAtDropout` `dropoutBeforeFirstSession` `byProgram`

**검증:** `npx vitest run src/lib/domain/analytics-program.test.ts` → 8건 통과 (실행 확인함)

---

### Task 2: 참여 집계 순수 함수 (알림 · 열람권 · 확산)

**Files:** `src/lib/domain/analytics-engagement.ts` (신규) · `analytics-engagement.test.ts` (신규)

**⚠️ 테스트를 먼저 쓴다.** 실패를 확인한 뒤 구현한다.

- [ ] **Step 1: 알림 → 행동 전환**

```ts
export interface EngagementNotificationRow {
  userId: string;
  type: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationConversion {
  type: string;
  label: string;       // "운동 제안" · "아침 브리핑"
  sent: number;
  opened: Ratio;       // read_at 있음 / 발송
  workedOutSameDay: Ratio;  // 받은 날 완료 / 발송  ← 인과 아님
}

export function notificationConversion(
  rows: EngagementNotificationRow[],
  workoutDayKeysByUser: ReadonlyMap<string, ReadonlySet<string>>,
  period: Period,
  timeZone: string,
): NotificationConversion[]
```

**단언할 것:**
- 기간 밖 알림은 안 센다 (`createdAt`이 `period.from~to`)
- `readAt`이 null이면 `opened.numerator`에 안 들어간다
- 같은 사용자가 같은 날 여러 알림을 받으면 **발송은 여러 건, 운동일 판정은 같은 날**
- 운동 기록이 없는 사용자는 `workedOutSameDay`에 안 들어간다
- 대상 유형 목록에 없는 알림은 결과에 없다

- [ ] **Step 2: 브리핑 시각 슬롯 분해**

```ts
export interface BriefingSlot {
  minuteOfDay: number;      // 30분 단위 슬롯 시작
  label: string;            // "06:30"
  sent: number;
  workedOutSameDay: Ratio;
  isFallbackSlot: boolean;  // 09:00 = 추정 실패 폴백
}

export function briefingSlotBreakdown(...): BriefingSlot[]
```

- `minuteOfDay(instant, timeZone)`는 `domain/time.ts`에 **이미 있다** — 새로 만들지 마라
- 슬롯 크기는 `SLOT_MINUTES`(=30)를 `domain/notify-time.ts`에서 **import한다.** 30을 여기 다시 적지 마라
- 폴백 판정은 `DEFAULT_BRIEF_MINUTE`(=540) 상수와 대조한다 (같은 파일)
- ⚠️ **09:00 슬롯이 전부 폴백은 아니다.** 실제로 09:00가 평소 운동 시각인 사람도 그 슬롯에 있다. 라벨을 "폴백"이라 단정하지 말고 **"09:00 (폴백 포함)"**으로 쓴다

**단언할 것:** 슬롯이 시각 오름차순 / 빈 슬롯은 결과에 없다 / KST 기준(UTC 아님)

- [ ] **Step 3: 열람권 사용률**

```ts
export interface ViewingPassMetrics {
  kingEligibleWeeks: number;   // 주5일을 채운 (사용자, 주) 쌍
  kingUsed: number;            // record_views 행 수
  kingUsage: Ratio;
  challengeUnlocked: number;   // challenge_peek_unlocked 알림 수
  challengePicked: number;     // challenge_peek_picks 행 수
  challengeUsage: Ratio;
}
```

- 꾸준왕 자격은 완료 세션의 `dayKey`를 주 단위로 묶어 **5일 이상인 주**를 센다. `KING_DAYS`를 `domain/viewing-pass.ts`에서 import한다 (5를 다시 적지 마라)
- 주 경계는 `weekStart(instant, timeZone)` (`domain/time.ts`, 월요일 시작)
- 챌린지 쪽은 **알림 수를 분모로 쓴다** — `challenge_peek_unlocked` 알림이 곧 "창이 열렸다"이므로 자격 판정을 다시 구현할 필요가 없다

**단언할 것:** 같은 사용자의 같은 주는 1로 센다 / 5일 미만 주는 안 센다 / 사용 0건에서 `kingUsage`가 `0/N`으로 나온다 (0으로 나누지 않는다)

- [ ] **Step 4: 확산 지표 (한계 포함)**

```ts
export interface ReferralMetrics {
  crewLinks: number;
  usersWithCrew: Ratio;      // 크루 보유자 / 전체 프로필
  avgCrewPerUser: number;    // 소수 1자리
  inviteCodeIssued: Ratio;   // 코드 보유 / 전체 프로필
}

/** 출처 컬럼이 없어 바이럴 계수는 계산할 수 없다. 화면이 이 상수로 안내한다. */
export const REFERRAL_ATTRIBUTION_AVAILABLE = false;
```

**단언할 것:** `crew_links` 한 행이 두 사람을 크루 보유자로 만든다 / 프로필 0명에서 모수 0

- [ ] **Step 5: 테스트 실행**

```bash
npx vitest run src/lib/domain/analytics-engagement.test.ts
```

---

### Task 3: 조회 함수

**Files:** `src/lib/admin/queries.ts` (수정)

- [ ] **Step 1: `fetchProgramDataset()`**

```ts
export interface ProgramDataset {
  enrollments: ProgramEnrollmentRow[];
  programSessions: ProgramSessionRow[];
}
```

- `program_enrollments`: `id,user_id,program_key,title_snapshot,status,created_at,completed_at,cancelled_at`
- `workout_sessions`: `program_enrollment_id,completed_at` — `.not("program_enrollment_id","is",null)` + `.is("deleted_at", null)`
- `endedAt = completed_at ?? cancelled_at`
- ⚠️ 기존 함수들과 같은 방식으로 **에러를 던진다** (`throw new Error(\`${name} 조회 실패: ...\`)`). 조용히 빈 배열로 떨어뜨리면 화면이 "0건"으로 거짓말한다

- [ ] **Step 2: `fetchEngagementDataset()`**

```ts
export interface EngagementDataset {
  notifications: EngagementNotificationRow[];
  recordViewCount: number;
  challengePickCount: number;
  crewLinkPairs: { userA: string; userB: string }[];
  inviteCodeCount: number;
}
```

- `notifications`: `user_id,type,created_at,read_at` — **유형을 서버에서 좁힌다** (`.in("type", [...])`) 로 537행 전부를 끌어오지 않는다
- `record_views`: `head:true` 개수 질의로 충분
- `challenge_peek_picks`: 같은 방식
- `crew_links`: `user_a,user_b`
- `profiles`: `invite_code` 개수는 이미 `fetchAdminDataset`이 `profiles`를 읽으므로 **거기에 컬럼 하나를 더하는 편**이 질의 하나를 아낀다. 판단은 구현자 몫이되, 두 번 읽지는 마라

- [ ] **Step 3: 운동일 맵**

`notificationConversion`이 요구하는 `Map<userId, Set<dayKey>>`는 **이미 있는 `data.sessions`에서 만든다.** 새 질의를 하지 마라 — `fetchAdminDataset()`이 완료 세션을 전부 갖고 있다.

`page.tsx`에서 조립하거나, 순수 함수 `workoutDayKeysByUser(sessions, timeZone)`를 `analytics-engagement.ts`에 두고 테스트한다. **후자를 권한다** (테스트 가능).

---

### Task 4: 프로그램 패널

**Files:** `src/app/admin/_components/program-panel.tsx` (신규)

- [ ] **Step 1: 구현**

구성 (모두 기존 CSS):
- `.panel-title` — kicker `PROGRAM` / h2 `공식 프로그램 등록·완주` / `.muted`에 `기간 내 신규 N건`
- `.funnel` — 등록 → 1회차 완료 → 절반(9회) → 완주(18회), `.loss`에 단계별 감소율
- `.summary` 4칸 — `등록자` / `등록률` / `완주율` / `평균 이탈 회차`
- 프로그램별 목록 — `.funnel` 재사용, 라벨은 `title`, 우측 `N건`
- `.insight` — **①의 기간 규칙**을 적는다: *"6주 프로그램이라 상태·완주율은 누적입니다. 기간 필터는 신규 등록에만 적용됩니다."*

- [ ] **Step 2: 비율은 반드시 `formatRatio`로**

`completionRate`가 `1/3`처럼 모수 5 미만이면 퍼센트를 쓰지 않는다. 직접 `Math.round(a/b*100)`을 쓰지 마라.

- [ ] **Step 3: 빈 상태**

등록 0건이면 `.insight`에 `아직 프로그램 등록이 없습니다.` — 퍼널을 0으로 그리지 않는다.

---

### Task 5: 알림 → 행동 패널

**Files:** `src/app/admin/_components/notification-panel.tsx` (신규)

- [ ] **Step 1: 상단 — 유형별 전환**

`.funnel` 3줄 × 유형 2종(운동 제안 · 아침 브리핑):
`발송 N` → `열람 formatRatio` → `받은 날 운동 formatRatio`

- [ ] **Step 2: 하단 — 시각 슬롯**

`.funnel`로 슬롯별 `발송 N · 운동 formatRatio`. 09:00 슬롯에는 `.muted`로 `폴백 포함` 표시.

- [ ] **Step 3: `.insight`에 ②의 한계를 적는다**

> *"'받은 날 운동'은 알림을 받은 날 그 사용자가 운동을 완료했다는 뜻입니다. 알림이 원인이라는 증거는 아닙니다 — 앱이 푸시 클릭을 수집하지 않습니다. '열람'은 알림함에서 열어 본 것입니다."*

⚠️ **`전환율`·`클릭률`이라는 단어를 쓰지 마라.**

---

### Task 6: 열람권 · 확산 패널

**Files:** `src/app/admin/_components/engagement-panel.tsx` (신규)

`<section className="grid equal">` 안에 `.panel` 두 개를 넣는다 (`growth-panel.tsx`와 같은 꼴).

- [ ] **Step 1: 열람권 패널**

- `.rings` 2개 — `꾸준왕` / `챌린지`
- `.summary` 4칸 — `자격 획득 주` / `열람 사용` / `창 열림` / `참가자 선택`
- `.insight` — *"꾸준왕 열람권은 주 5일을 채운 주 기준입니다. 획득했지만 쓰지 않은 것은 소멸합니다."*
- ⚠️ 현재 실데이터가 **`record_views` 0행**이다. `.ring`이 `--p: 0deg`로 그려지고 라벨이 `0/N`이 나오는지 화면에서 직접 확인하라 — 이게 이 패널의 핵심 검증이다

- [ ] **Step 2: 확산 패널**

- `.summary` 4칸 — `크루 연결` / `크루 보유율` / `1인 평균` / `초대코드 발급`
- `.insight`에 ③의 한계를 **눈에 띄게** 적는다:

> *"**초대 출처가 기록되지 않아 바이럴 계수는 측정할 수 없습니다.** 검색·초대 링크·챌린지 자동 연결이 `crew_links`에 같은 모양으로 저장됩니다. 측정하려면 출처 컬럼과 RPC 3곳의 기록이 필요합니다."*

---

### Task 7: 페이지 배선

**Files:** `src/app/admin/page.tsx` (수정)

- [ ] **Step 1: 조회 추가**

기존 `Promise.all([fetchActiveChallenges, fetchGrowthDataset])`에 두 개를 **같이 넣는다.** 순차 `await`를 붙이면 페이지가 느려진다.

⚠️ **`requireAdmin()` 아래에 둔다.**

- [ ] **Step 2: 계산 호출** — `buildProgramMetrics` · `notificationConversion` · `briefingSlotBreakdown` · `viewingPassMetrics` · `referralMetrics`

`activeUsers` 인자는 **이미 계산된 `kpi.activeUsers`를 그대로 넘긴다.** 다시 세지 마라 — 두 숫자가 갈리면 "등록률의 모수가 화면 위쪽 활성 사용자와 다른" 상태가 된다.

- [ ] **Step 3: 배치**

```
KpiCards
[ActivityChart | RetentionPanel]
[FunnelPanel | ChallengePanel]
<ProgramPanel />              ← 신규 (id="programs")
<NotificationPanel />         ← 신규 (id="notify")
UserTable
GrowthPanel
<EngagementPanel />           ← 신규 (grid equal 2단)
```

- [ ] **Step 4: 사이드바 nav 2줄 추가**

```tsx
<a href="#programs"><i>▤</i>프로그램</a>
<a href="#notify"><i>◈</i>알림·참여</a>
```

⚠️ `.sidebar nav a`의 `i`는 **글리프 문자**다 (`▦ ♙ ↗ ♛ ✦`). 이미지·이모지를 넣지 마라 — 폰트가 달라 정렬이 깨진다.

---

### Task 8: 패널 렌더 회귀선

**Files:** `src/app/admin/_components/panels.test.tsx` (수정)

- [ ] 새 패널 3종에 대해 기존 패턴대로 `renderToStaticMarkup` 단언
- [ ] **빈 데이터에서 렌더된다** (전 패널 공통)
- [ ] **`NaN`·`Infinity`·`undefined`가 출력에 없다** — 기존 KpiCards 테스트가 쓰는 단언을 그대로 가져온다
- [ ] 모수 5 미만에서 `%`가 안 나온다
- [ ] 확산 패널이 **측정 한계 문구를 포함한다** ← 이 단언을 지우지 마라. 문구가 사라지면 화면이 없는 계측을 있다고 말하게 된다

---

### Task 9: 실 DB 검증 스크립트 확장

**Files:** `scripts/admin-dashboard-check.mjs` (수정)

단위 테스트가 못 잡는 것 하나를 잡는다: **queries.ts가 미는 테이블·컬럼명이 실제 스키마와 맞는가.** 하나라도 틀리면 `/admin`이 500이다.

- [ ] `program_enrollments`의 8개 컬럼 조회
- [ ] `workout_sessions`의 `program_enrollment_id` 조회
- [ ] `notifications`의 `type,created_at,read_at` 조회
- [ ] `record_views` · `challenge_peek_picks` · `crew_links` 조회
- [ ] **읽기 전용 유지.** 쓰기·삭제 0건

```bash
node scripts/admin-dashboard-check.mjs
```

기존 15건 + 신규 → **전부 ✅여야 한다.**

---

### Task 10: 게이트 + 화면 확인 ⚠️ 건너뛰지 마라

- [ ] **Step 1: 자동 게이트**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

기준: lint 0 · typecheck 0 · **테스트 2,182건 + 신규분 전부 통과** · build 성공

- [ ] **Step 2: 개발 서버에서 `/admin`을 직접 연다**

```bash
pnpm dev
```

⚠️ **`/admin`은 `requireAdmin()` 게이트가 있다.** 관리자 계정으로 로그인해야 보인다.
`node scripts/admin-whoami.mjs`로 누가 관리자인지 확인한다.

**눈으로 셀 것 (기대값은 위 실측표):**

| 확인 | 기대 |
|---|---|
| 프로그램 퍼널 `등록` | **17** |
| 프로그램 상태 | 진행 2 · 완주 0 · 포기 15 |
| 프로그램별 | 어깨 8 · 인터벌 7 · 가슴 2 |
| 완주율 | 모수 15 → 퍼센트 표시 (`0% (0/15)`) |
| 아침 브리핑 발송 | **103**, 열람 **73** |
| 운동 제안 발송 | **3**, 열람 **0** → 모수 5 미만이라 **퍼센트가 없어야 한다** |
| 꾸준왕 열람권 사용 | **0** — 링이 비어 있고 `NaN`이 없다 |
| 챌린지 창 열림 3 / 선택 2 | |
| 크루 연결 | **7** |
| 확산 패널 | **측정 한계 문구가 보인다** |
| 전 화면 | `NaN` · `Infinity` · `undefined` · `[object Object]` **0건** |

- [ ] **Step 3: 기간 전환** — 7/28/90일을 눌러 프로그램 패널의 **누적 숫자가 안 바뀌고** `신규 등록`만 바뀌는지 본다 (①의 규칙)

---

### Task 11: 문서 갱신

**Files:** `PROGRESS.md` · `docs/GND-기능-전량-정리.md`

- [ ] `PROGRESS.md` 최상단에 항목 추가 — 실측 숫자·미검증 항목 포함
- [ ] `docs/GND-기능-전량-정리.md` **§2.16 관리자 대시보드** 표에 새 패널 3종 추가
- [ ] 같은 문서 **§5.3 측정 공백**을 갱신한다 — 5개 중 4개가 해소되고 **바이럴 계수만 남는다.** ⚠️ 절을 통째로 지우지 마라. 남은 하나와 그 이유(출처 컬럼 부재)를 명시한다

---

## 완료 기준

- [ ] `pnpm lint` 0 · `typecheck` 0 · `test` 전건 통과 · `build` 성공
- [ ] `node scripts/admin-dashboard-check.mjs` 전건 ✅
- [ ] 개발 서버 `/admin`에서 Task 10 Step 2의 표를 **눈으로 대조 완료**
- [ ] 마이그레이션 0건 확인 (`git status`에 `supabase/migrations/` 신규 파일 없음)
- [ ] 사용자 배포 승인 → `main` 반영 → Vercel CLI 배포 → 프로덕션 실물 확인

## 배포 (사용자 승인 뒤)

```bash
git worktree add --detach /tmp/deploy-main main
cp .env.local /tmp/deploy-main/ && cp -r .vercel /tmp/deploy-main/
cd /tmp/deploy-main && npm install && npm run build
npx vercel@latest --prod --yes --scope gnd4
```

⚠️ **`--scope gnd4`가 없으면 `Not authorized`로 막힌다.** `whoami`는 통과하는데 배포만 실패해서 인증 문제로 오해하기 쉽다 — 프로젝트가 팀 소속이다.

⚠️ `/admin`은 **서버 렌더 + `force-dynamic`**이다. 프로덕션 실물 확인을 JS 번들 grep으로 하지 마라 — 패널 문구가 번들이 아니라 HTML에 있다. **관리자로 로그인해 화면을 열어야 한다.**

---

## 범위 밖 (다음 스프린트 후보)

| 항목 | 왜 뺐나 |
|---|---|
| **초대 출처 계측** (`crew_links.origin` + RPC 3곳) | 마이그레이션과 RPC 변경이 필요하다. 이 계획은 **읽기 전용 · 마이그레이션 0건**을 지킨다 |
| 푸시 클릭 계측 | 서비스워커·알림 테이블 변경 필요 |
| 프로그램 회차별 이탈 히트맵 | 현재 `workout_sessions`의 program 행이 3건뿐이라 그릴 데이터가 없다 |
| 대시보드 CSV 내보내기 확장 | 기존 `UserTable`의 CSV에 새 지표를 넣는 건 별건 |
