# 계획 없는 날 운동 제안 — 알림에서 원탭 시작까지 (설계)

작성 2026-08-16 · 사용자 지시 대화 기준

**한 줄:** 오늘 계획도 없고 운동도 안 한 사람에게, 각자의 알림 시각에 "무엇을 할지"를
정해서 보내고, 그 알림을 누르면 기록 탭에 **이미 담긴 채로** 열려 `운동 시작` 한 번만
누르면 되게 한다.

---

## 0. 왜 이 작업인가

「처음 운동해요」의 첫 칸을 걷기로 바꾸는 작업(2026-08-14)까지 했지만, **그 목록에
도달하는 경로가 검색 화면 뒤에 숨어 있다.** 계획 없는 날 기록 탭을 열면
`RecordEmptyState`의 버튼 세 개뿐이고, 걷기까지 5~6번을 눌러야 한다.

`docs/superpowers/plans/archive/2026-08-14-friction-copy-and-beginner-recommendations.md:11`이
이것을 **C2(계획 빈 날 유산소 제안)·C3(챌린지 참가자에게 지난 운동 제안)** 으로 적어
두고 다음 배치로 미뤘다. 같은 줄의 A2(시작 전 리마인드)는 그날 2차 배포로 나갔고,
C2·C3만 남았다. 이 설계가 그 둘을 한 번에 처리한다.

## 1. 사용자가 정한 것 (이 설계의 전제)

| 항목 | 결정 |
|---|---|
| 신규 유저 대상 | **가입 후 7일 이내에만** 보낸다. 그 뒤로 기록이 없으면 조용해진다 |
| 신규에게 무엇을 | 가벼운 **걷기** |
| 이력 있는 유저에게 | **지난 운동이 주 제안, 4분 인터벌이 보조** — 둘 다 낸다 |
| 메시지 | "오래 하는 게 중요한 게 아니라 **하루라도 빼먹지 않는 게 중요**하다" |
| 담는 자리 | **DB에 계획을 심지 않는다.** 알림 링크 + 화면 카드로만 |
| 달력 | 제안은 달력에 **안 남는다.** 자정이 지나면 사라진다 |
| 알림 | **기존 아침 브리핑을 바꿔 낀다** — 하루 한 통 그대로 |
| 시작 | 자동 시작하지 않는다. 담아만 두고 `운동 시작`은 사람이 누른다 |

## 2. 실측 — 이 설계가 딛고 선 사실

착수 전에 **전부 열어서 확인했다.** 추측이 하나도 안 남게 한다.

| 전제 | 실측 결과 |
|---|---|
| 신규 유저는 지금 알림을 받나 | ❌ **못 받는다.** `briefing.ts:96`이 `completedAts.length === 0`이면 `no_history`로 스킵 |
| 알림 시각 개인화 조건 | 최근 60일 **5회 이상**. 미만이면 `null` → `DEFAULT_BRIEF_MINUTE`(09:00) (`notify-time.ts:21`) |
| 크론 주기 | **30분마다.** `SLOT_MINUTES`와 한 벌 (`notify-time.ts:12`) |
| `notifications`에 URL 컬럼 | ❌ **없다.** 목적지는 `type`으로만 정해진다 (`push.ts:8`) |
| `morning_briefing`의 현재 목적지 | `PUSH_URL_BY_TYPE`에 없어서 `DEFAULT_PUSH_URL`(`/home`)로 떨어진다 |
| `notifications.type` | **CHECK 허용목록.** 새 유형은 마이그레이션 필요 (`0077:20`) |
| `TYPE_ICON` | **exhaustive**(`Record<NotificationRow["type"], string>`) — 유형을 늘리면 타입 오류로 막힌다 (`notification-bell.tsx:16`) |
| `PUSH_URL_BY_TYPE` | **exhaustive가 아니다**(`Record<string,string>`) — 손으로 챙겨야 한다 |
| `profiles.created_at` | ✅ 있다 (`0001_identity_crew.sql:15`) |
| `workout_sessions.tabata_minutes` | ✅ 있다 (`0019_tabata.sql:8`), `check in (4,8,16)` |
| `workout_plans` 유니크 | `(user_id, plan_date)` — 계획을 심으면 달력에 `예정`이 찍힌다 |
| `WorkoutDraft`에 날짜 필드 | ❌ **없다** (`workout.ts:81`). localStorage에 무기한 남는다 |
| 쿼리스트링 규약 | ⚠️ **두 번 거부됨** — `record-view.ts:8`, `auth/callback/page.tsx:50`. 이유는 `useSearchParams`의 Suspense 경계 |
| 화면이 챌린지를 아나 | ✅ 이미 조회 중 (`record/page.tsx:657` — `getMyChallenges` → `status === "active"`) |
| 화면이 이력을 아나 | ✅ `hasHistory` 1비트로 갖고 있다 (`record/page.tsx:350`) |
| 화면이 완료 **수**를 아나 | ❌ 모른다 — §3의 설계 제약이 여기서 나온다 |

## 3. 아키텍처 — 순수 함수 한 벌을 서버와 화면이 **같이 import**한다

`viewing-pass.ts`가 화면 규칙과 서버 규칙으로 갈려서 `peek-reset-check.mjs`라는 감시
스크립트를 낳았다. 여기는 **양쪽 다 TypeScript**라 애초에 한 벌로 둘 수 있다.

```
src/lib/domain/workout-suggestion.ts   ← 분기와 문구가 전부 여기
        ↑                    ↑
  api/briefing/route.ts   (tabs)/record/page.tsx
   (서버 · admin client)    (화면 · browser client)
```

### ⚠️ 함수를 공유하는 것만으로는 부족하다 — **입력**이 갈리면 소용없다

서버는 세션 전량을 갖고 있어 완료 **수**를 알지만, 화면은 `hasHistory` 1비트만 갖고
있다. 시그니처가 `completedCount: number`면 화면이 수를 새로 조회해야 하고, 그때 두
쪽 입력이 미묘하게 갈리면 **알림은 걷기를 말하는데 화면은 지난 운동을 담는다.**

그래서 입력을 **양쪽이 싸게 만들 수 있는 것으로만** 낮춘다:

```ts
export type SuggestionKind = "walk" | "repeat" | "interval";

/** 새 사용자에게 걷기를 권하는 창 — 이 뒤로 기록이 없으면 조용해진다 */
export const NEW_USER_GRACE_DAYS = 7;

/**
 * 오늘 무엇을 제안할까. 제안할 것이 없으면 null.
 *
 * ⚠️ **종목을 반환하지 않는다.** `kind`만 돌려주고 무엇을 담을지는 화면이 정한다.
 *    서버가 종목까지 실어 보내면, 알림이 저장된 뒤 사용자가 운동을 하나 더 해도
 *    옛 제안이 그대로 온다.
 *
 * ⚠️ 입력에 `completedCount`를 쓰지 마라. 화면은 완료 수를 모르고 `hasHistory`
 *    1비트만 갖고 있다(`record/page.tsx:350`). 수를 요구하면 화면이 새 질의를
 *    하게 되고, 그 질의가 서버와 미묘하게 갈리는 순간 알림과 화면이 다른 말을 한다.
 */
export function pickSuggestionKind(input: {
  hasPlanToday: boolean;
  didWorkoutToday: boolean;
  hasHistory: boolean;
  lastSessionWasInterval: boolean;
  isInActiveChallenge: boolean;
  signedUpDayKey: string;
  todayKey: string;
}): SuggestionKind | null;

/** 주 제안에 딸리는 보조 제안 — 지난 운동일 때만 4분 인터벌을 같이 낸다 */
export function secondaryKind(primary: SuggestionKind): SuggestionKind | null;

/** 알림·화면 카드가 **같이 쓰는** 문구. 날짜로 변형을 돌린다 */
export function suggestionCopy(
  kind: SuggestionKind,
  todayKey: string,
  streak: number,
): { title: string; body: string };
```

### 분기

```
hasPlanToday          → null   (그날은 지금처럼 스트릭 브리핑)
didWorkoutToday       → null
!hasHistory
  ├ isInActiveChallenge → "interval"   (챌린지 참가자인데 기록 0건 — 지난 운동이 없다)
  ├ 가입 7일 이내       → "walk"
  └ 그 외               → null          ← 가입만 하고 잊은 사람에게 영원히 알림 금지
lastSessionWasInterval → "interval"     (같은 것이 주·보조로 둘이 되지 않게)
그 외                  → "repeat"
```

`secondaryKind`: `repeat`일 때만 `"interval"`, 나머지는 `null`.

## 4. 문구 — 제목은 행동, 본문은 이유

**⚠️ 문구를 kind마다 하나로 고정하지 마라.** 기존 브리핑은 이미 `pickByDay`로 날짜마다
문구를 돌린다(`briefing.ts:61`). 고정하면 계획 없는 날이 이어질 때 같은 말이 매일 와서
**기존보다 후퇴한다.** 같은 헬퍼를 그대로 재사용한다.

| kind | 제목 (3변형, `pickByDay`) | 본문 |
|---|---|---|
| `walk` | `🚶 오늘은 10분 걷기부터` · `🚶 딱 10분만 걸어볼까요?` · `🚶 오늘의 한 걸음, 10분` | 공통 철학문 |
| `repeat` | `🔥 {n}일째 — 오늘이 아직 비어 있어요` · `🔥 {n}일 이어왔어요, 오늘도 한 번?` · `🔥 오늘만 채우면 {n+1}일` | `지난번 그대로 담아 뒀어요 · 시간 없으면 4분만이라도` |
| `interval` | `⏱️ 딱 4분만 해볼까요?` · `⏱️ 4분이면 충분해요` · `⏱️ 오늘은 4분 인터벌 어때요?` | 공통 철학문 |

공통 철학문 (2변형): `오래 하는 것보다, 하루도 빼먹지 않는 게 중요해요` ·
`길게 못 해도 괜찮아요 · 안 빼먹는 게 이겨요`

`repeat`의 제목이 스트릭을 그대로 안고 가는 것이 의도다. 브리핑이 하던 일을 뺏지 않고,
**지금 항상 `null`인 `body`를** 제안이 채운다.

### ⚠️ 스트릭 0은 따로 말한다 (2026-08-16, 구현 중 발견)

`currentStreak`는 연속이 끊기면 **0**을 돌려준다(`streak.ts:42`). 위 `repeat` 제목에
그대로 넣으면 `🔥 0일째 — 오늘이 아직 비어 있어요` · `🔥 0일 이어왔어요`가 나간다 —
**하필 재참여가 가장 필요한 이탈 사용자에게** 말이 안 되는 문구다.

`streak-messages.ts` 머리주석이 이미 같은 규칙을 적어 두고 있다: 소멸 단계는
**새 출발 효과**를 쓰고, *"강도를 올리고 싶어도 사실을 넘지 마라. 화면이 거짓말하는
순간 다음 경고도 안 믿는다."*

그래서 `streak === 0`이면 숫자를 말하지 않는 제목으로 간다:
`🔥 오늘, 다시 시작해볼까요?` · `🔥 지난번 그 운동부터 다시` · `🔥 오늘 한 번이면 다시 1일`

## 5. 알림 배관

```
크론 30분마다 → GET /api/briefing
  └ buildBriefings (유저별)
       ├ morning_brief 꺼짐          → skip: "opted_out"   ← 제안 분기보다 **앞**이다
       ├ 슬롯 불일치                 → skip: "slot_mismatch"
       ├ pickSuggestionKind() = null → 지금 그대로
       │     type = morning_briefing · body = null · url = /home
       └ kind 있음
             type = workout_suggestion · body = 제안 본문 · url = /record?suggest=1
```

### ⚠️ opt-out은 제안보다 앞이다

`morning_brief`를 끈 사람은 제안도 받지 않는다. **같은 채널이다.** 순서를 뒤집으면
"알림 껐는데 오네"가 된다.

### ⚠️ 신규 유저 게이트를 연다

`briefing.ts:96`의 `completedAts.length === 0 → no_history` 스킵을 **제안이 있으면
통과**시킨다. 이 한 줄이 "신규에게 걷기"의 전부다.

⚠️ **스킵 사유를 새로 만들지 마라.** `briefing.test.ts:39`가 이미
`skipped == [{userId:"me", reason:"no_history"}]`를 **통째로 비교**한다. 사유를 늘리면
그 회귀선이 깨진다. `no_history`의 뜻을 "기록 0건" → **"기록 0건이고 제안도 없음"**
으로 넓히면 기존 단언이 그대로 성립한다(그 픽스처의 가입일은 7일 창 밖이다).
사유는 `no_history | opted_out | slot_mismatch` 셋 그대로다.

신규는 세션이 5회 미만이라 `estimateNotifyMinute`가 `null`을 주고 **09:00**에 받는다.
이건 기존 동작 그대로다(§2 실측).

### ⚠️ 알림은 하루 한 통 그대로다

`dedupe_key`를 **지금 것에서 바꾸지 않는다** (`morning_briefing:{uid}:{todayKey}`).
유니크 인덱스가 `dedupe_key` 하나에만 걸려 있어서(`notifications_dedupe_key_uidx`),
`type`이 달라져도 하루 한 행이 보장된다. 키를 바꾸면 전환일에 이미 브리핑을 받은
사람에게 **두 통째가 뚫린다.**

### 새 알림 유형 1종

`workout_suggestion` 하나만 더한다. kind별로 3종을 만들지 않는 이유: URL이 셋 다
`/record?suggest=1`로 같고, 무엇을 담을지는 화면이 다시 계산한다.

- `notifications_type_check` 허용목록에 추가 → **마이그레이션 0078**
- `PUSH_URL_BY_TYPE`에 `workout_suggestion: "/record?suggest=1"` — ⚠️ exhaustive가
  아니라 안 넣으면 조용히 `/home`으로 떨어진다
- `TYPE_ICON`에 아이콘 — exhaustive라 안 넣으면 **타입 오류로 막힌다**(좋은 가드)

## 6. 링크를 읽어 담는다

### ⚠️ `useSearchParams`를 쓰지 마라 — 이 저장소가 두 번 거부했다

`record-view.ts:8`: *"쿼리스트링을 쓰지 않는다. `useSearchParams`가 Suspense 경계를
요구해서 이 앱은 이미 그 길을 피했다."*

거부된 것은 **훅**이지 URL이 아니다. 푸시는 앱을 URL로 **새로** 여니 `record-view.ts`의
모듈 변수 핸드오프가 원리적으로 불가능하다 — 그 모듈은 클라이언트 이동일 때만 참이 된다.
URL 말고는 길이 없다.

**대신 `useEffect` 안에서 `window.location.search`를 읽는다.** 훅을 안 쓰므로 Suspense
경계도, `next build`의 CSR bailout도 없다. 이 이유를 **코드 주석에 박는다** — 안 박으면
다음 사람이 무심코 `useSearchParams`로 바꿔 빌드를 깬다.

### 순서

1. `?suggest`가 있으면 `pickSuggestionKind`를 **화면 데이터로 다시 돌린다**
2. 기존 자동 담기와 **같은 가드**: draft가 비어 있고 · 세션 미시작일 때만
   (`shouldAutoLoadTodayPlan`이 이미 쓰는 규칙 — 사용자가 만든 상태를 덮지 않는다)
3. 담고 `draft.suggestedForDayKey = todayKey`
4. `history.replaceState`로 `?suggest`를 지운다 — 안 지우면 새로고침마다 다시 담긴다

### ⚠️ 인터벌만 담지 않는다

`interval`은 목록에 담으면 **음원도 코스도 없는 맨몸 4개**가 된다. `tabata.ts:63`이
정확히 그 옛 버그를 적어 두고 있고, `shouldAutoLoadTodayPlan`도 같은 이유로
`plan.tabataMinutes`면 false를 준다(`workout-plan.ts:284`). 인터벌은 **4분 타바타
시트를 연다.**

## 7. 자정에 지운다

`WorkoutDraft`에 `suggestedForDayKey: string | null` 한 칸을 더한다 (**v6 → v7**).
이 칸이 차 있다는 것은 **"아직 기계가 담아 준 그대로"** 라는 뜻이다.

```ts
/**
 * 어제 담긴 제안을 지운다 — **순수 함수다.**
 *
 * `loadDraft` 안에 넣지 않는 이유: 저장소 접근과 만료 규칙은 다른 일이고,
 * 규칙만 따로 있어야 테스트가 저장소 없이 잡는다.
 */
export function expireStaleSuggestion(
  draft: WorkoutDraft,
  todayKey: string,
): WorkoutDraft;
```

| 조건 | 결과 |
|---|---|
| `suggestedForDayKey === null` | **손대지 않는다** ← 사용자가 직접 담은 것 |
| `suggestedForDayKey === todayKey` | 손대지 않는다 (오늘 제안) |
| 스탬프 ≠ 오늘 · `startedAtMs !== null` | 손대지 않는다 (운동 중) |
| 스탬프 ≠ 오늘 · 미시작 | **종목을 비운다** |

⚠️ 판정은 `< todayKey`가 아니라 **`!== todayKey`** 다. 기기 시계가 앞서 있거나 사용자가
타임존을 옮기면 스탬프가 미래일 수 있는데, `<` 비교면 그 draft가 **영영 안 지워진다.**

그리고 **사용자가 종목을 더하거나 빼는 순간 `suggestedForDayKey = null`** 로 만든다.
그때부터 본인 것이므로 다음 날 지우면 안 된다.

달력에는 애초에 안 찍힌다 — `workout_plans`에 행을 만들지 않으므로.

## 8. 화면 카드 — 알림 없이 들어와도 보인다

제안이 링크에만 살면, 앱 아이콘으로 들어온 사람은 아무것도 못 본다. `RecordEmptyState`가
같은 `pickSuggestionKind`로 카드를 그린다. **이게 C2 그 자체다.**

- 주 버튼: `지난번 그대로 담기` / `10분 걷기 담기`
- 보조 버튼(있을 때만): **`4분 인터벌 시작`**
- 한 줄: 공통 철학문 (알림 본문과 **같은 말**)

### ⚠️ 보조 버튼은 하는 일이 다르다 — 문구로 가른다

주 제안은 "담기"인데 인터벌은 "시트 열기"다. `recommended-picker.tsx:64`가 똑같은
함정을 겪고 주석으로 경고해 뒀다(*"이 칸은 다른 칸과 하는 일이 다르다 — 담기만 하면
3세트 10회짜리 일반 운동이 되어 버린다"*). 그래서 `담기`가 아니라 **`시작`** 이다.

## 9. 라우트가 새로 읽는 것

| 무엇 | 어떻게 | 왜 좁히나 |
|---|---|---|
| `profiles.created_at` | 기존 select에 컬럼 추가 | 가입 7일 창 |
| `workout_plans` | `plan_date` **어제~내일**만, `user_id, plan_date` 두 컬럼 | 크론이 하루 48회 돈다. 전량 조회 금지. ±1일은 유저 타임존 폭 |
| 챌린지 참가 | `challenge_participants(status='joined')` ⋈ `challenges(status='active')` → user_id 집합 | 기록 0건 참가자를 인터벌로 보내는 분기에만 쓴다 |
| `workout_sessions.tabata_minutes` | 기존 select에 컬럼 추가 | `lastSessionWasInterval` |

`didWorkoutToday`·`hasHistory`는 **이미 읽고 있는** 세션 목록에서 파생한다 — 새 질의 없음.

## 10. 마이그레이션과 되돌리기

**0078 — `notifications_type_check`에 `workout_suggestion` 1종 추가.** 그것뿐이다.

⚠️ 허용목록은 **목록 전체를 다시 쓰는** 방식이다(0077 머리주석). 0077의 목록을 그대로
베끼고 한 줄만 더한다. 하나라도 빠지면 그 유형의 알림이 조용히 죽는다.

**지금 Run해도 안전하다** — 운영 앱이 그 유형을 아직 안 쓰므로 아무 변화가 없다.
`CLAUDE.md`의 "안전(새 테이블·인덱스·새 RPC)" 쪽이고, `level_definitions` UPDATE 같은
"배포 뒤에 돌려야 하는 것"이 아니다.

| 언제 | 무엇을 |
|---|---|
| 배포 후 문제 | `npx vercel@latest rollback --scope gnd4` — 앱 코드가 전부라 이걸로 원복 |
| 유형을 되돌린다 | 허용목록에서 빼기 **전에** 그 유형 행을 지운다. 순서를 뒤집으면 위반 |

localStorage draft v7은 되돌릴 것이 없다 — v6 승격 경로가 `IDLE_DEFAULTS`·
`PROGRAM_DEFAULTS`와 같은 방식으로 기본값을 채운다.

## 11. 회귀선으로 박을 것

**기준: 일부러 고장냈을 때 그 단언이 실패하는가.**

| 단언 | 지키는 것 |
|---|---|
| 오늘 계획이 있으면 `null` | 계획 있는 날 제안이 끼어들지 않는다 |
| 오늘 이미 운동했으면 `null` | 한 뒤에 또 권하지 않는다 |
| **가입 8일차 · 기록 0건 → `null`** | 가입만 하고 잊은 사람에게 영원히 알림 금지 |
| 가입 7일차 · 기록 0건 → `"walk"` | 창 경계 (위와 한 쌍이라야 경계를 잡는다) |
| 기록 0건 · 챌린지 참가 중 → `"interval"` | 지난 운동이 없는 참가자의 막다른 길 |
| 지난 세션이 인터벌 → 주 제안이 `"interval"` | 주·보조가 같은 것이 되지 않는다 |
| **스탬프 없는 draft는 안 지운다** | "사용자가 직접 담은 걸 지우지 않는다" |
| 스탬프가 어제 + 운동 중 → 안 지운다 | 진행 중인 세션을 건드리지 않는다 |
| 스탬프가 어제 + 미시작 → 비운다 | 자정 만료 그 자체 |
| 종목을 더하면 스탬프가 `null`이 된다 | 편집한 순간 본인 것이 된다 |
| `morning_brief` 끈 사람은 제안이 있어도 스킵 | opt-out 존중 |
| 제안이 있으면 `url`이 `/record`로 바뀐다 | `PUSH_URL_BY_TYPE`가 exhaustive가 아니라 조용히 `/home`으로 샌다 |
| 계획 있는 날은 `type`이 `morning_briefing` 그대로 | 기존 동작 보존 |
| `dedupe_key`가 안 바뀐다 | 전환일 두 통째 방지 |
| 같은 kind라도 날짜가 다르면 제목이 다르다 | 문구 로테이션 (안 하면 기존보다 후퇴) |
| **스트릭 0이면 제목에 `0일`이 없다** | 이탈 사용자에게 `🔥 0일째`를 보내지 않는다 (§4) |
| 가입 **7일째**는 창 밖이다 | 6일·8일 단언만으로는 `<`→`<=` 확장을 못 잡는다(실측) |
| 가입일 문자열이 망가지면 `null` | 안전한 방향(덜 보냄)으로 실패하는지 고정 |

## 12. 개발 서버 실측 — 건너뛸 수 없다

`~/.claude/CLAUDE.md` 최우선 규칙. lint·typecheck·테스트·build가 전부 초록인데 화면이
깨진 적이 두 번 있다(0044·0055).

**계정은 A 하나로 충분하다** — 이 기능은 상대가 없다(알림이 본인에게 온다).

| # | 화면 | 조작 | 기대 |
|---|---|---|---|
| 1 | `/record` | 계획 없는 날 연다 | **제안 카드가 뜬다.** 주 버튼 + 철학문 한 줄 |
| 2 | 같은 화면 | 주 버튼을 누른다 | 종목이 담기고 `운동 시작`이 뜬다 |
| 3 | 같은 화면 | `4분 인터벌 시작` | **타바타 시트가 4분으로 열린다** (목록에 4개가 담기지 **않는다**) |
| 4 | `/record?suggest=1` | 주소로 직접 연다 | 담긴 채로 열리고 **주소창에서 `?suggest`가 사라진다** |
| 5 | 같은 화면 | 새로고침 | 다시 담기지 **않는다** (중복 없음) |
| 6 | `/calendar` | 오늘 셀을 본다 | **`예정` 표시가 없다** ← 제거의 부정 확인 |
| 7 | 계획이 있는 날 | `/record` | 계획이 자동으로 담기고 **제안 카드가 안 뜬다** |
| 8 | 운동을 완료한 뒤 | `/record` | 제안 카드가 **안 뜬다** |

### 자정 만료는 시계를 못 돌리므로 이렇게 본다

localStorage의 `gnd-workout-draft:{uid}`에서 `suggestedForDayKey`를 **어제 날짜로 직접
고치고** 새로고침한다 → 종목이 비어야 한다. 그다음 스탬프를 `null`로 두고 같은 일을
하면 → **안 비워져야 한다.** 두 번째가 "사용자 것은 안 지운다"의 실측이다.

### 알림 실물

⚠️ 각자 슬롯이 달라 그냥 기다리면 안 온다. `?hour=N` 오버라이드로 강제한다
(`route.ts:94` — 수동 검증 전용).

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/briefing?hour=9" | jq
```

`sent`가 늘고, `notifications`에 `type='workout_suggestion'` 행이 생기고, 본문이 제안
문구인지 본다. 2차 호출은 `alreadySent`로 떨어져야 한다(멱등). 0077 때
`{"sent":1}` → `{"sent":0}`으로 확인한 것과 같은 방식이다.

⚠️ **검증으로 만든 알림 행은 지운다.** 0077 검증에서도 그렇게 했다.

⚠️ `[미검증]`으로 남을 것: **실기기에서 푸시를 눌렀을 때 `/record?suggest=1`로 실제로
이동하는가.** 개발 서버에서는 서비스워커 푸시를 재현할 수 없다. 사용자 폰 확인으로 받는다.

## 13. 범위 밖

- **자동 시작** — 담아만 두고 시작은 사람이 누른다(사용자 결정). 오탭으로 세션이 열리면
  사용자가 닫아야 한다
- **제안을 계획으로 저장** — 사용자가 "12시 지나면 달력에 안 남게"라고 정했다
- **신규에게 4분 인터벌** — 걷기만 낸다. 인터벌 4종(맨몸 스쿼트·니 푸시업·데드버그·
  마운틴 클라이머)은 처음 온 사람에게 걷기보다 부담이 크다
- **제안 알림 별도 on/off** — `morning_brief` 하나를 같이 쓴다. 스위치를 늘리는 것은
  설정 화면 작업이라 이 배치에 안 넣는다
