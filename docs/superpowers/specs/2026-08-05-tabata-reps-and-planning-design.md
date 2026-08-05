# 타바타 — 횟수 기록과 계획·복사 연결 (설계)

**날짜** 2026-08-05 · **요청** 사용자
**상태** 사용자 승인 완료 (범위 2건 확정: 타바타 그대로 되살리기 · 과거 기록 백필)

---

## 문제

### ① 타바타 기록의 횟수가 언제나 0이다

`lib/domain/tabata.ts`의 `tabataDraftExercises`가 종목마다 `reps: 0`짜리 세트 1개를
만들고, 그 값이 그대로 저장된다. 운영 DB의 타바타 6세션(7/20~8/3) **전부** 세트가
`reps: 0`이다.

```
2026-08-03 8분 · 점프 스쿼트 / 마운틴 클라이머 / 타이슨 푸시업 / 벤드 레터럴 레이즈
  → 4종목 모두 [{"reps":0, "is_completed":true, ...}]
```

달력 상세의 세트 표시(2026-08-04에 추가)에서 "0회"로 보인다.

### ② 타바타가 계획·복사 흐름과 끊겨 있다

두 군데가 막혀 있다.

| 어디 | 지금 |
|---|---|
| 타바타 시트 → 운동 고르기 | `tabata-sheet.tsx:280`이 `pastSessions={[]}`를 넘기고 `onPickPast`가 항상 `false`를 돌려준다. **'지난 기록' 탭이 늘 비어 있고 '내 루틴' 탭은 아예 없다.** 매번 카탈로그에서 4개를 새로 찾아야 한다 |
| 달력 예정표 | 타바타라는 개념이 없다. 지난 타바타를 📋복사하면 **일반 종목 4개**로만 저장되고, 그날 "운동 준비하기"를 눌러도 맨몸 운동 4개가 뜬다 |

---

## 설계

### ① 횟수 = 코스 분수 ÷ 2

타바타 4분은 20초 × 8라운드이고 구성 운동이 4개다. 즉 **종목당 2라운드**.
8분은 4, 16분은 8.

```ts
/** 코스 분수 → 종목당 라운드 수 (4→2, 8→4, 16→8) */
export function tabataRepsForMinutes(minutes: TabataMinutes): number;
```

`tabataDraftExercises(picked, makeKey, minutes)`가 이 값을 세트 `reps`에 넣는다.
저장 경로(`saveSessionExercises`)는 맨몸·reps 종목의 `reps`를 이미 그대로
저장하므로 손대지 않는다.

⚠️ **알고 받는 대가.** 타바타 종목은 `bodyweight`이라 `foldPeriodStats`가
`bodyweightReps += s.reps`로 센다. 4분 타바타 1건당 맨몸 횟수 실적이 8회 오른다
(4종목 × 2). 사용자 승인 사항이다.

⚠️ `TABATA_EXERCISE_COUNT`가 바뀌면 이 식(분수 ÷ 2)도 같이 바뀌어야 한다.
`(minutes * 60 / 30) / TABATA_EXERCISE_COUNT`를 그대로 쓰고 테스트로 고정한다.

### ② 타바타 시트에서 지난 기록·내 루틴으로 4종목 채우기

`tabata-sheet.tsx`의 `pastSessions={[]}` 하드코딩을 걷어내고 record 페이지가 이미
갖고 있는 `pastSessions`·`routines`를 그대로 넘긴다. **새 DB 질의는 없다** —
`CalendarSession`에 `exerciseNames`가 이미 들어 있고, `WorkoutRoutine.exercises`도
이름을 갖고 있다.

```ts
/** 이름 목록 → 카탈로그에서 찾은 구성 운동 (중복 제거, 최대 4개) */
export function tabataPickFromNames(
  names: readonly string[],
  catalog: CatalogExercise[],
): CatalogExercise[];
```

이름 정규화는 `workout-import.ts`의 `normalizedName`과 같은 규칙
(`trim().toLocaleLowerCase("ko-KR")`)을 쓴다. 카탈로그에 없는 이름은 건너뛴다.

지난 **타바타**를 고르면 종목뿐 아니라 **코스(4/8/16분)까지** 그때 것으로 맞춘다
(`CalendarSession.tabataMinutes`). 일반 운동 기록을 골라도 앞 4종목이 채워진다.
하나도 못 찾으면 시트를 닫지 않고 안내 문구를 띄운다.

record 페이지의 지난 기록 로딩(`openExercisePicker` 안에 있다)을
`loadPastSessions()`로 빼서 타바타 버튼에서도 부른다. 안 그러면 타바타 시트의
'지난 기록' 탭이 여전히 비어 있다.

### ③ 예정표에 타바타 (마이그레이션 0059)

```sql
alter table public.workout_plans add column tabata_minutes smallint
  check (tabata_minutes is null or tabata_minutes in (4, 8, 16));
```

**지금 실행해도 안전하다.** 운영에 떠 있는 앱이 참조하지 않는 새 컬럼이다.
`move_workout_plan`은 `RETURNS workout_plans` 행타입이라 RPC는 손대지 않는다
(PostgREST 스키마 캐시만 `notify pgrst, 'reload schema'`로 갱신한다).

흐름:

1. 달력에서 지난 타바타 📋복사 → 예정표에 `🔥 타바타 8분` 배지와 함께 저장
2. 그날 예정표에 "**타바타 준비하기**" 버튼 → 타바타 시트가 4종목·코스까지
   채워진 채 열린다
3. 타바타를 완료하면 그 예정표가 사라진다 (일반 운동과 동일)

3번을 위해 `beginTabata`가 `emptyDraft`로 갈아엎을 때 `scheduledPlanId`를
명시적으로 이어받아야 한다. 지금은 버려져서 완료해도 예정표가 남는다.

`TabataSheet`는 닫을 때 언마운트되므로(`open`이 false면 `null` 반환) 예약된
종목·코스는 `initialPicked`·`initialMinutes` prop의 `useState` 초기값으로 넣으면
된다. effect 안에서 setState 하지 않는다 (기존 주석 "교훈 4").

**범위 밖 (사용자 결정).** 달력 빈 날짜에서 타바타를 **새로 짜는** 경로는 만들지
않는다. 한 번도 타바타를 안 해봤으면 계획할 것도 없다.

### ④ 과거 6건 백필 (마이그레이션 0060 — 앱 배포 뒤 실행)

```sql
update public.workout_sets ws set reps = s.tabata_minutes / 2
  from public.workout_exercises we
  join public.workout_sessions s on s.id = we.session_id
 where ws.workout_exercise_id = we.id
   and s.tabata_minutes in (4, 8, 16)
   and coalesce(ws.reps, 0) = 0;
```

0059와 파일을 나눈다. 0059는 지금 실행해야 개발 서버에서 화면을 볼 수 있고,
0060은 기존 행을 바꾸는 UPDATE라 배포 뒤에 실행한다 (CLAUDE.md §DB 마이그레이션).

---

## 검증

### 단위 테스트

| 대상 | 무엇을 고정하나 |
|---|---|
| `tabataRepsForMinutes` | 4→2 · 8→4 · 16→8. 종목 수 상수와 연동됨 |
| `tabataDraftExercises` | 넘긴 분수가 세트 `reps`에 들어간다 |
| `tabataPickFromNames` | 매칭 · 중복 제거 · 미매칭 건너뛰기 · 4개 초과 자르기 |
| `parsePlanExercises` | 계획 세트의 0 아닌 reps가 살아남는다 (기존 테스트로 이미 덮임) |

`scripts/workout-plan-test.mjs`에 `tabata_minutes` 저장 → 조회 → 날짜 이동 후에도
유지되는지 왕복 단언을 더한다.

### 개발 서버 화면 확인 — A 계정 하나

사회적 기능이 아니므로 B는 쓰지 않는다 (CLAUDE.md §사회적 기능 표).

| # | 조작 | 기대 |
|---|---|---|
| ⓐ | 4분 타바타를 종목 4개로 시작 → 음원 끝까지 → 달력 그날 상세 펼치기 | 종목마다 **2회**. 0회가 아니다 |
| ⓑ | 타바타 → 운동 고르기 → '지난 기록' 탭 | 세션 목록이 뜬다. 지난 8분 타바타를 누르면 **4종목이 채워지고 코스가 8분으로 바뀐다** |
| ⓑ' | '내 루틴' 탭 | 루틴을 누르면 앞 4종목이 채워진다 |
| ⓒ | 달력 → 지난 타바타 📋복사 → 내일 | 예정표에 `🔥 타바타 8분` 배지 |
| ⓓ | 그 예정표를 오늘로 이동 → "타바타 준비하기" | 시트가 4종목·8분으로 열린다. 완료하면 **예정표가 사라진다** |

회귀: `rls-test`(128/0) · `poke-levelup-check`(14/14) ·
`challenge-consent-test`(22/0) · `challenge-room-check`(48/0) · lint · typecheck ·
전체 test · build.
