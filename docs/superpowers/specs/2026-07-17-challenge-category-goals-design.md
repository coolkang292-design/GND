# 챌린지 목표 개편 — 카테고리 우선 모델 (웨이트·유산소·맨몸)

작성일: 2026-07-17
상태: 설계 확정 (구현 대기)

## 배경 / 목적

현재 챌린지 목표는 **지표 우선** 모델이다: `frequency(웨이트 운동일)` · `distance` · `duration(세션 총분)` · `volume(숨김)` · `reps(웨이트+맨몸 합)`. 사용자가 더 직관적인 **카테고리 우선** 모델을 제안했다: 먼저 운동 카테고리(웨이트/유산소/맨몸)를 고르고, 그 안에서 횟수·시간·거리·운동일 등 지표를 상세 설정한다.

추가로 맨몸운동을 1급 시민으로 다룬다:
- 맨몸 운동을 하면 챌린지에 자동 반영.
- **매달리기·플랭크처럼 지속시간으로 하는 맨몸운동**을 세트별 분(minute) 입력으로 기록하고, 그 시간을 목표로 세울 수 있다. (예: "하루 10분 매달리기" → 1회차 3분·2회차 3분·3회차 4분)
- **매달리기**를 카탈로그에 추가.
- 운동일(부위/종목) 최소 개수 N은 **사용자가 직접 설정**(하드코딩 제한 없음, 1~7 범위).

이 개편은 방금 만든(미커밋) "웨이트 운동일(N부위+)" 작업을 대체·흡수한다.

## 확정 목표 모델

목표 하나 = **(카테고리, 지표, 목표값[, N조건])**.

| 카테고리 | 지표(goal_type) | 단위 | 집계 방식 |
|---|---|---|---|
| 웨이트 | `weight_reps` | 회 | 웨이트 완료세트 reps 합 |
| 웨이트 | `weight_days` | 일 | 하루 **N부위+** 채운 날 수 (N = qualifier) |
| 유산소 | `cardio_distance` | km | 완료 유산소 세트 거리 합 |
| 유산소 | `cardio_time` | 분 | 완료 유산소 세트 지속시간 합 |
| 맨몸 | `bodyweight_reps` | 회 | 횟수형 맨몸 완료세트 reps 합 (풀업·푸시업 등) |
| 맨몸 | `bodyweight_time` | 분 | 시간형 맨몸 완료세트 지속시간 합 (매달리기·플랭크 등) |
| 맨몸 | `bodyweight_days` | 일 | 하루 **N종목+** 채운 날 수 (N = qualifier) |

- 목표값은 기존 "하루량 × 주N일 → 기간총량" 자동계산 그대로 사용. `*_days`는 주 N일 → 기간 일수 환산(기존 frequency 방식).
- `weight_days`·`bodyweight_days`의 N조건은 `user_goals.qualifier`(0007에서 추가됨) 재사용. 웨이트=부위 수, 맨몸=서로 다른 종목 수.
- 레거시 `volume`은 표시용으로만 유지(선택지 제외, 과거 데이터 렌더링 가능).
- 점수 산식(goal-score의 rate 정규화·평균·overall·동점규칙)은 **변경 없음** — goal_type 집합과 실적 집계만 확장.

## 맨몸운동 측정단위 (결정: A안)

맨몸운동은 **횟수형 / 시간형**으로 나뉘며, 카탈로그 운동에 측정단위를 지정한다.
- 매달리기·플랭크 = 시간형(분 입력), 풀업·푸시업·크런치·레그레이즈 = 횟수형(회 입력).
- 직접 만들기에서 맨몸을 고르면 횟수/시간을 선택.
- 세트 입력 카드가 측정단위에 따라 회 또는 분 입력칸을 보여준다.

## 데이터 모델 변경 (마이그레이션 0008)

### exercise_catalog
- `measure text` 컬럼 추가: `check (measure is null or measure in ('reps','time'))`.
  - 맨몸운동에서만 의미 있음(횟수형/시간형 구분). 웨이트·유산소는 null(입력 형식 고정).
- 시드 갱신:
  - `update ... set measure = 'time' where name in ('플랭크')` (기존 코어 홀드).
  - `update ... set measure = 'reps' where exercise_type = 'bodyweight' and measure is null`.
  - `insert ... ('매달리기', '등', 'bodyweight', 'time')` 신규.

### workout_exercises
- `measure text` 컬럼 추가(같은 체크). 세션 저장 시 카탈로그 measure를 복사 → 재로딩·복사 시 카드 렌더링이 정확.
- 과거 데이터 백필: `update workout_exercises we set measure = ec.measure from exercise_catalog ec where we.measure is null and ec.name = we.exercise_name`.

### user_goals — goal_type 확장
```sql
alter table public.user_goals drop constraint user_goals_goal_type_check;

update public.user_goals set goal_type = case goal_type
  when 'frequency' then 'weight_days'
  when 'distance'  then 'cardio_distance'
  when 'duration'  then 'cardio_time'
  when 'reps'      then 'weight_reps'
  else goal_type end;   -- 'volume'은 레거시로 그대로 둠

alter table public.user_goals add constraint user_goals_goal_type_check
  check (goal_type in (
    'weight_reps','weight_days',
    'cardio_distance','cardio_time',
    'bodyweight_reps','bodyweight_time','bodyweight_days',
    'volume'  -- 레거시 표시 전용
  ));
```
- `unique(user_id, challenge_id, goal_type)` 유지 → 한 유저가 카테고리별 여러 지표를 각각 1행씩 가질 수 있음.
- 매핑 주의: 구 `reps`는 웨이트+맨몸 합이었으나 `weight_reps`로 근사(과거 챌린지 표시용, 실사용 영향 미미).

## 코드 변경

### 도메인 — goal-score.ts
- `GoalType` union을 7개 신규 + 레거시 `volume`으로 교체.
- 기존 `ScoredGoal`/랭킹/점수 함수는 그대로(타입만 넓어짐).

### challenge.ts
- `GOAL_TYPE_META`: 신규 7종 label/unit/defaultTarget. 카테고리 그룹핑 메타(어떤 카테고리에 어떤 지표가 있는지) 추가.
- `goalLabel(type, qualifier)`: `weight_days`→"웨이트 운동일(하루 N부위+)", `bodyweight_days`→"맨몸 운동일(하루 N종목+)", 나머지는 라벨 그대로.
- `PeriodStats` 확장:
  - `weightReps`, `bodyweightReps`, `bodyweightTimeMin`, `cardioDistanceKm`, `cardioTimeMin`
  - `weightPartsByDay`(부위 수/일), `bodyweightKindsByDay`(서로 다른 종목 수/일), `workoutDays`.
- `actualForGoal(stats, type, qualifier)`: 7종 분기.
  - `weight_days` = `weightPartsByDay` 중 값 ≥ N 인 날 수. `bodyweight_days` = `bodyweightKindsByDay` 중 ≥ N.
- `getPeriodStatsByUser` 집계 확장:
  - 웨이트 완료세트: `weightReps += reps`, `volumeKg += w*reps`, 부위(body_part) → `weightPartsByDay`.
  - 맨몸 완료세트: reps>0면 `bodyweightReps += reps`; duration>0면 `bodyweightTimeMin += 분`. 종목(exercise_name) → `bodyweightKindsByDay`.
  - 유산소 완료세트: `cardioDistanceKm += km`, `cardioTimeMin += 분`.
  - (measure 컬럼 없이도 채워진 필드로 reps/time 구분 가능 — 한 종목은 둘 중 하나만 입력됨.)

### workout.ts
- `LocalExercise`에 `measure` 추가. 카탈로그 pick·재로딩·복사 시 전달.
- `saveSessionExercises` 저장 매핑 수정:
  - `duration_seconds`: 유산소면 `durationMin*60`, **맨몸+시간형이면 `durationMin*60`**, 그 외 null.
  - `reps`: 유산소 null, **맨몸+시간형 null**, 그 외 `reps`.
  - `measure`: 카탈로그값 저장.
- `defaultSets`: 맨몸+시간형이면 분 기본값 세트(예: 1분×3세트), 아니면 기존 reps 세트.

### 세트 입력 UI — exercise-card.tsx
- 맨몸 + `measure==='time'` → 세트별 **시간(분)** 입력칸(유산소 카드에서 거리 뺀 형태) + 완료 체크.
- 맨몸 + `measure==='reps'` → 기존 회 입력 테이블.
- 웨이트·유산소 카드 변경 없음.

### 운동 추가 시트 — exercise-picker.tsx
- 직접 만들기에서 `exercise_type==='bodyweight'` 선택 시 **측정단위(횟수/시간)** 선택 UI 노출. onCreateCustom에 `measure` 전달.
- 목록 항목에 시간형 표시(선택).

### 챌린지 목표 설정 시트 — setup-sheet.tsx
- **카테고리 우선 UI로 재구성**: 목표 행마다 ① 카테고리(웨이트/유산소/맨몸) 선택 → ② 지표(카테고리별 목록) 선택 → ③ 목표값(자동/직접) + `*_days`면 N 스템퍼(부위/종목).
- 중복 방지: 동일 goal_type 중복 금지(기존 로직 유지, 이제 goal_type이 카테고리+지표라 자연히 세분화).
- `goalLabel` 사용, 단위/기본값은 `GOAL_TYPE_META`.
- 추천 문구 갱신(웨이트=횟수·운동일, 유산소=거리·시간, 맨몸=횟수·시간·운동일).

### 챌린지 화면 — page.tsx
- `EMPTY_STATS`를 확장된 `PeriodStats` 형태로.
- 목표 라벨은 `goalLabel(goal_type, qualifier)`, 실적은 `actualForGoal(stats, goal_type, qualifier)`.
- openSheet 기본 목표를 신규 goal_type로(예: 기본 `weight_days` N=3, 또는 카테고리 선택 유도).

## 마이그레이션·검증 절차

1. `0008_category_goals.sql` 작성 → 사용자에게 "파일 열기 → 복사 → SQL Editor → Run" 안내.
2. `node scripts/rls-test.mjs` — 컬럼·제약만 추가라 기존 68케이스 통과 확인(신규 RLS 없음). goal_type 픽스처가 구 값을 쓰면 신규 값으로 갱신.
3. `pnpm lint · typecheck · test · build`.
4. **사용자 실기기 확인**(메모리 규칙): 맨몸 시간형 세트 입력(매달리기 분 입력)·카테고리별 목표 설정·자동 반영을 눈으로 확인.
5. 확인 후 커밋.

## 도메인 TDD 대상 (순수 함수)

- `actualForGoal` 7종 분기(특히 `weight_days`·`bodyweight_days` N조건).
- 집계 로직은 `getPeriodStatsByUser`가 Supabase 의존이라, 순수 부분(부위/종목 카운트·reps/time 합산)을 분리해 테스트 가능하면 분리.

## 비목표 (YAGNI)

- 웨이트 시간 지표(세트에 시간 입력 없음) — 제외.
- 유산소 운동일·맨몸 볼륨 등 의미 없는 조합 — 제외.
- 기존 완료된 챌린지의 정확한 구 reps(웨이트+맨몸) 재계산 — 근사 매핑으로 충분.

## 열린 항목 (구현 중 사용자 확인 가능)

- 매달리기 body_part = '등'으로 시드(그립/광배). 다른 부위 선호 시 조정.
- 맨몸 시간형 세트 기본값(예: 1분×3세트) 수치.
