# 새 운동 계획 짜기 설계

## 목표

달력에서 오늘 이후 날짜를 골라 **운동을 직접 선택해 새 예정표를 만든다**. 기존 "지난 운동 복사" 예정표와 같은 저장소(0015 `workout_plans`)·같은 당일 "운동 준비하기" 흐름을 쓴다. (사용자 확정 2026-07-19)

## 확인된 현재 구조

- 0015 스키마·RLS는 이미 `source_session_id is null`(원본 없는 계획)을 허용 — **마이그레이션 불필요**.
- `ExercisePicker`는 catalog 다중 선택 + 직접 만들기 + 지난 기록 탭을 갖춘 재사용 가능한 시트. record 페이지가 catalog와 커스텀 생성 핸들러를 보유하고 CalendarView는 그 자식이다.
- CalendarView는 자체적으로 완료 세션 목록(`CalendarSession[]`)을 로드한다 — 피커의 "지난 기록" 탭에 그대로 공급 가능.

## 설계

1. **도메인** (`lib/domain/workout-plan.ts`, TDD): `newPlanExercises(catalog: CatalogExercise[]): PlanExercise[]` — 선택한 카탈로그 항목을 0값 세트 1개짜리 계획 운동으로 변환(기록 탭 "운동 추가"와 동일한 기본값).
2. **I/O** (`lib/workout-plan.ts`): `saveWorkoutPlan.sourceSessionId`를 `string | null`로 완화.
3. **달력** (`calendar-view.tsx`):
   - 날짜 상세 시트에서 `isPlanDateAllowed(선택 날짜)`이고 예정표가 없으면 **"➕ 새 운동 계획 만들기"** 버튼 표시.
   - 버튼 → `ExercisePicker` 열기(catalog·onCreateCustom은 record 페이지에서 props로 전달, 지난 기록 탭 = 달력의 세션 목록).
   - "선택한 n개 추가" → `newPlanExercises`로 변환해 해당 날짜에 저장(source null). 지난 기록 탭에서 고르면 그 세션 구조(`getSessionExerciseStructure`)로 저장(source = 세션 id) — 복사 기능과 같은 결과.
   - 저장 성공 시 예정 목록 갱신 + 기존 planToast로 안내.
4. **record 페이지**: `CalendarView`에 `catalog`·`onCreateCustom` 전달 (기존 상태·핸들러 재사용, 커스텀 생성 시 양쪽 피커가 같은 catalog를 공유).

## 오류 처리

- 저장 실패는 planToast로 안내하고 피커는 유지(재시도 가능).
- 이미 예정표가 있는 날짜에는 버튼을 숨긴다(삭제·이동으로 관리 — 기존 UX 유지).

## 테스트

- newPlanExercises: 기본 세트 1개·필드 매핑·빈 입력.
- 실기기: 미래 날짜 → 새 계획 → 운동 선택 저장 → 달력 `예정` 표시 → (날짜 이동/삭제 동작) → 당일 "운동 준비하기" 로드. 지난 기록 탭 경로 1회.
- 전체 게이트 후 배포. DB 검사는 기존 `workout-plan-test` 15/15로 충분(스키마 불변).

## 제외 범위

- 계획 단계에서 세트 수·중량 미리 입력(당일 준비 화면에서 입력), 반복 주간 프로그램, 계획 수정(삭제 후 재생성으로 대체)
