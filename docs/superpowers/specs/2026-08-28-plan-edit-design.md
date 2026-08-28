# 계획한 운동 수정 — 설계

**날짜:** 2026-08-28
**요구:** "달력에서 이미 계획한 운동은 수정이 안 되는데, 계획한 운동도 수정할 수 있게 하고 싶다"
**추가 지시:** 기존 기능·코드를 재사용해 효율을 극대화한다 (first-principles)

---

## 1. 문제의 본질

계획 하나는 `workout_plans` 한 행이고, 실체는 `exercises: PlanExercise[]`
(+ 인터벌이면 `tabata_minutes`)다. **"수정한다" = 그 배열을 다른 배열로 바꿔
같은 행에 다시 쓴다.** 그 이상도 이하도 아니다.

지금은 달력의 예정표 카드에서 `삭제` · `날짜 이동` · (오늘이면) `운동 시작하기`만
할 수 있다. `새 운동 계획 만들기` 버튼은 `!selectedPlan`일 때만 나오므로 계획이
있는 날은 진입로가 아예 없다.

## 2. 폐기한 가정

| 가정 | 판정 | 근거 |
|---|---|---|
| 편집하려면 DB 작업이 필요하다 | **폐기** | `workout_plans_update_own`(0066)이 이미 UPDATE를 허용하고 `saveWorkoutPlan`은 `onConflict: user_id,plan_date` upsert다. 마이그레이션 0건 |
| 예정표 편집 시트를 새로 만들어야 한다 | **폐기** | 세트·횟수·무게를 조절하는 화면이 이미 있다 — `ExerciseSetupSheet` |
| 종목 이름을 카탈로그에서 찾아 복원해야 한다 | **폐기** | 그 화면이 실제로 읽는 건 `id`(key)·`name`·`exercise_type`·`measure` 넷뿐이고 `PlanExercise`에 셋이 다 있다. `item` 타입을 좁히면 카탈로그 조회도, "삭제된 커스텀 종목" 예외도 사라진다 |
| `SetupPlan`으로 왕복하면 된다 | **보완** | 지난 기록 복사 계획은 세트마다 무게가 다르다(60/65/70). 대표값 하나로 왕복시키면 조절을 **펼치기만 해도** 60/60/60으로 뭉개진다 |

## 3. 폐기한 대안 — 안 Z: "기록 화면을 편집기로 쓴다"

`수정` → `onLoadPlan(plan)`으로 계획을 기록 탭 draft에 담고 거기서 고친 뒤
예정표로 되저장. 새 컴포넌트 0개에 순서 바꾸기·세트별 값·자세 안내까지 공짜라
재사용은 가장 크다.

**그런데 깨진다.** 8월 30일 계획을 고치려고 담았는데 기록 화면에는
`운동 시작하기`가 살아 있다 — 미래 계획으로 오늘 운동을 시작해 버린다. draft는
앱에 하나뿐이라 오늘 담아둔 목록도 날아간다. 편집하러 갔다가 기록을 망치는
길은 재사용 이득보다 비싸다.

## 4. 결정한 설계

### 4.1 사용자 눈에 보이는 것

달력 → 오늘 이후 날짜 → 예정표 카드에 `수정` 버튼이 `삭제` 위에 붙는다.

| 예정표 종류 | `수정`을 누르면 |
|---|---|
| 일반 | **「예정표 고치기」 시트** — 종목 빼기·더하기·세트/횟수/무게 조절 |
| 🔥 인터벌 | 인터벌 시트가 계획한 종목·코스가 채워진 채 열린다 (기존 계획 모드) |
| 📋 프로그램 회차 | **버튼 없음** — 지금 그대로 `이 회차만 삭제` · `남은 일정 다시 잡기` |

프로그램 회차를 뺀 이유: RLS가 `program_enrollment_id is null`을 요구해 클라이언트가
못 고치고, 유지보수가 짜준 간격·강도 설계를 흐트러뜨린다. (사용자 결정 2026-08-28)

### 4.2 새로 만드는 편집 UI: 없음

| 필요한 것 | 어디서 오나 |
|---|---|
| 종목 목록 + 요약줄 + 조절 펼치기 | `ExerciseSetupSheet` 그대로 |
| 세트± / 횟수± / 무게± / 「운동 중 입력」 | 같은 파일의 기존 스테퍼 그대로 |
| 종목 삭제 `×` | `onRemove?` prop 추가 — 안 넘기면 안 보인다(피커는 무변화) |
| `＋ 종목 추가` | `onAdd?` prop → 달력이 **이미 렌더 중인** `ExercisePicker`를 `edit` 모드로 연다 |
| 확인 버튼 문구 | `confirmLabel?` prop (기본값은 지금의 "운동 N개 추가하기") |
| 저장 | `saveWorkoutPlan` upsert 그대로 |
| 인터벌 수정 | `TabataSheet` + `initialPicked`·`initialMinutes`·`onPlan` 전부 이미 있음 |

### 4.3 유일한 신규 로직 — 세트 값 보존

`PlanSet[]`을 원본으로 두고 **바뀐 항목만** 반영한다.

| 사용자가 바꾼 것 | 결과 |
|---|---|
| 세트 3 → 4 | 마지막 세트를 복사해 뒤에 붙인다 (60/65/70/**70**) |
| 세트 3 → 2 | 뒤에서 자른다 (60/65) |
| 목표 횟수 · 무게 | 그 순간 전 세트에 일괄 적용 |
| 안 건드림 | 원본 그대로 |

`src/lib/domain/plan-edit.ts`의 순수 함수. 이것만 새 로직이다.

### 4.4 저장

```
saveWorkoutPlan({
  userId, planDate: plan.planDate,
  sourceSessionId: plan.sourceSessionId,   // 원본 세션 연결을 잃지 않는다
  exercises,
  tabataMinutes: plan.tabataMinutes,        // 일반 계획은 null
})
```

- upsert가 같은 행을 UPDATE한다 — `id`·`created_at` 유지
- 종목이 0개가 되면 저장 대신 안내. 통째 삭제는 기존 `삭제` 버튼의 일이다
- 과거 날짜는 애초에 `수정` 버튼을 내지 않는다 (RLS의 `plan_date >= 오늘`과 같은 규칙)

### 4.5 `＋ 종목 추가`

달력이 이미 렌더 중인 `<ExercisePicker>` 하나를 `planPickerMode`로 갈라 쓴다.
`new`면 지금처럼 저장하고, `edit`면 편집 중인 목록 뒤에 **중복 없이** 덧붙인다.

- 검색 · 추천 · 내 루틴 · 지난 기록 네 경로 모두 지원한다
- 지난 기록은 `getSessionExerciseStructure`가 `bodyPart`까지 주므로 매핑이 짧다
- **인터벌 기록은 막는다** — 코스(`tabataMinutes`)를 실을 곳이 일반 계획에 없다.
  같은 기록을 어디서 부르느냐로 결과가 갈리지 않게 토스트로 돌려보낸다

### 4.6 안 하는 것 (YAGNI)

- 순서 바꾸기 — 요구 밖. 추가한 종목은 맨 뒤에 붙는다
- 프로그램 회차 편집 — §4.1
- 과거 날짜 계획 편집 — RLS가 막는다

## 5. 파일

| 파일 | 무엇 |
|---|---|
| `src/lib/domain/plan-edit.ts` (새) | 세트 보존 규칙 · `PlanExercise` ↔ `SetupEntry` |
| `src/lib/domain/plan-edit.test.ts` (새) | 뭉개짐 방지 회귀 |
| `src/components/record/plan-edit-sheet.tsx` (새) | 시트 껍데기 + `ExerciseSetupSheet` 조립 |
| `src/components/record/plan-edit-sheet.test.tsx` (새) | 시트 동작 |
| `src/components/record/exercise-setup-sheet.tsx` | `item` 타입 좁힘 + 선택 prop 3개 |
| `src/components/record/calendar-view.tsx` | `수정` 버튼 · 편집 상태 · 저장 · 피커 `edit` 모드 · 인터벌 재진입 |
| `src/components/record/calendar-view.test.tsx` | 진입 · 저장 · 프로그램엔 버튼 없음 |

**DB 마이그레이션 없음.**

## 6. 검증

- `plan-edit` 순수 함수 테스트 — 특히 "세트 수만 바꿨을 때 60/65/70이 살아남는가"
- 시트 테스트 — 삭제 `×`, 추가 버튼, 0개일 때 저장 막힘
- 달력 테스트 — 일반엔 `수정`이 있고 프로그램엔 없다, 저장이 upsert를 부른다
- `pnpm dev`에서 실제 화면 조작 (프로젝트 `CLAUDE.md` §개발 환경에서 먼저 확인한다)
