# 비프음 증폭 + 성과 개선 칭찬 알림 + 배지 시스템 설계

작성 2026-07-21. 사용자 승인 완료.

## 목표

1. 휴식 카운트다운 비프음이 음악에 묻히지 않도록 음량을 2배로 키운다.
2. 복사 예정표로 한 운동뿐 아니라 **같은 구성의 직전 운동보다 성과가 좋아진 모든 운동**을 기록 갱신으로 판정한다.
3. 갱신 시 크루에게 **"칭찬해주세요"** 알림을 보내고, 본인은 **모으는 배지**를 취득한다.
4. 배지는 달력 화면에 진열하고, 앞으로 종류를 하나씩 늘려갈 수 있는 구조로 만든다.

## 현재 상태 (변경 대상)

- 비프음: `src/lib/rest-countdown-audio.ts`의 `BEEP_GAIN = 0.25`. 웨이트·맨몸 휴식 5·4·3·2초 짧은 삠 + 1초 긴 삐임(`src/lib/domain/rest-countdown.ts`). 유산소는 대상이 아니다.
- 기록 갱신: `sourceSessionId`(복사 예정표)가 있는 운동만 판정한다(`src/app/(tabs)/record/page.tsx` `handleFinish`). 판정은 `src/lib/domain/record-beaten.ts`의 `effortTotals` + `recordBeatenNote`.
- 크루 알림: `0018_record_beaten.sql`의 `mark_record_beaten` RPC가 `'🏅 기록 갱신!'` / `'{닉네임}님이 지난 기록을 넘었어요 — {문구}'`를 크루원에게 insert한다. 칭찬 유도 문구가 없다.
- 🏅 표시: `record_note` 문자열이 있는 세션에만 붙는 인라인 라벨(피드 카드·달력 상세). 모으는 배지가 아니다.
- 마지막 마이그레이션은 `0019_tabata.sql`이며 0001~0019는 전부 적용 완료다. 이번 작업의 신규 파일은 `0020`이다.

## 1. 비프음 2배

- `BEEP_GAIN` 0.25 → **0.5**. 주석에 2026-07-21 재조정 이유를 남긴다.
- `src/lib/rest-countdown-audio.test.ts`의 `linearRampToValueAtTime` 1번째 호출 단언 0.25 → 0.5.
- 사인파 단일 오실레이터라 최대 진폭이 0.5를 넘지 않아 클리핑이 없다.
- 확인: 실기기에서 음악(멜론 등) 재생 중 휴식 비프음이 들리는지. 아이폰은 벨소리 모드여야 한다(기존 제약).

## 2. 개선 판정 범위 확대

### 비교 대상 찾기

`src/lib/domain/record-beaten.ts`에 순수함수를 추가한다.

```
findComparableSession(
  currentExerciseNames: string[],
  candidates: ComparableCandidate[],
): ComparableCandidate | null
```

`ComparableCandidate = { id: string; completedAt: Date; exerciseNames: string[]; isTabata: boolean }`

규칙:

- **종목 이름 집합이 정확히 일치**하는 후보만 대상이다. 순서와 중복은 무시하고 집합으로 비교한다.
- 조건을 만족하는 후보 중 `completedAt`이 가장 늦은 1건을 반환한다.
- **타바타 세션(`isTabata`)은 후보에서 제외**한다. 타바타는 세트 실적이 0이라 비교 대상이 되면 판정이 무의미해지고, 정상 후보를 가린다.
- 후보가 없으면 `null`.

집합 완전 일치를 쓰는 이유: 총량 비교가 공정하려면 구성이 같아야 한다. 종목을 하나 추가하면 볼륨은 당연히 늘어나므로 갱신이 아니다.

### 완료 흐름 연결

`handleFinish`의 기록 갱신 블록을 다음으로 바꾼다.

1. 비교 대상 결정 — `draft.sourceSessionId`가 있으면 그것을 쓴다(기존 동작 보존). 없으면 `getCompletedSessions(userId)`로 내 완료 세션을 가져와 `findComparableSession`으로 찾는다. 방금 완료한 세션(`s.id`)은 후보에서 제외한다 — `completeWorkout` 직후 조회하면 자기 자신이 목록에 포함되므로 반드시 걸러야 한다.
2. 비교 대상이 없으면 판정하지 않는다.
3. 있으면 기존과 동일하게 `getSessionLogExercises` → `effortTotals` → `recordBeatenNote` → 갱신이면 `markRecordBeaten(s.id, note)`.
4. **판정·RPC 실패는 완료 흐름을 막지 않는다**(비프음 원칙 유지). 실패 시 `recordNote = null`로 두고 완료를 계속한다.

`getCompletedSessions`는 이미 `exerciseNames`와 `tabataMinutes`를 반환하므로 새 쿼리가 필요 없다.

## 3. 칭찬 CTA 알림

`mark_record_beaten` RPC의 크루 알림 문구를 교체한다.

- title: `🏅 기록 갱신! 칭찬해주세요`
- body: `{닉네임}님이 지난 기록을 넘었어요 — {문구}. 칭찬 한마디 남겨주세요! 👏`

푸시 URL 매핑(`record_beaten` → `/feed`)은 그대로 둔다. 피드에서 리액션·응원을 바로 보낼 수 있다.

## 4. 배지 시스템 (0020)

### 데이터

```
user_badges (
  user_id    uuid not null references profiles(id) on delete cascade,
  badge_key  text not null,
  session_id uuid references workout_sessions(id) on delete set null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_key)
)
```

- RLS: 본인 행 `select`만 허용한다. `insert`/`update`/`delete`는 정책을 만들지 않아 definer RPC 경로로만 지급된다(위조 차단).
- 크루원 배지 열람은 이번 범위에 넣지 않는다.

### 카탈로그

`src/lib/domain/badges.ts` — 키 → 이모지·이름·설명·정렬 순서 상수 배열. 첫 3종:

| badge_key | 이모지 | 이름 | 조건 |
|---|---|---|---|
| `record_beaten_1` | 🏅 | 첫 기록 갱신 | 기록 갱신 1회 |
| `record_beaten_5` | 💪 | 기록 갱신 5회 | 기록 갱신 5회 |
| `record_beaten_10` | 🔥 | 기록 갱신 10회 | 기록 갱신 10회 |

**앞으로 배지 추가 = 이 배열에 한 줄 + 0021 이후 마이그레이션에 취득 규칙 한 줄.**

### 취득 규칙의 단일 원천

취득 임계값은 **SQL에만** 둔다. TS 카탈로그는 표시용 메타(이모지·이름·설명)만 갖는다. 양쪽에 규칙을 두면 어긋날 때 조용히 틀리기 때문이다. 임계값 검증은 실 DB 스크립트가 담당한다.

### 지급 시점

`mark_record_beaten` RPC를 확장한다. `record_note` 기록과 크루 알림 이후:

1. 내 세션 중 `status = 'completed'` · `deleted_at is null` · `record_note is not null`인 개수를 센다(이번 세션 포함). 삭제한 운동은 세지 않는다.
2. 개수가 임계값(1·5·10)에 도달한 배지를 `insert ... on conflict do nothing`으로 지급한다.
3. **새로 지급된 배지가 있을 때만** 본인에게 `badge_earned` 알림 1건을 넣는다. 이미 갖고 있으면 알림이 없다.
4. `notifications.type` 체크 제약에 `badge_earned`를 추가한다(0018과 같은 이름 무관 교체 패턴).
5. 푸시 URL 매핑에 `badge_earned` → `/record`를 추가한다(달력 화면에 배지가 있으므로).

전체가 한 트랜잭션이라 문구 기록과 배지 지급이 따로 놀지 않는다.

### 표시 — 달력 화면

`src/components/record/badge-shelf.tsx` 신규. 달력 화면 상단(월 요약 근처)에 배치한다.

- 카탈로그 전체를 정렬 순서대로 칩으로 나열한다.
- 획득한 배지는 이모지와 이름을 또렷하게, **미획득 배지는 흐리게(잠금) 표시**해서 모으는 재미를 만든다.
- 칩을 탭하면 바텀시트로 이름·설명을 보여주고, 획득한 배지는 획득 일시를 함께 보여준다.
- 조회는 `src/lib/badges.ts`의 `getMyBadges()` — `user_badges` 본인 행 조회.
- 실패해도 달력 본체는 정상 동작해야 한다(배지 영역만 숨김).

## 테스트

### unit (TDD)

- `findComparableSession`: 집합 일치 후보 선택 · 순서 다른 동일 집합 일치 · 종목 추가/누락 시 불일치 · 최근 것 우선 · 타바타 후보 제외 · 후보 없음 → null · 자기 자신 제외.
- 배지 카탈로그: 정렬 순서 유지 · 획득/미획득 병합 결과(잠금 표시) · 미지의 badge_key가 와도 깨지지 않음.
- 푸시 URL 매핑에 `badge_earned` 추가(기존 `push.test.ts` 케이스 확장).

### 실 DB

- `scripts/badge-test.mjs` 신규: 1회 갱신 시 `record_beaten_1` 지급 · 같은 배지 재지급 없음(중복 알림 없음) · 5회째에 `record_beaten_5` 추가 지급 · 타인이 직접 `user_badges` insert 시도 차단 · 본인만 조회 가능 · `badge_earned` 알림 생성. 픽스처는 실행마다 고유 닉네임을 쓰고 종료 시 크루→계정 순으로 정리한다(교훈 13).
- `scripts/record-beaten-test.mjs`: 변경된 알림 문구에 맞춰 단언을 갱신한다.

### 전체 게이트

unit · typecheck · lint(오류 0) · build · `rls-test` 107 · `workout-plan-test` 15 · `challenge-photo-test` 8 · `briefing-integration-test` 8 · `push-rls-test` 8 · `record-beaten-test` 8 · `badge-test`(신규).

### 실기기

- 음악 재생 중 휴식 비프음이 들린다.
- 같은 구성으로 직전보다 더 한 운동 → 완료 화면 축하 · 피드 🏅 · 크루 폰에 "칭찬해주세요" 푸시.
- 달력 화면에 배지 진열이 보이고 첫 배지가 획득 상태로 바뀐다.

## 제외 범위 (YAGNI)

- 배지 알림 토글(6번째 알림 설정)
- 피드의 특정 세션 딥링크
- 종목별 개인 최고기록(PR) 배지
- 배지 공유 이미지, 크루원 배지 열람

## 마이그레이션 요약

**0020_badges.sql** — ① `user_badges` 테이블 + 본인 select RLS ② `notifications.type` 체크에 `badge_earned` 추가 ③ `mark_record_beaten` 교체(칭찬 CTA 문구 + 배지 지급 + 본인 알림). 사용자가 SQL Editor에 1회 적용한다. **0001~0019는 적용 완료이므로 재실행하지 않는다.**
