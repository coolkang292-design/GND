# 나만의 루틴 · 자주 한 운동 상위 표시 · 달력 날짜별 계획 — 설계

> 작성 2026-08-02. 사용자 지시 3건을 한 설계로 묶는다.
> 관련: `docs/superpowers/plans/archive/2026-07-24-routines-friend-level-friend-requests.md`(Phase 1을 **대체**한다) ·
> `docs/superpowers/specs/2026-07-18-calendar-workout-plans-design.md`(예정표 원설계)

## 목표

1. **나만의 루틴** — 재사용 가능한 운동 묶음을 이름 붙여 저장하고 불러온다
2. **자주 한 운동 상위 표시** — 운동 추가 시트에서 많이 한 운동을 위에 보여준다
3. **달력 날짜별 계획** — 달력에서 특정 날짜를 눌러 그날의 운동 계획을 세운다

## 착수 전 실측한 현황

| 기능 | 상태 |
|---|---|
| ① 루틴 | **없음.** 2026-07-24 계획서에 설계됐으나 마이그레이션 번호(0026·0027)가 크루 링크 작업에 재배정되며 미구현 |
| ② 자주 한 운동 | **전혀 없음.** 빈도 집계가 코드·DB 어디에도 없다 |
| ③ 달력 계획 | **거의 완성돼 있다.** `workout_plans`(0015)·`move_workout_plan` RPC·"➕ 새 운동 계획 만들기" 버튼·피커 재사용까지 전부 존재 |

### ③은 기능이 없는 게 아니라 문이 잠겨 있다

`src/components/record/calendar-view.tsx`의 달력 셀:

```jsx
onClick={() => (stamp || plan) && openDate(dateKey)}
disabled={!stamp && !plan}
```

빈 날짜는 클릭이 막혀 있다. 그런데 계획은 0015 RLS상 `plan_date >= 오늘`만 허용되고, 미래 날짜에는 당연히 기록도 계획도 없으므로 **모든 미래 셀이 `disabled`**다. 결과적으로 "새 운동 계획 만들기"는 **오늘 이미 운동을 완료한 경우에만** 도달 가능하고, 그 외에는 지난 기록의 `📋 복사` 우회로밖에 없었다.

### ①의 직렬화는 새로 만들지 않는다

`src/lib/workout.ts`의 `LocalSet`은 `{key, weightKg, reps, distanceKm, durationMin, done}`이고,
`src/lib/domain/workout-plan.ts`의 `DraftPlanSet`은 `PlanSet & {key, done}`이다 — **같은 모양**이다.
실제로 `record/page.tsx:574`의 `handleLoadPlan`이 `toDraftExercises(plan.exercises, localId)`를
그대로 `LocalExercise[]`에 넣고 있고 이게 지금 컴파일된다.

→ `parsePlanExercises` · `toPlanExercises` · `toDraftExercises`를 **손대지 않고 재사용**한다.
루틴 전용 직렬화 코드는 0줄이다.

### ①은 이미 레벨 보상에 예약돼 있다

`0022_xp_level_system.sql`:

```
(12, ..., 'routine_slot_1', '운동 루틴 저장 슬롯 1개 추가', 'coming_soon'),
(27, ..., 'routine_slot_2', '운동 루틴 저장 슬롯 추가',   'coming_soon'),
```

무제한으로 열면 이 두 줄이 거짓말이 된다. **결정: 기본 3개 + 보상으로 각 +1.**

## 결정 사항 (사용자 확정, 2026-08-02)

| # | 결정 |
|---|---|
| D1 | 루틴 슬롯 = **기본 3개**, `routine_slot_1` 레벨에서 +1, `routine_slot_2` 레벨에서 +1 |
| D2 | "많이 한" 기준 = **최근 90일간 그 운동이 등장한 완료 세션 수** |
| D3 | 표시 = 피커 **맨 위 '자주 한 운동' 영역**(전체 목록 재정렬 아님, 별도 탭 아님) |
| D4 | 달력 계획은 **종목만 담는다.** 세트·무게 편집 UI는 만들지 않는다 |

## 아키텍처

세 기능은 독립적이다. 마이그레이션이 필요한 건 ①뿐이므로 **②+③을 먼저 배포하고 ①을 뒤에** 낸다.
사용자가 SQL Run을 하지 않아도 두 기능을 먼저 볼 수 있다.

| | 마이그레이션 | 새 파일 | 고칠 파일 |
|---|---|---|---|
| ③ | 없음 | 없음 | `record/calendar-view.tsx` |
| ② | 없음 | `domain/exercise-frequency.ts` (+test) | `record/exercise-picker.tsx` |
| ① | **0056**(테이블) · **0057**(보상 문구) | `domain/routines.ts` (+test) · `lib/routines.ts` · `record/routine-save-sheet.tsx` · `record/routine-list.tsx` | `record/exercise-picker.tsx` · `record/page.tsx` · `record/calendar-view.tsx` |

---

## ③ 달력에서 날짜를 눌러 계획하기

### 변경

달력 셀의 활성 조건을 바꾼다:

```
클릭 가능 = stamp 있음 || plan 있음 || dateKey >= todayKey
```

- **과거의 빈 날짜는 계속 잠근다.** 보여줄 기록도 없고 0015 RLS가 `plan_date >= 오늘`만 허용하므로
  열어 봐야 아무것도 할 수 없다. 누를 수 있는데 아무 일도 안 일어나는 편이 더 나쁘다
- 빈 미래 셀은 죽어 보이지 않게 **점선 테두리**를 준다
- 시트가 빈 날짜로 열리면 "아직 계획이 없어요" 한 줄 + 기존 "➕ 새 운동 계획 만들기" 버튼
- 세트·무게 편집 UI는 만들지 않는다(D4). 세트는 그날 기록할 때 `↻ 불러오기`로 채운다

### 건드리지 않는 것

`saveWorkoutPlan` · `moveWorkoutPlan` · `deleteWorkoutPlan` · `move_workout_plan` RPC · 0015 RLS.
전부 이미 동작한다.

---

## ② 자주 한 운동 상위 표시

### DB 작업이 없다

`getCompletedSessions(userId)`(`lib/workout.ts:832`)가 이미 완료 세션 전부를
`exerciseNames` + `completedAt`과 함께 돌려준다. 기록 탭은 피커를 열 때
(`record/page.tsx:332` `openExercisePicker`) 이미 이걸 부르고, 달력은 처음부터 들고 있다.

### 새 순수 함수 — `src/lib/domain/exercise-frequency.ts`

```ts
export const FREQUENT_WINDOW_DAYS = 90;
export const FREQUENT_LIMIT = 5;

export type ExerciseFrequency = { name: string; count: number };

/** 최근 windowDays일간 각 운동이 등장한 '완료 세션 수' 내림차순. 동수는 이름 오름차순. */
export function topExercisesByFrequency(
  sessions: { completedAt: Date; exerciseNames: string[] }[],
  now: Date,
  options?: { windowDays?: number; limit?: number },
): ExerciseFrequency[];
```

- 창 계산은 **`now.getTime() - windowDays * 86_400_000` 단순 뺄셈**이다.
  타임존을 끌어들이지 않아 `dayKey` 경계 문제를 애초에 만들지 않는다
- 한 세션에 같은 운동이 두 번 들어 있어도 **세션당 1회**로 센다(세션 수 기준, D2)
- 동수 정렬은 이름 오름차순으로 고정한다 — 정렬이 흔들리면 화면이 매번 바뀐다

### 화면 — 가로 칩 한 줄

피커 '운동 찾기' 탭에서 검색창 아래, 부위 필터 칩 위에 **`⭐ 자주 한 운동`** 칩 줄을 둔다.

```
⭐ 자주 한 운동
[ 벤치프레스 12 ] [ 랫풀다운 9 ] [ 스쿼트 7 ] [ 데드리프트 5 ] [ 러닝 4 ]
```

- **세로 5행이 아니라 가로 스크롤 한 줄이다.** 시트가 `max-h-[82dvh]`라 5행짜리 세로 섹션은
  카탈로그 목록을 화면 밖으로 밀어낸다. 기존 부위 필터 칩과 같은 형태를 쓴다
- 칩을 누르면 카탈로그 항목과 **똑같이 선택 토글**된다(이미 선택된 것은 `✓` 표시)
- **검색어가 있거나 부위 필터가 '전체'가 아니면 칩 줄을 숨긴다.** 필터링과 싸우지 않게
- 표시할 게 없으면 영역 자체가 안 나온다(신규 사용자)

### 카탈로그 매칭

`workout_exercises`는 카탈로그 FK가 아니라 `exercise_name` 텍스트를 저장하므로 **이름으로 맞춘다.**
카탈로그에 없는 이름(지운 커스텀 종목)은 버린다.

⚠️ **버리는 만큼 뒤에서 채운다.** 상위 5개를 먼저 자른 뒤 매칭하면 이름이 안 맞는 항목 때문에
4개만 뜬다. **후보를 넉넉히(예: 상위 20개) 뽑아 카탈로그와 매칭한 다음 `slice(0, 5)`** 한다.
`topExercisesByFrequency`는 `limit`을 받되, 피커는 넉넉한 값을 넘기고 매칭 후 자른다.

### 알고 받는 절충

완료 세션에 담기만 하고 **세트를 체크하지 않은 종목도 1회로 센다.**

- 걸러내려면 모든 세션의 `workout_sets`를 같이 받아야 해서 응답이 커지고,
  `getCompletedSessions`는 달력도 쓰는 함수라 회귀 위험이 생긴다
- 지금 '지난 기록' 탭도 같은 필터 없는 `exerciseNames`를 쓴다 — 일관된다
- 순위가 이상하다고 느껴지면 그때 별도 질의로 바꾸는 편이 싸다

이 절충은 0055의 "완료 세트만 불러오기"와 방향이 다르다. **거기는 세트 값을 그대로 복원하는
일이라 미완료 세트가 섞이면 틀린 수치를 보여줬지만, 여기는 순위일 뿐이고 과대 계상의 영향이 작다.**

---

## ① 나만의 루틴

### 마이그레이션 0056

```sql
create table public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  exercises jsonb not null check (
    jsonb_typeof(exercises) = 'array'
    and jsonb_array_length(exercises) between 1 and 50
    and octet_length(exercises::text) <= 200000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workout_routines_user_name
  on public.workout_routines (user_id, name);
create index workout_routines_user_updated
  on public.workout_routines (user_id, updated_at desc);
```

`workout_plans`(0015)와 같은 형태에서 날짜만 빼고 이름을 넣었다. RLS는 본인 전용 4개 정책.

**이름은 `(user_id, name)` 유니크다.** 같은 이름 두 개면 목록에서 고를 수가 없다.
중복 저장 시도는 클라이언트가 "같은 이름의 루틴이 이미 있어요"로 돌려준다.

### 슬롯 한도는 서버가 강제한다

`before insert` 트리거로 막는다. 클라이언트만 막으면 우회되고, 무엇보다 조용히 깨졌을 때
아무도 모른다.

```sql
create or replace function public.enforce_routine_slot_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_level int;
  v_limit int;
  v_count int;
begin
  select coalesce(current_level, 1) into v_level
    from user_progress where user_id = new.user_id;
  v_level := coalesce(v_level, 1);   -- user_progress 행 자체가 없는 신규 사용자

  select 3
       + (select count(*) from level_definitions
           where reward_key in ('routine_slot_1', 'routine_slot_2')
             and level <= v_level)
    into v_limit;

  select count(*) into v_count
    from workout_routines where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception 'routine_slot_limit:%', v_limit using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

⚠️ **`coalesce`가 두 번인 이유**: `user_progress` 행이 아예 없으면 `select ... into`는
`v_level`을 NULL로 둔다. 컬럼 NULL과 행 없음은 다른 경우이고 둘 다 막아야 한다.
안 하면 `v_level`이 NULL이라 `level <= v_level`이 항상 false → 한도가 조용히 3으로 굳는다.

### 보상 문구 되살리기 — **0057로 따로 뺀다**

⚠️ **테이블 생성과 보상 전환은 Run 시점이 다르다.** 한 파일에 묶으면, 개발 확인을 위해
Run하는 순간 **아직 루틴 기능이 없는 운영 앱**의 '레벨 혜택'에 "해금됨"이 즉시 뜬다.
0022가 `coming_soon`을 만든 이유가 정확히 그것("실사용 기능처럼 노출 금지")이다.

이 프로젝트는 **스테이징 DB가 없어서** `pnpm dev`가 운영 Supabase에 그대로 붙는다.
개발 확인을 하려면 DB에 테이블이 실제로 있어야 하고, 그 DB가 곧 운영 DB다.
그래서 파일을 나눈다:

| 파일 | 내용 | Run 시점 |
|---|---|---|
| **0056** | 테이블·RLS·슬롯 트리거 | **언제든.** 새 테이블이라 운영 앱이 참조하지 않는다. 개발 확인은 이것만으로 된다 |
| **0057** | `routine_slot_1/2` → `active` | **앱 배포 뒤.** 화면 문구만 바꾼다 |

**0057을 안 돌려도 슬롯 한도는 정상이다.** `routineSlotLimit()`과 서버 트리거가
**둘 다 `reward_key`만 보고 `reward_status`는 보지 않는다.** 0057은 순수하게
'레벨 혜택' 화면 표시만 바꾼다.

0057이 하는 일:

```sql
update level_definitions set reward_status = 'active',
  reward_label = '운동 루틴 저장 슬롯 +1 (총 4개)' where reward_key = 'routine_slot_1';
update level_definitions set reward_status = 'active',
  reward_label = '운동 루틴 저장 슬롯 +1 (총 5개)' where reward_key = 'routine_slot_2';
```

**실측 확인:** `components/profile/level-rewards.tsx:58`이
`reached = unlocks.has(key) || currentLevel >= r.level`이다. `user_unlocks` 행은 **레벨업하는
순간에만** 삽입되지만, 이 `||` 덕분에 이미 레벨을 넘긴 사용자도 "해금됨"으로 바르게 뜬다.
슬롯 한도를 레벨로 계산하는 선택이 이 판정과 같은 기준이라 화면과 서버가 어긋나지 않는다.

### 한도 계산 — `src/lib/domain/routines.ts`

```ts
export const ROUTINE_BASE_SLOTS = 3;
export const ROUTINE_SLOT_REWARD_KEYS = ["routine_slot_1", "routine_slot_2"] as const;

/** level_definitions에서 읽은 보상 정의로 한도를 계산한다. 레벨 숫자를 코드에 박지 않는다. */
export function routineSlotLimit(
  currentLevel: number,
  rewards: { level: number; rewardKey: string | null }[],
): number;
```

**레벨 12·27을 코드에 박지 않는다.** 이미 있는 `getLevelRewards()`가 `level_definitions`에서
읽어 오고 순수 함수가 계산한다. 단일 진실은 DB다 (CLAUDE.md §같은 사실을 두 곳에 두지 않는다).

### 클라이언트 — `src/lib/routines.ts`

`lib/workout-plan.ts`를 그대로 미러링한다. `parsePlanExercises`로 DB JSON을 검증해 복원하고,
빈 배열이면 `invalid_workout_routine`으로 던진다.

```ts
export type WorkoutRoutine = {
  id: string; name: string; exercises: PlanExercise[]; updatedAt: string;
};
export async function getMyRoutines(userId: string): Promise<WorkoutRoutine[]>;
export async function saveRoutine(input: { userId; name; exercises: PlanExercise[] }): Promise<WorkoutRoutine>;
export async function renameRoutine(id: string, name: string): Promise<WorkoutRoutine>;
export async function deleteRoutine(id: string): Promise<void>;
```

### 화면

**저장** — 기록 탭 준비 목록 아래 `💾 이 목록을 루틴으로 저장` → 이름 입력 시트.
저장 페이로드는 `toPlanExercises(draft.exercises)`다. 이 함수가 `done`을 떨어뜨리므로
**체크 상태는 저장되지 않고 무게·횟수는 보존된다** — 루틴으로서 원하는 동작이다.

**불러오기** — 피커에 세 번째 탭 `내 루틴`. 탭 배열이 `["catalog","past"]` → `["catalog","past","routine"]`.

⚠️ **불러오기는 교체가 아니라 병합이다.** '운동 추가' 시트 안에서 일어나는 일이므로
'지난 기록' 탭과 같아야 한다. `addPastSession`이 쓰는 **`mergeImportedExercises`를 그대로
재사용**해 이미 담긴 종목은 중복으로 붙지 않는다. (`handleLoadPlan`의 "지우고 교체" 확인창은
예정표 전용 흐름이므로 여기서는 쓰지 않는다.)

**한도 도달** — 저장 버튼을 잠그고 다음 슬롯이 열리는 레벨을 문장으로 알린다.
`routineSlotLimit`이 쓰는 것과 같은 `rewards` 배열에서 레벨을 읽어 문구를 만든다.

**달력에도 루틴 탭이 뜬다** — 같은 `<ExercisePicker>` 컴포넌트라 자동이다.
달력에서는 `onPickRoutine`이 그 날짜의 예정표로 저장한다(`saveWorkoutPlan`, `sourceSessionId: null`).
D4는 "세트 편집 UI를 만들지 않는다"는 결정이지 루틴 사용을 막는 결정이 아니므로 배선한다.

---

## 테스트 — 고장났을 때 실제로 실패하는 단언

CLAUDE.md §"테스트가 진짜 테스트인지 확인한다"에 맞춰, 각 기능의 회귀를 잡는 단언을 못 박는다.

| 단언 | 지키는 것 |
|---|---|
| `"미래의 빈 날짜 셀은 눌린다"` | ③ 그 버그 자체. 다시 `disabled`가 되면 실패 |
| `"과거의 빈 날짜 셀은 잠긴다"` | 반대 방향 — 전부 열어 버리는 과잉 수정 방지 |
| `"90일보다 오래된 세션은 세지 않는다"` | ② 창 경계 |
| `"한 세션에 같은 운동이 두 번 있어도 1회로 센다"` | ② 세션 수 기준(D2) |
| `"검색어가 있으면 자주 한 운동 칩이 사라진다"` | ② 필터와 싸우지 않음 |
| `"카탈로그에 없는 이름이 섞여도 5개를 채운다"` | ② 조용한 축소 방지 |
| `"레벨 11이면 한도는 3, 레벨 12면 4, 레벨 27이면 5"` | ① 슬롯 계산 |
| `"이미 담긴 종목은 루틴을 불러와도 중복되지 않는다"` | ① 병합 규칙 |

**실 DB 회귀** — `scripts/rls-test.mjs`에 추가:
- 다른 사람의 루틴은 조회되지 않는다
- 레벨 1 계정에서 **4번째 루틴 insert가 거부된다** (트리거)
- 같은 이름 두 번째 insert가 거부된다 (유니크)

기준선 115가 올라간다 → **`CLAUDE.md`의 회귀 기준선 표도 같이 갱신한다.**

---

## 완료 조건

**②+③ 배포:**
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 통과
2. `pnpm dev`로 **직접 클릭 확인**(아래 항목표) — A 계정 하나로 충분하다(사회적 기능 아님)
3. `release-notes.data.json`에 항목 추가 (**발송 안 함** — 지시할 때만)
4. `PROGRESS.md` 최상단 갱신
5. 사용자 승인 → `.git` 없는 복사본에서 `vercel --prod` → 프로덕션 실물 확인

**① 배포:** 위에 더해 — **순서가 중요하다**
1. 사용자가 SQL Editor에서 **0056 Run** (테이블. 에이전트는 DDL을 못 돌린다)
2. `pnpm dev`에서 루틴 화면 확인 — 0056만으로 전부 동작한다
3. `rls-test.mjs` 새 단언 포함 `0 failed`
4. 사용자 승인 → 앱 배포
5. **배포 뒤에** 0057 Run (레벨 혜택 문구). 먼저 돌리면 아직 기능이 없는
   운영 앱에 "해금됨"이 뜬다
6. `pnpm db:snapshot`으로 **`docs/db-current-schema.sql` 갱신**

### 개발 서버에서 눈으로 볼 것

"에러가 안 났다"가 아니라 **개수를 세고 눌러 본다.**

| 조작 | 기대 |
|---|---|
| 피커 열기 | ⭐ 자주 한 운동 칩이 **5개**, 횟수가 실제 기록과 맞음 |
| 검색어 입력 | 칩 줄이 **사라짐** |
| 칩 누르기 | 카탈로그 항목과 같이 선택 토글(`✓`) |
| 달력에서 **다음 주 빈 날짜** 누르기 | 시트가 열리고 "➕ 새 운동 계획 만들기"가 보임 |
| 계획 저장 | 그 셀에 **`예정`** 표시가 찍힘 |
| 과거 빈 날짜 누르기 | **안 눌림**(의도된 잠금) |
| 루틴 3개 저장 → 4번째 | **잠김** + 다음 슬롯 레벨 안내 |
| 루틴 불러오기 | 종목·무게가 오고 **체크는 전부 해제** |
| 이미 담긴 종목이 있는 상태로 불러오기 | **중복되지 않음** |
| 성장 허브 | `routine_slot_1`이 **"준비 중"이 아님** (옛 문구가 없어졌는지 = 부정 확인) |

⚠️ 브라우저를 조작할 수단이 없는 세션이면 **배포하지 않고 멈춘다.** `pnpm dev` 실행과
HTTP 200은 화면 확인이 아니다 (전역 CLAUDE.md, 2026-08-01 0055에서 한 번 샜다).
