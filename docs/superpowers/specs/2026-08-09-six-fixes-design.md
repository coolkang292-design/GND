# 6건 수정 — 제1원리 분석과 구현 계획

작성 2026-08-09. 대상: 사용자가 준 체크리스트 6건.
읽는 순서: §0 요약 → 각 항목(현상·근본원인·설계·파일·검증) → §7 순서·검증·배포.

이 문서는 **코드를 실제로 읽고 쓴 것**이다. 인용한 줄번호는 작성 시점 기준이다.

---

## 0. 한눈에

| # | 요청 | 실제 원인 | 난이도 | DB |
|---|---|---|---|---|
| 1 | 운동 중 무게 수정 → 다음 세트 일괄 적용 | 기능 없음. `updateSet`이 세트 하나만 고친다 | 소 | — |
| 2 | 치얼업 메시지를 마지막 세트에 | 응원은 **다 끝낸 뒤**에만 뜬다. 마지막 세트에는 알약 한 줄뿐 | 소 | — |
| 3 | 유산소 거리 0.1 단위 | `DISTANCE.step = 0.5` | 극소 | — |
| 4 | 홈 친구 배지 좋은 것 먼저 | 배지 3장을 **최신순**으로 자른다. `rarity`·`tier`를 안 본다 | 소 | — |
| 5 | 운동 중 교체·취소·접어두기 안 됨 | **오버레이 상단 버튼 줄이 상태바 밑에 깔린다** + 접으면 RestBar가 복귀 버튼을 덮는다 + 교체 기능은 애초에 없다 | 중 | — |
| 6 | 챌린지 열람권이 매일 다시 열린다 | 설계가 원래 "매일 1회"다. **사용 기록을 열림 판정에 안 쓴다** | 중 | 0065 |

**5번이 제일 급하다.** 지금 폰에서는 운동 중 오버레이를 빠져나갈 문이 사실상 없다.

---

## 1. 운동 중 무게 수정 → 다음 세트부터 일괄 적용

### 현상
오버레이에서 `–`/`+`로 무게를 바꾸면 **지금 세트 하나만** 바뀐다.
4세트 60kg으로 담고 시작 → 1세트에서 50kg으로 내리면 2·3·4세트는 그대로 60kg이다.

### 근본 원인 (사실)
`src/app/(tabs)/record/page.tsx:2005`

```
onChangeAmount={(key, value) => {
  if (!focusedExercise) return;
  updateSet(focusedExercise.key, setFocus.setIndex, { [key]: value });
}}
```

`updateSet`(`page.tsx:843`)은 `i === si`인 세트만 갈아끼운다. 전파 개념이 코드에 없다.

### 무엇이 참인가
- 담을 때 정한 무게는 **예상치**다. 실제 무게는 첫 세트를 들어 봐야 안다.
- 이미 `done`인 세트는 **기록**이다. 소급해 고치면 볼륨·기록 갱신이 거짓이 된다.
- 사용자가 값을 바꾼 이유를 화면이 알 수는 없다 → 되돌릴 길이 있어야 한다.

### 설계
전파 규칙: **같은 종목**의 **지금 세트보다 뒤**에 있고 **아직 `done`이 아닌** 세트에만 같은 값을 쓴다.

```
propagateAmount(exercise, fromIndex, key, value)
  → sets.map((s, i) => i > fromIndex && !s.done ? { ...s, [key]: value } : s)
```

- 순수 함수로 `src/lib/domain/set-input.ts`에 넣는다(이미 이 파일이 "어떤 칸을 쓰는가"의 단일 원천이다).
- 오버레이의 `onChangeAmount`에서만 부른다. **`ExerciseCard`의 직접 입력에는 붙이지 않는다** — 거기는 담기 단계의 세트별 설계용이고, 사용자의 요구도 "운동 시작하고 운동중"이다.
- 조용히 바꾸지 않는다. 뒤 세트가 1개 이상 바뀌면 토스트: `다음 3세트에도 50kg을 적용했어요`.

#### 결정이 필요한 것 — 무게만인가, 네 칸 전부인가
사용자 문장은 "무게"다. 다만 같은 논리가 횟수·거리·시간에도 그대로 성립하고(첫 세트를 해 보고 12회 → 10회로 낮추는 상황), `onChangeAmount`는 이미 `key` 하나로 일반화돼 있어 **네 칸 전부 전파가 코드로도 더 단순하다**(분기가 없다).

**추천: 네 칸 전부.** 드롭세트·피라미드처럼 세트별로 다르게 가고 싶은 경우가 걱정이라면 무게만으로 좁힌다 — 그건 한 줄(`if (key !== "weightKg") return`)이다.

### 파일
- `src/lib/domain/set-input.ts` — `propagateAmount` 추가
- `src/lib/domain/set-input.test.ts` — 아래 단언
- `src/app/(tabs)/record/page.tsx:2005` — 배선 + 토스트

### 테스트 (일부러 고장내면 실패하는가)
- 뒤 세트에 적용된다 → 개수가 **1 이상**임을 단언(0이 아님이 아니라 "3이어야 한다")
- `done`인 뒤 세트는 **안 바뀐다**
- 앞 세트는 **안 바뀐다**
- 다른 종목은 **안 바뀐다**

---

## 2. 치얼업 메시지를 운동 중 마지막 세트에

### 현상
`ActiveSessionOverlay`에서 응원 문구(`completionMessage.cheer`)는 `allDone`
(= 휴식 모드 + 다음 없음) 에서만 뜬다(`active-session-overlay.tsx:233-247`).
입력 화면의 마지막 세트에는 알약 한 줄만 있다(`:335-341`):

> 🏁 마지막 세트예요 — 이것만 하면 오늘 몫 끝!

즉 응원은 **다 끝낸 뒤**에 온다. 정작 힘든 순간인 **마지막 세트를 하기 직전**에는 없다.

### 근본 원인
2026-08-04 요구사항 자체가 "마지막 세트를 **할 때** 안내와 응원"이었는데
(테스트 주석 `active-session-overlay.test.tsx:299-303`), 구현은 응원을 완료 화면에만 뒀다.
요구와 구현이 갈린 채로 테스트가 완료 화면만 단언해서 드러나지 않았다.

### 무엇이 참인가
- `CHEERS`(`workout-complete-message.ts:16-24`)는 **전부 과거형**이다 — "안 남기셨네요", "끝까지 한 날은". 마지막 세트 **직전**에 띄우면 아직 안 한 일을 했다고 말하는 셈이다.
- 문구는 렌더 중 랜덤이면 안 된다. 이 저장소는 `pickByDay(문구목록, todayKey)`로 고정한다.

### 설계
`src/lib/domain/workout-complete-message.ts`에 **앞을 보는 문구 세트**를 하나 더 둔다.

```
const LAST_SET_CHEERS = [ ... ]   // "여기까지 왔으면 이미 이긴 겁니다. 한 세트만 더 💪" 류 7개
export function lastSetCheer(input: { todayKey: string }): string
```

- 파일을 나누지 않는다. "운동 마무리 문구"라는 같은 관심사고, 톤이 갈리면 안 된다.
- 오버레이: `isLastPendingSet`일 때 기존 알약 **아래**에 응원 한 줄을 붙인다.
  알약을 대체하지 않는다 — 알약은 사실(마지막이다), 응원은 감정이다.
- 완료 화면의 `completionMessage`는 **그대로 둔다**. 두 순간은 다른 문구가 맞다.
- prop 이름은 `lastSetMessage: string`. 부모가 만들어 내려보낸다(문구 조립을 화면에 두지 않는 이 저장소 규약).

### 파일
- `src/lib/domain/workout-complete-message.ts` + `.test.ts`
- `src/components/record/active-session-overlay.tsx` (+ `.test.tsx`)
- `src/app/(tabs)/record/page.tsx` — `lastSetMessage` 계산·전달

### 테스트
- `isLastPendingSet=true`면 응원 문구가 **보인다**
- `isLastPendingSet=false`면 **없다**
- 같은 `todayKey`면 문구가 같다(로테이션 고정)
- 완료 화면 문구와 마지막 세트 문구가 **다른 문자열**이다

---

## 3. 유산소 거리 0.1 단위

### 현상 / 원인
`src/lib/domain/set-input.ts:45-51`

```
const DISTANCE = { key:"distanceKm", label:"거리", unit:"km",
                   step: 0.5, quickSteps: [-1, -0.5, 0.5, 1] };
```

`+`/`–` 한 번이 0.5km다. 3.2km를 넣으려면 스테퍼로는 불가능하고 카드 입력창으로 가야 한다.

### 설계
```
step: 0.1,
quickSteps: [-1, -0.1, 0.1, 1],
```

- **`step`만 0.1로 바꾸고 빠른 칩에 ±1을 남긴다.** 0.1만 있으면 5km를 넣는 데 50번 눌러야 한다. ±1이 굵은 조절, `±`버튼이 미세 조절이다.
- `adjustAmount`가 이미 소수 셋째 자리에서 반올림한다(`set-input.ts:79`) — `0.30000000000000004` 문제는 없다. 확인은 테스트로 건다.
- 표시: `set-display.ts:29`가 `${set.distanceKm}km`라 `3.1`은 `3.1km`로 잘 나온다. **`toFixed(1)` 강제는 하지 않는다** — `5km`가 `5.0km`가 되면 오히려 시끄럽다.

### 파일
- `src/lib/domain/set-input.ts:45-51`
- `src/lib/domain/set-input.test.ts:56-59` — **기존 단언 `expect(cardio[0].step).toBe(0.5)`를 0.1로 고쳐야 한다.** 이 단언이 지금 이 값을 지키고 있다.
- `adjustAmount(3.2, 0.1) === 3.3` 단언 추가(부동소수 회귀선)

---

## 4. 홈 친구 배지 — 좋은 것 먼저

### 현상 / 원인
`src/lib/friends.ts:146-164` — 획득 배지를 `earnedAt` **내림차순**으로 정렬해 앞에서 3장
(`FRIEND_BADGE_PREVIEW = 3`, `friend-board.ts:94`)을 자른다.
즉 방금 딴 `first_workout` 같은 흔한 배지가 `legend`를 밀어낸다.

### 무엇이 참인가 — 등급은 **이미 있다**
`src/lib/domain/badges.ts:22-26`

```
export type BadgeTier   = "bronze" | "silver" | "gold" | "legend";
export type BadgeRarity = "common" | "rare" | "epic" | "legend" | "mythic";
```

`getBadgeCatalog()`가 `tier`·`rarity`·`sortOrder`를 다 실어 오고(`src/lib/badges.ts:10`),
`getFriendBadges`는 이미 그 `catalog`를 손에 쥐고 있다(`friends.ts:140`).
**추가 조회 없이** 정렬 기준만 바꾸면 된다.

### 설계
정렬 키를 `rarity` → `tier` → `earnedAt`(최신) 3단으로 바꾼다.

```
// src/lib/domain/badges.ts
export const RARITY_RANK: Record<BadgeRarity, number> =
  { mythic:5, legend:4, epic:3, rare:2, common:1 };
export const TIER_RANK: Record<BadgeTier, number> =
  { legend:4, gold:3, silver:2, bronze:1 };

/** 자랑할 순서 — 희귀도 → 티어 → 최신 */
export function compareBadgeShowcase(a, b): number
```

- 순수 함수는 `domain/badges.ts`에 둔다. `friends.ts`는 조회 계층이라 규칙을 담지 않는다.
- `rarity`가 같으면 `tier`, 그것도 같으면 최신순 → **완전 순서**라 같은 사람에게 매번 같은 3장이 나온다(비결정 정렬 금지).
- `total`(배지 개수) 계산은 건드리지 않는다. 바뀌는 건 `recentKeys`뿐이다.
- 이름이 `recentKeys`인 채로 두면 다음 사람이 최신순이라 믿는다 → **`showcaseKeys`로 바꾼다**. 타입 `FriendBadges`, `FriendRow.badgeKeys` 생성부, 테스트가 같이 바뀐다.

### 파일
- `src/lib/domain/badges.ts` + `.test.ts` — 랭크표·비교 함수
- `src/lib/friends.ts:146-164` + `src/lib/friends.test.ts:174-222` — **기존 "최신순으로 준다" 테스트가 새 규칙과 정면으로 충돌한다. 지우지 말고 "등급순으로 준다"로 다시 쓴다.**
- `src/lib/domain/friend-board.ts:74-95, 214-215` — 필드명
- `src/components/home/friend-board-card.tsx:250` — 렌더는 그대로(키 배열만 받는다)

### 테스트
- `common`을 오늘, `legend`를 한 달 전에 땄으면 → **`legend`가 앞**
- 같은 `rarity`면 `tier` 높은 것이 앞
- 셋 다 같으면 최신이 앞
- 3장 초과 시 `+N` 숫자가 여전히 맞다(`badgeCount - showcaseKeys.length`)

---

## 5. 운동 중 교체·취소·접어두기가 실 서버에서 안 됨 ⚠️ 최우선

### 먼저 확인한 것 — 배포 누락이 아니다
프로덕션 번들을 직접 받아 문구를 찾았다.

```
/_next/static/chunks/12bn9fphezkzy.js :: 최소화 / 다시 열기 / 운동을 취소할까요 / 마지막 세트예요
```

**코드는 배포돼 있다.** 7/29~30 같은 "푸시만 하고 배포 안 됨" 사고가 아니다. 실행 시점 문제다.

### 원인 A (유력) — 상단 버튼 줄이 상태바 밑에 깔린다

`active-session-overlay.tsx:112-134`

```
<div className="fixed inset-x-0 top-0 z-20 ... px-3 pt-3 ..." style={{ bottom: 0 }}>
  <div className="mb-2 flex ...">
    <button …>▾ 최소화</button>
    <button …>취소</button>
  </div>
```

- `pt-3` = 12px, 버튼 줄은 `h-8` = 32px → **화면 y = 12~44px**
- `src/app/layout.tsx:21` `viewportFit: "cover"`
- `src/app/manifest.ts` `display: "standalone"`
- **저장소 전체에서 `env(safe-area-inset-top)` 사용처가 0곳이다** (`safe-area-inset-bottom`은 19곳)

설치형 앱에서 `viewport-fit=cover`면 페이지가 상태바 **밑까지** 그려진다.
iOS는 `safe-area-inset-top`이 44~59px, Android 15+ 강제 edge-to-edge도 24~48px다.
**두 버튼이 통째로 상태바 아래 깔려 탭이 시스템 UI로 간다.** PC 개발 서버에는 inset이 0이라
멀쩡히 눌린다 — "개발에선 되는데 폰에서 안 되는" 증상이 정확히 이 모양이다.

`최소화`와 `취소`가 **같은 줄에 있어서 둘이 함께** 죽은 것도 이 가설과 맞는다.

> ⚠️ 이건 코드 근거가 강한 가설이지 확정이 아니다. 폰 기종·OS에 따라 inset이 0일 수 있다.
> **고치기 전에 사용자 폰에서 한 번 재현한다**(§7 재현 절차). 다만 `safe-area-inset-top`을
> 넣는 것 자체는 어느 쪽이든 맞는 수정이라, 재현이 안 돼도 이 변경은 남긴다.

### 원인 B (확정) — 접어도 돌아올 문이 가려진다

| 요소 | 위치 | z |
|---|---|---|
| 복귀 버튼 `다시 열기 ▴` (`page.tsx:2027-2043`) | `bottom: safe-area + 72px` | **z-20** |
| `RestBar` (`rest-bar.tsx:32-34`) | `bottom: safe-area + 72px` | **z-30** |

`RestBar`는 `restRemaining !== null && !overlayOpen`일 때 뜬다(`page.tsx:1887`) —
즉 **접었을 때만** 뜬다. 복귀 버튼과 **같은 자리에서 위에 겹친다.**
휴식 중에 접으면 오버레이로 못 돌아온다. 코드만 읽어도 확정되는 버그다.

### 원인 C (기능 없음) — 운동 중 종목 교체·삭제 경로가 없다

`page.tsx:1730`

```
{/* 팝업이 열려 있으면 카드는 그 안에만 그린다 */}
{!overlayOpen && exerciseCards}
```

오버레이가 열려 있으면 `ExerciseCard`가 아예 렌더되지 않는다.
종목 삭제(`onRemoveExercise`)·순서 변경(`onLongPress` → `ExerciseReorderSheet`)은 전부 그 카드에 달려 있다.
**운동 중에 종목을 빼거나 바꿀 UI가 오버레이 안에 없다.**
= 접기가 죽으면(원인 A) 교체는 **원천적으로 불가능**하다. 세 증상이 한 뿌리다.

### 설계

**5-1. 안전 영역 (원인 A)**
```
className="fixed inset-x-0 top-0 z-20 ... px-3"
style={{ bottom: 0, paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
```
- `pt-3`을 지우고 인라인 `paddingTop`으로 바꾼다(Tailwind 임의값보다 의도가 읽힌다).
- 같은 점검을 `IdlePauseModal`·`XpResultModal` 등 **`top-0`으로 붙는 다른 고정 요소 전부**에 한다. 지금 저장소에 `safe-area-inset-top`이 하나도 없다는 건 이 부류가 다 위험하다는 뜻이다.
- 터치 타깃도 같이 키운다: `h-8`(32px) → **`h-11`(44px)**. 44px는 iOS HIG 최소치다.

**5-2. 복귀 버튼을 안 가린다 (원인 B)**
- 복귀 버튼 `z-20` → **`z-40`** (RestBar z-30 위). 오버레이 본체 z-20은 **건드리지 않는다** — 시트(z-40/50)·정지 모달(z-50)이 그 위에 떠야 한다는 기존 규약이 있다.
- 접힌 상태에서 RestBar와 복귀 버튼이 **동시에** 필요한지 결정한다.
  **추천:** 복귀 버튼을 위로 올린다(`safe-area + 132px`) → 휴식 남은 시간(RestBar)과 복귀 문 둘 다 보인다. 하나를 숨기면 다른 정보를 잃는다.

**5-3. 운동 중 종목 교체·건너뛰기 (원인 C)**
오버레이 입력 화면 하단(`이전 기록 불러오기` 옆)에 보조 줄을 추가한다:

| 버튼 | 동작 | 왜 |
|---|---|---|
| `이 종목 건너뛰기` | 이 종목의 남은 `!done` 세트를 제거하고 다음 종목으로 포커스 이동 | 기구가 사람이 많을 때. 기록은 한 것만 남는다 |
| `운동 바꾸기` | 기존 `ExercisePicker`를 열어 고른 종목으로 **현재 종목을 치환**(세트 수·목표 유지, 값은 초기화) | 사용자가 요청한 "교체" |

- **삭제가 아니라 치환**이다. 삭제는 `건너뛰기`가 담당한다.
- 이미 `done`인 세트가 있는 종목은 치환하지 않는다 — 기록이 사라진다. 그 경우 `건너뛰기`만 남긴다.
- 피커는 z-40/50이라 오버레이(z-20) 위에 정상적으로 뜬다(기존 규약 그대로).
- 치환 로직은 순수 함수로: `src/lib/domain/session-flow.ts`에 `replaceExercise(exercises, key, next)`.

> `건너뛰기`·`바꾸기`는 새 기능이다. 5-1·5-2는 버그 수정이다.
> **커밋을 나눈다** — 버그 수정이 먼저 나가야 폰에서 갇힌 상태가 즉시 풀린다.

### 파일
- `src/components/record/active-session-overlay.tsx` (+ `.test.tsx`)
- `src/app/(tabs)/record/page.tsx:2027-2043` (복귀 버튼), 1730 근처(치환 배선)
- `src/lib/domain/session-flow.ts` (+ `.test.ts`)
- `src/components/record/idle-pause-modal.tsx` 등 `top-0` 고정 요소 점검

### 테스트
- 오버레이 루트에 `env(safe-area-inset-top)`이 들어간 `paddingTop`이 있다 (문자열 단언 — jsdom은 실제 inset을 모른다)
- 최소화·취소 버튼 높이가 44px 이상이다
- 복귀 버튼의 z가 RestBar보다 크다
- `replaceExercise`: 세트 수 유지 · `done` 값 초기화 · 다른 종목 불변
- 건너뛰기: `!done` 세트만 사라지고 `done`은 남는다

---

## 6. 챌린지 열람권이 매일 다시 열린다

### 현상
"어제 확인했는데 오늘도 같은 보상이 지급됨."

### 근본 원인 — 지금 설계가 원래 "매일"이다
`src/lib/domain/viewing-pass.ts:133-183` `challengePassStatus`:

- 오늘 포함 **엄밀 연속 운동일 ≥ 5**면 `unlocked`
- 유효기간 = 오늘 첫 완료 시각 + 2시간
- **`used` 상태가 없다.** 사용 기록이 판정에 안 들어간다

같은 파일 위쪽의 꾸준왕 열람권(`viewingPassStatus:44`)은 `usedViewAts`를 받아
`used` 상태를 갖는다. **챌린지 쪽만 그 개념이 빠졌다.**

그래서 5일 연속을 만든 뒤로는 **연속이 끊길 때까지 매일** 새 2시간 창이 열린다.
서버도 같다 — `0054_bodyweight_catalog_and_peek_notify.sql:253` `if v_consec = 5 then`,
`dedupe_key = 'peek_unlock:<uid>:<KST date>'` → **하루 1건씩 매일** 알림이 나간다.

사용 기록은 이미 있다: `challenge_peek_picks (viewer_id, challenge_id, pick_date, target_id)`
(`0040_challenge_peek_pick.sql:17-25`). **쌓기만 하고 열림 판정에 안 쓴다.**

### 무엇이 참인가
- 보상의 값어치는 **희소성**에서 온다. 매일 열리면 잠금이 장식이다.
- "사용했다"의 정의는 **대상을 골랐다**(`pick_challenge_peek` 성공)이다. 카드를 본 것만으로는 아무것도 못 봤다.
- 화면과 서버 알림이 **같은 판정**을 써야 한다. 안 그러면 "🎟️ 2시간 시작!" 푸시를 받고 들어갔더니 자물쇠가 걸린 막다른 길이 된다. (CLAUDE.md의 "형제 함수를 같이 훑어라" — 0045→0046→0047 사고가 이 종류였다)

### 설계 — 사용하면 카운터가 다시 0부터

규칙 한 줄:

> 마지막으로 **사용한 날 다음 날부터** 오늘까지 끊김 없이 5일을 채우면 다시 열린다.
> 한 번도 사용한 적이 없으면 지금과 같다(엄밀 연속 5일).

`challengePassStatus`에 인자를 하나 더 받는다:

```
challengePassStatus(
  completedAts: Date[],
  now: Date,
  timeZone: string,
  requiredDays = KING_DAYS,
  lastUsedDayKey: string | null = null,   // ← 추가
): ChallengePassStatus
```

- 연속 카운트 루프(`:144-147`)가 `lastUsedDayKey`에 **닿으면 멈춘다**.
  → 사용한 날과 그 이전은 이번 블록에 안 쳐 준다.
- 기본값 `null`이면 지금 동작 그대로 → 기존 테스트가 안 깨진다.
- `state`에 `"used_today"`를 추가할 필요는 없다. 사용 직후엔 `consecutive`가 0이 되어
  자연히 `locked_progress`가 된다. **상태를 늘리지 않는 게 낫다** — 문구 분기가 늘어난다.
- `challengePassCopy`의 `locked_expired` 문구("다시 5일 연속 달성 시 열려요")가 그대로 맞는 말이 된다.

**화면**(`participant-performance-card.tsx:59-83`)
- effect에서 `getMyPeekPickDays(challengeId)` 를 **먼저** 부른다(잠금 상태에서도 부른다 —
  내 pick 행은 RLS상 본인 것만 보이므로 정보 노출이 아니다).
- 마지막 `pick_date`를 `lastUsedDayKey`로 넘긴다.
- 대상을 고른 **직후에도** 창은 그날 남은 2시간 동안 유지된다(고른 사람 성과를 봐야 하니까).
  → `lastUsedDayKey`는 **오늘이면 무시**한다. 내일부터 카운터가 0이다.
  ⚠️ 이게 가장 헷갈리는 지점이다. 테스트로 못 박는다.

**서버**(새 마이그레이션 `0065_peek_unlock_after_use.sql`)
- `complete_workout`의 0054 블록을 같은 규칙으로 바꾼다:
  `generate_series(0,4)` 고정 5일 대신, **마지막 `pick_date` 다음 날부터** 오늘까지 연속을 센다.
- ⚠️ **`0054`에서 베끼지 마라.** `complete_workout`은 여러 번 덮어써졌다.
  현행 정의는 `docs/db-current-schema.sql`에 있다 (CLAUDE.md §DB 마이그레이션).
- 실행 시점: 함수 `create or replace`뿐이고 기존 행을 안 바꾸므로 **지금 돌려도 안전**하다.
  다만 앱 배포 전에 돌리면 잠깐 "알림은 안 오는데 카드는 열리는" 상태가 된다(무해).
  반대(앱 먼저)는 **"알림 왔는데 잠겨 있는"** 막다른 길이라 나쁘다.
  → **DB 먼저, 앱 나중.**

#### 대안 (더 단순, 추천하지 않음)
`consecutive % 5 === 0`일 때만 연다 — 5·10·15일째. DB 조회가 아예 없고 SQL도 짧다.
버리는 이유: 5일째에 **안 열어 본 사람**도 6일째엔 잠긴다. 사용자 문장은 "**한번 열어 보면** 리셋"이라 사용 여부가 조건이다.

### 파일
- `src/lib/domain/viewing-pass.ts` + `.test.ts`
- `src/lib/challenge.ts` — `getMyPeekPickDays(challengeId): Promise<string[]>` (기존 `getTodaysPeekTarget` 옆)
- `src/components/challenge/participant-performance-card.tsx` (+ `.test.tsx`)
- `supabase/migrations/0065_peek_unlock_after_use.sql` — **사용자가 SQL Editor에서 Run**
- 적용 후 `pnpm db:snapshot`으로 `docs/db-current-schema.sql` 갱신

### 테스트
- 5일 연속 + 사용 기록 없음 → `unlocked`
- 5일 연속 + **어제** 사용 → `locked_progress`, `progressDays` = 1
- 5일 연속 + **오늘** 사용 → 여전히 `unlocked` (당일 창 유지)
- 어제 사용 후 5일 더 연속 → 다시 `unlocked`
- 연속이 끊기면 사용 여부와 무관하게 `locked_progress`
- **회귀선:** `challenge-room-check.mjs`(기준 48/0)에 "어제 사용했으면 오늘 알림이 안 온다" 단언 추가

---

## 7. 순서 · 검증 · 배포

### 작업 순서 (근거: 위험도 × 사용자 체감)

| 배치 | 항목 | 왜 이 순서 |
|---|---|---|
| **A** | 5-1 안전영역, 5-2 복귀 버튼 | 폰에서 **갇혀 있는** 상태를 먼저 푼다. 순수 CSS/z-index라 위험이 가장 낮다 |
| **B** | 3 거리 0.1, 1 무게 전파, 2 마지막 세트 응원 | 전부 `record` 화면 한 곳. 한 번 띄워 셋을 같이 확인한다 |
| **C** | 4 배지 등급순 | 홈 화면. 독립적. B 계정 필요 |
| **D** | 5-3 종목 교체·건너뛰기 | 새 기능. A가 배포돼 접기가 살아난 뒤에 얹는다 |
| **E** | 6 열람권 리셋 | 마이그레이션 동반. DB Run → 앱 배포 순서를 지켜야 한다 |

배치마다 커밋을 나눈다. E는 반드시 마지막이다.

### 5번 재현 — 고치기 전에 폰에서 한 번

사용자에게 요청할 것(개발 서버로는 재현이 안 된다 — PC엔 inset이 0이다):

| 조작 | 지금 기대(버그) | 고친 뒤 기대 |
|---|---|---|
| 홈 화면에 설치한 GND 앱에서 운동 시작 | 오버레이가 뜬다 | 같음 |
| 화면 **맨 위** `▾ 최소화` 누르기 | 아무 일도 안 일어난다 / 상태바가 반응 | 오버레이가 접히고 하단에 `다시 열기 ▴` |
| `취소` 누르기 | 아무 일도 안 일어난다 | `운동을 취소할까요?` 확인창 |
| 휴식 중에 접기 | 복귀 버튼이 휴식 바에 가려 안 보인다 | 둘 다 보인다 |

### 검증 (CLAUDE.md 절차)

1. **개발 서버에서 눈으로 본다** — `pnpm dev` → `localhost:3000`
   - 1·2·3·5 → **A 계정만**
   - 4·6 → **A + B 두 계정** (배지·챌린지 열람은 상대가 있어야 성립)
     `node scripts/dev-fixture.mjs create` · `challenge`
     ⚠️ 크롬 = A, 엣지 = B. 같은 브라우저의 새 창은 쿠키를 공유해 **한 계정으로 덮인다**
2. **"에러가 안 났다"가 아니라 "의도한 것이 보이는가"**
   - 1 → 무게 내리고 **뒤 세트 카드 숫자를 눈으로 센다**
   - 2 → 마지막 세트에서 응원 문구가 **보이고**, 그 전 세트에는 **없다**
   - 3 → `+` 한 번에 3.2 → 3.3
   - 4 → 친구 행 배지 3장이 **등급 높은 것부터**
   - 5 → 위 표대로 **폰에서**
   - 6 → 오늘 대상 고르기 → **내일 다시 잠겨 있는지**(시스템 날짜를 못 돌리면 픽스처 pick 행을 어제 날짜로 심어 확인)
3. 회귀 스크립트 — 전부 `0 failed`
   `rls-test`(128) · `poke-levelup-check`(14/14) · `challenge-consent-test`(22) ·
   `challenge-room-check`(48) · `challenge-invite-link-check`(25)
4. `lint` · `typecheck` · 전체 `test` · `build`
5. 사용자 승인
6. `git worktree` 분리 후 `vercel --prod`
7. 프로덕션 실물 확인 — 번들 grep으로 새 문구 확인 + **폰에서 5번 재확인**

### 문서 동기화 (CLAUDE.md "같은 사실을 두 곳에 두지 않는다")
- `PROGRESS.md`
- `src/lib/domain/release-notes.data.json` — 6건 릴리스 항목
- 회귀 단언이 늘면 CLAUDE.md의 기준선 표 갱신
- 마이그레이션 적용 후 `docs/db-current-schema.sql`

### 결정 (사용자 확정 2026-08-09) ✅
1. **1번** — **네 칸 전부** 전파 (무게·횟수·거리·시간)
2. **2번** — **새 문구**를 쓴다. 톤은 **탁재훈식 유머 — 가볍게 던지되 속은 묵직하게** (추가 지시)
3. **5-3** — **둘 다** (`바꾸기` + `건너뛰기`)
4. **6번** — **사용 기준 리셋** ("한번 열어 보면 리셋")

---

## 8. 구현 상태 (2026-08-09)

코드·테스트는 전부 들어갔다. **화면 확인과 배포는 남아 있다.**

| # | 상태 | 주요 파일 |
|---|---|---|
| 5-1 안전 영역 | ✅ | `active-session-overlay.tsx` (`paddingTop: calc(env(safe-area-inset-top) + 12px)`, 버튼 `h-8` → `h-11`), `cheer-banner.tsx`(같은 원인) |
| 5-2 복귀 버튼 | ✅ | **`lib/domain/floating-bars.ts` 신설** — 휴식 바와 복귀 버튼의 자리·z를 한 곳에서 정하고 `barsOverlap`으로 겹침을 단언한다 |
| 3 거리 0.1 | ✅ | `set-input.ts` (`step: 0.1`, 칩 `[-1, -0.1, 0.1, 1]`) |
| 1 값 전파 | ✅ | `set-input.ts`의 `propagateAmount`, `record/page.tsx`의 `applyAmountFromHere` + 토스트 |
| 2 마지막 세트 응원 | ✅ | `workout-complete-message.ts`의 `lastSetCheer` (문구 7개, 탁재훈 톤) |
| 4 배지 등급순 | ✅ | `badges.ts`의 `compareBadgeShowcase`·`RARITY_RANK`·`TIER_RANK`, `friends.ts`, `recentKeys` → **`showcaseKeys`** 개명 |
| 5-3 교체·건너뛰기 | ✅ | `session-flow.ts`의 `canReplaceExercise`·`replaceExercise`·`skipExercise`, 오버레이 버튼 2개, `closePicker()` |
| 6 열람권 리셋 | ✅ 코드 / ⏳ **DB 미적용** | `viewing-pass.ts`(`lastUsedDayKey`), `challenge.ts`의 `getLastPeekUseDay`, **`supabase/migrations/0065_peek_unlock_after_use.sql`** |

**검사 결과 (실측):** `lint` 0 · `tsc --noEmit` 0 · `vitest` **1510 passed / 111 files** · `next build` 성공.
착수 전 1499건 → **+11건**.

### 🔴 구현 중 사용자가 잡은 것 (2026-08-09)

**① "A 계정에서 운동완료 버튼이 안눌림" — 5-3이 만든 회귀였다.**
`skipExercise`가 종목을 배열에서 빼는데 **초점 인덱스를 안 옮겼다.** 같은 인덱스가
*다음* 종목을 가리키게 되고, 그 자리가 이미 완료된 세트면 증상 셋이 한꺼번에 났다:
`onCompleteSet`이 `focusedSet.done`에서 return(**버튼이 안 눌린다**) · `⇄ 운동 바꾸기`가
사라진다 · 마지막 세트 안내가 안 뜬다. 사용자가 보낸 화면에 **바꾸기 버튼이 없던 것**이
결정적 단서였다.
→ `ensurePendingFocus`(focus-exercise.ts) 신설. ⚠️ `advanceSetFocus`로 대신할 수 없다 —
저건 `setIndex + 1`부터 찾아서 **지금 자리가 미완료인데도 건너뛴다.**
→ **배열을 줄이는 네 경로 전부**에 `refocusPending`을 걸었다: `handleSkipExercise` ·
`replaceFocusedExercise` · `removeExercise` · 순서 변경 시트의 삭제.

**② "접었다 펴도 수정이 적용되나?" — 값은 되지만, 삭제는 ①과 같은 버그였다.**
값(무게·횟수·세트 수·교체)은 전부 `draft` 하나에 있고 접기는 `minimized` 플래그만
바꾸므로 그대로 반영된다. 그런데 **접은 채 카드에서 종목을 삭제**하는 경로
(`removeExercise`)가 ①과 구조가 똑같았다. 접기가 폰에서 안 눌리던 동안엔 아무도 못
밟던 길이라, **접기를 고치는 순간 드러날 버그**였다. 같이 막았다.

**③ 건너뛰기는 종목을 통째로 뺀다** (사용자 결정 *"건너뛰면 그 종목은 통째로 오늘
기록에서 빼줘"*). 처음엔 완료분을 남겼는데 바꿨다. 되돌릴 수 없는 삭제라 **완료한
세트가 있으면 확인창을 한 번 띄운다**(0세트면 안 묻는다 — 흔한 경우까지 물으면 읽지
않고 누르는 버릇이 든다). 버튼 문구도 `건너뛰기` → **`이 종목 빼기`**로 바꿨다.

**④ `오류: [object Object]` (6건 밖, 실측으로 발견).** 개발 서버에서 운동 시작이 RLS로
막혔을 때 토스트가 통째로 저랬다. 원인은 `String(e)` — **Supabase가 던지는
`PostgrestError`는 `Error`가 아니라 평범한 객체**다. 실제 메시지는
`permission denied for table workout_sessions (42501)`로 객체 안에 멀쩡히 있었다.
이 문구는 **버그 신고(`bug_reports`)에도 그대로 실려** 다음 사람이 원인을 못 찾는다.
→ `domain/error-text.ts` 신설(테스트 10건, "절대 `[object Object]`를 내지 않는다" 포함).

### 설계에서 달라진 점
- **`floating-bars.ts`를 새로 만들었다.** 계획에는 "복귀 버튼 z를 40으로"만 있었는데, 그러면 같은 사실(`72px`)이 여전히 두 파일에 흩어져 있어 **겹침을 코드로 증명할 수 없다.** 두 막대의 자리·z를 한 곳에 모아 `barsOverlap` 단언을 걸었다.
- **0065에서 `complete_workout_v2` 전체를 다시 쓰지 않고**, 0054의 인라인 블록을 `notify_challenge_peek_unlock(uuid)`로 **빼냈다.** 조건이 150줄짜리 함수 안에 박혀 있으면 화면 규칙과 맞출 때마다 전체를 다시 써야 한다. 스냅샷 대비 diff는 의도한 두 곳뿐임을 확인했다(선언 제거 + 블록 → `perform`).
- **`scripts/peek-reset-check.mjs`를 추가했다.** 계획은 `challenge-room-check.mjs`에 단언을 얹는 것이었는데, 이 검사는 **과거 날짜 세션을 심어야** 성립해서(기존 스크립트에 그 수단이 없다) 따로 뺐다. SQL 함수와 TS 규칙의 답을 같은 입력으로 대조한다.

### ⏳ 남은 일 — 순서대로
1. **사용자가 `0065`를 SQL Editor에서 Run** (§6. 앱 배포보다 **먼저**)
2. `node scripts/peek-reset-check.mjs` — 0065 적용 전에는 첫 단언부터 실패한다
3. **개발 서버 화면 확인** (§7 검증) — 1·2·3·5는 A 계정, 4·6은 A+B
4. **폰에서 5번 재현·재확인** — 안전 영역은 PC에 inset이 0이라 개발 서버로는 증명이 안 된다
5. 회귀 스크립트 5종 → 전부 `0 failed`
6. 사용자 승인 → 워크트리 분리 → `vercel --prod` → 프로덕션 실물 확인
7. 적용 뒤 `pnpm db:snapshot`으로 `docs/db-current-schema.sql` 갱신
