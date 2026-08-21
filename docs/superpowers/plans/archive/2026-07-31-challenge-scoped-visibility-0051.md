# Challenge Scoped Visibility 0051 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 챌린지 참가자는 해당 챌린지의 이름과 랭킹만 볼 수 있고, 참가만으로 서로 크루가 되거나 친구 전용 기능을 열 수 없게 한다.

**Architecture:** 기존 RLS는 넓히지 않는다. 정의자 RPC가 특정 챌린지의 정식 참가자인지 검사한 뒤 랭킹에 필요한 프로필과 운동 자료만 돌려주고, 앱은 기존 `foldPeriodStats`로 점수를 계산한다. 브라우저와 관리자 화면은 같은 RPC를 사용하되 관리자 서버의 `service_role`만 명시적으로 허용한다.

**Tech Stack:** Next.js, React, TypeScript, Supabase/PostgreSQL, Vitest, Node.js 검증 스크립트, Vercel

---

## 먼저 알아둘 말

- RPC(서버의 전용 주문 창구): 사용자가 서버에 정해진 일을 요청하면 서버가 권한을 확인하고 필요한 결과만 돌려주는 함수다.
- RLS(데이터베이스 출입문 규칙): 사용자별로 어떤 자료를 읽을 수 있는지 정하는 문지기다.
- `service_role`(관리자용 만능 열쇠): 서버 관리자 코드만 사용하는 강한 권한이다. 브라우저에 노출하면 안 된다.
- 회귀(고친 뒤 예전 기능이 다시 고장나는 것): 새 기능 때문에 원래 되던 기능이 망가지는 문제다.

## 작업 범위 지도

### 수정할 파일

- `supabase/migrations/0051_challenge_scoped_visibility.sql`
  - 특정 챌린지 안에서만 관계를 판정한다.
  - `invited`·외부인·취소된 챌린지를 차단한다.
  - 관리자 RPC 호출을 허용한다.
  - 참가 RPC가 `crew_links`를 만들지 않는 현재 초안을 유지한다.

- `src/lib/challenge.ts`
  - 참가자 프로필 RPC와 기간 운동 RPC의 앱용 포장 함수를 추가한다.
  - RPC의 밑줄 이름을 기존 앱의 낙타 이름으로 한 곳에서 변환한다.
  - 점수 계산은 `foldPeriodStats`를 그대로 사용한다.

- `src/lib/challenge.test.ts`
  - RPC JSON 변환 테스트를 추가한다.

- `src/app/(tabs)/challenge/page.tsx`
  - 프로필과 점수 조회를 챌린지 RPC 경로로 바꾼다.

- `src/components/home/challenge-performance-card.tsx`
  - 그룹 프로필 조회를 제거하고 챌린지 참가자 프로필을 사용한다.
  - 친구로 오해하게 만드는 문구를 참가자 문구로 바꾼다.

- `src/components/challenge/invite-sheet.tsx`
  - “참가하면 서로 크루가 된다”는 옛 설명을 반대로 바꾼다.

- `src/components/challenge/invite-sheet.test.tsx`
  - 새 안내 문구를 고정한다.

- `src/lib/admin/queries.ts`
  - 관리자 챌린지 인원을 그룹 인원이 아니라 실제 챌린지 참가자로 센다.

- `scripts/challenge-invite-link-check.mjs`
  - 링크 참가 후 크루 연결이 생기지 않아야 통과하도록 단언을 뒤집는다.

- `scripts/challenge-room-check.mjs`
  - 닉네임 초대 수락도 크루 연결을 만들지 않는지 확인한다.
  - 참가자·초대자·외부인·취소·종료·관리자 경계를 실제 DB에서 확인한다.

- `scripts/admin-dashboard-check.mjs`
  - `challenge_participants` 조회와 관리자 RPC 호출을 검증한다.

- `docs/db-current-schema.sql`
  - 0051 적용 후 운영 DB의 실제 정의를 다시 저장한다.

- `docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md`
  - 0051의 실제 상태와 검증 숫자를 갱신한다.

- `PROGRESS.md`
  - 완료 범위·검증·남은 폰 확인을 기록한다.

### 만들지 않을 파일

- 새 데이터베이스 테이블
- 별도 점수 계산기
- 새 상태관리 도구
- 기존 크루 연결 자동 삭제 스크립트
- 자동 배포 또는 자동 공지 기능

## 중요한 중단 규칙

1. 앱 코드와 검증 코드가 준비되기 전에는 0051을 적용하지 않는다.
2. 0051 적용은 사용자가 Supabase SQL Editor에서 직접 한다.
3. 자동 검증이 하나라도 실패하면 커밋·배포를 중단한다.
4. 기존 크루 연결은 사용자 확인 없이 삭제하지 않는다.
5. 운영 배포는 사용자가 따로 승인한 뒤에만 실행한다.
6. 릴리스 공지는 사용자가 지시한 경우에만 보낸다.

---

### Task 1: 현재 기준선을 고정하고 작업 범위를 확인한다

**Files:**
- Read: `CLAUDE.md`
- Read: `docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md`
- Read: `docs/superpowers/specs/2026-07-31-challenge-scoped-visibility-design.md`
- Read: `docs/db-current-schema.sql`
- Read: `supabase/migrations/0051_challenge_scoped_visibility.sql`

- [ ] **Step 1: 실제 저장소와 커밋을 확인한다**

입력 장소: PowerShell 또는 VS Code 터미널

현재 폴더: `C:\Users\SAMSUNG\workout-app`

```powershell
git rev-parse --show-toplevel
git branch --show-current
git log -3 --oneline
git status --short
```

Expected:

- 저장소가 `C:/Users/SAMSUNG/workout-app`
- 브랜치가 `main`
- 설계 커밋 `8fa03cf`가 최근 로그에 표시
- 기존 미추적 폴더만 표시되고 추적 파일 수정은 없음

- [ ] **Step 2: 0051이 운영 DB에 아직 없는지 스냅샷으로 확인한다**

```powershell
rg -n "get_challenge_period_sessions|shares_challenge_with" docs/db-current-schema.sql
```

Expected: 일치하는 새 0051 함수가 없음. 이미 보이면 작업을 중단하고 실제 적용 이력을 사용자에게 확인한다.

- [ ] **Step 3: 현재 자동 검증 기준선을 다시 실행한다**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- 네 명령 모두 종료 코드 0
- 단위 테스트 686개 이상 통과
- 실패 0

실패하면 0051 작업을 시작하지 말고 기존 고장과 새 작업을 분리해 보고한다.

---

### Task 2: 새 동작을 먼저 실패하는 단위 테스트로 고정한다

**Files:**
- Modify: `src/lib/challenge.test.ts`
- Modify: `src/components/challenge/invite-sheet.test.tsx`
- Test: `src/lib/challenge.test.ts`
- Test: `src/components/challenge/invite-sheet.test.tsx`

- [ ] **Step 1: RPC JSON 변환 테스트를 추가한다**

`src/lib/challenge.test.ts`의 import에 `normalizeChallengePeriodSessions`를 추가하고 다음 테스트를 넣는다.

```ts
import {
  GOAL_TYPE_META,
  actualForGoal,
  foldPeriodStats,
  goalLabel,
  normalizeChallengePeriodSessions,
  type PeriodSessionRow,
  type PeriodStats,
} from "@/lib/challenge";

describe("normalizeChallengePeriodSessions", () => {
  it("RPC의 밑줄 이름을 foldPeriodStats 입력 모양으로 바꾼다", () => {
    expect(
      normalizeChallengePeriodSessions([
        {
          user_id: "u1",
          completed_at: "2026-07-31T03:00:00Z",
          tabata_minutes: 12,
          workout_exercises: [
            {
              exercise_type: "weight",
              exercise_name: "벤치프레스",
              body_part: "가슴",
              workout_sets: [
                {
                  weight_kg: 60,
                  reps: 10,
                  distance_meters: null,
                  duration_seconds: null,
                  is_completed: true,
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual([
      {
        userId: "u1",
        completedAt: "2026-07-31T03:00:00Z",
        tabataMinutes: 12,
        exercises: [
          {
            exerciseType: "weight",
            exerciseName: "벤치프레스",
            bodyPart: "가슴",
            sets: [
              {
                weightKg: 60,
                reps: 10,
                distanceMeters: null,
                durationSeconds: null,
                isCompleted: true,
              },
            ],
          },
        ],
      },
    ]);
  });

  it("서버가 배열이 아닌 값을 주면 빈 점수로 숨기지 않고 오류를 낸다", () => {
    expect(() => normalizeChallengePeriodSessions({ error: "broken" })).toThrow(
      "invalid_challenge_period_sessions",
    );
  });
});
```

- [ ] **Step 2: 초대 안내 테스트를 새 규칙으로 뒤집는다**

`src/components/challenge/invite-sheet.test.tsx`의 초대 링크 테스트를 다음으로 교체한다.

```tsx
it("링크 참가가 친구 관계를 만들지 않는다고 화면에 알린다", () => {
  const out = html("host", "setup");
  expect(out).toContain("서로 크루가 되지는 않아요");
  expect(out).toContain("챌린지 안에서만");
  expect(out).not.toContain("서로 크루가 돼요");
});
```

- [ ] **Step 3: 새 테스트가 실제로 실패하는지 각각 확인한다**

```powershell
pnpm vitest run src/lib/challenge.test.ts
pnpm vitest run src/components/challenge/invite-sheet.test.tsx
```

Expected:

- 첫 명령: `normalizeChallengePeriodSessions`가 아직 없어서 실패
- 둘째 명령: 화면에 아직 옛 문구가 있어서 실패

둘 다 바로 통과하면 테스트가 새 동작을 잡지 못한 것이므로 테스트부터 고친다.

---

### Task 3: 0051 SQL 초안의 보안 경계를 보강한다

**Files:**
- Modify: `supabase/migrations/0051_challenge_scoped_visibility.sql`
- Reference: `docs/db-current-schema.sql`

- [ ] **Step 1: 관계 판정 함수가 특정 챌린지를 받게 바꾼다**

`shares_challenge_with` 전체를 다음 정의로 교체한다.

```sql
create or replace function public.shares_challenge_with(
  p_challenge_id uuid,
  p_other uuid
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from challenge_participants mine
    join challenge_participants theirs
      on theirs.challenge_id = mine.challenge_id
    join challenges c
      on c.id = mine.challenge_id
    where mine.challenge_id = p_challenge_id
      and mine.user_id = (select auth.uid())
      and theirs.user_id = p_other
      and mine.status in ('joined', 'dropped')
      and theirs.status in ('joined', 'dropped')
      and c.status <> 'cancelled'
  )
$$;
revoke all on function public.shares_challenge_with(uuid, uuid) from public, anon;
grant execute on function public.shares_challenge_with(uuid, uuid)
  to authenticated, service_role;
```

왜 필요한가: 현재 `is_challenge_participant()`는 상태를 확인하지 않아 `invited`도 참가자로 본다. 새 함수는 정식 참가 상태와 챌린지 상태를 모두 확인한다.

- [ ] **Step 2: 참가자 프로필 RPC에 정식 참가자·관리자 조건을 넣는다**

`get_challenge_participant_profiles`의 `where` 끝부분과 권한을 다음처럼 만든다.

```sql
  where cp.challenge_id = p_challenge_id
    and cp.status in ('joined', 'dropped')
    and (
      (select auth.role()) = 'service_role'
      or public.shares_challenge_with(
        p_challenge_id,
        (select auth.uid())
      )
    )
$$;
revoke all on function public.get_challenge_participant_profiles(uuid)
  from public, anon;
grant execute on function public.get_challenge_participant_profiles(uuid)
  to authenticated, service_role;
```

Expected behavior:

- `joined`·`dropped`: 참가자 목록 반환
- `invited`·외부인·취소된 챌린지: 빈 배열
- 관리자 서버: 반환 허용

- [ ] **Step 3: 기간 운동 RPC에 같은 문지기를 넣는다**

기존 `is_challenge_participant` 검사 대신 다음 검사를 사용하고 실행 권한에 `service_role`을 추가한다.

```sql
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.shares_challenge_with(
       p_challenge_id,
       (select auth.uid())
     ) then
    raise exception 'challenge_not_found';
  end if;
```

```sql
revoke all on function public.get_challenge_period_sessions(uuid)
  from public, anon;
grant execute on function public.get_challenge_period_sessions(uuid)
  to authenticated, service_role;
```

오류를 `challenge_not_found`로 통일하는 이유: 외부인에게 “챌린지는 있지만 당신만 권한이 없다”는 정보까지 알려주지 않기 위해서다.

- [ ] **Step 4: 참가 함수 두 개가 현행 정의를 보존하는지 대조한다**

`accept_challenge_invite`와 `join_challenge_with_code`는 다음 항목을 그대로 유지해야 한다.

```text
auth.uid() 확인
→ 챌린지 단위 advisory lock
→ lock 이후 상태 재조회
→ setup 상태 검사
→ invited/joined/dropped 검사
→ challenge_participants를 joined로 변경
→ crew_links INSERT는 없음
→ crewLinked: 0 반환
```

확인 명령:

```powershell
rg -n -C 5 "accept_challenge_invite|join_challenge_with_code|crew_links|crewLinked" `
  supabase/migrations/0051_challenge_scoped_visibility.sql
```

Expected:

- 함수 설명을 제외한 실행 SQL에 `insert into crew_links`가 없음
- 두 응답 모두 `crewLinked`, `0`
- 잠금과 상태 재조회는 남아 있음

- [ ] **Step 5: 적용 확인용 SQL 주석을 새 함수 인자와 권한에 맞게 갱신한다**

마이그레이션 맨 아래에 다음 확인문을 둔다.

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'shares_challenge_with',
    'get_challenge_participant_profiles',
    'get_challenge_period_sessions'
  )
order by p.proname;

select
  proname,
  pg_get_functiondef(oid) ilike '%insert into crew_links%' as still_links
from pg_proc
where proname in (
  'accept_challenge_invite',
  'join_challenge_with_code'
);

select count(*) as existing_crew_links
from crew_links;
```

Expected after application:

- 새 함수 3개 표시
- `shares_challenge_with` 인자: `p_challenge_id uuid, p_other uuid`
- `still_links`: 둘 다 `false`
- 기존 실사용 크루 연결 개수는 적용 전과 동일

---

### Task 4: 앱의 챌린지 전용 자료 포장 함수를 구현한다

**Files:**
- Modify: `src/lib/challenge.ts`
- Test: `src/lib/challenge.test.ts`

- [ ] **Step 1: 참가자 프로필의 작은 자료형과 RPC 함수를 추가한다**

`Profile` 타입을 import하고 다음 코드를 챌린지 조회 함수 영역에 추가한다.

```ts
import type { Challenge, Profile, UserGoal } from "@/lib/types";

export type ChallengeParticipantProfile = Pick<
  Profile,
  "id" | "nickname" | "avatar_url"
>;

export async function getChallengeParticipantProfiles(
  challengeId: string,
  client?: SupabaseClient,
): Promise<ChallengeParticipantProfile[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "get_challenge_participant_profiles",
    { p_challenge_id: challengeId },
  );
  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error("invalid_challenge_participant_profiles");
  }
  return data as ChallengeParticipantProfile[];
}
```

프로필 전체가 아니라 이름·아바타만 받는 이유: 랭킹에 필요 없는 개인정보를 가져오지 않기 위해서다.

- [ ] **Step 2: RPC 응답 자료형과 순수 변환 함수를 추가한다**

`PeriodSessionRow` 바로 아래에 다음 코드를 추가한다.

```ts
type ChallengePeriodSessionRpcRow = {
  user_id: string;
  completed_at: string;
  tabata_minutes: number | null;
  workout_exercises:
    | {
        exercise_type: "weight" | "bodyweight" | "cardio";
        exercise_name: string;
        body_part: string | null;
        workout_sets:
          | {
              weight_kg: number | null;
              reps: number | null;
              distance_meters: number | null;
              duration_seconds: number | null;
              is_completed: boolean;
            }[]
          | null;
      }[]
    | null;
};

export function normalizeChallengePeriodSessions(
  data: unknown,
): PeriodSessionRow[] {
  if (!Array.isArray(data)) {
    throw new Error("invalid_challenge_period_sessions");
  }
  return (data as ChallengePeriodSessionRpcRow[]).map((row) => ({
    userId: row.user_id,
    completedAt: row.completed_at,
    tabataMinutes: row.tabata_minutes,
    exercises: (row.workout_exercises ?? []).map((exercise) => ({
      exerciseType: exercise.exercise_type,
      exerciseName: exercise.exercise_name,
      bodyPart: exercise.body_part,
      sets: (exercise.workout_sets ?? []).map((set) => ({
        weightKg: set.weight_kg,
        reps: set.reps,
        distanceMeters: set.distance_meters,
        durationSeconds: set.duration_seconds,
        isCompleted: set.is_completed,
      })),
    })),
  }));
}
```

- [ ] **Step 3: 기간 운동 RPC 호출 함수를 추가한다**

```ts
export async function getChallengePeriodSessions(
  challengeId: string,
  client?: SupabaseClient,
): Promise<PeriodSessionRow[]> {
  const supabase = client ?? getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "get_challenge_period_sessions",
    { p_challenge_id: challengeId },
  );
  if (error) throw error;
  return normalizeChallengePeriodSessions(data);
}
```

- [ ] **Step 4: `getPeriodStatsByUser`가 챌린지 ID를 받게 단순화한다**

기존 직접 `workout_sessions` 조회와 내부 `DbRow` 변환을 제거하고 함수 전체를 다음으로 바꾼다.

```ts
export async function getPeriodStatsByUser(
  challengeId: string,
  startDate: string,
  endDate: string,
  timeZone: string,
  client?: SupabaseClient,
): Promise<Map<string, PeriodStats>> {
  const rows = await getChallengePeriodSessions(challengeId, client);
  return foldPeriodStats(rows, startDate, endDate, timeZone);
}
```

`photoRequired`와 `userIds`를 받지 않는 이유:

- 참가자 명단은 서버가 `challenge_id`로 정한다.
- 사진 필수 여부도 서버가 챌린지 행에서 읽는다.
- 화면이 잘못된 참가자 ID나 사진 규칙을 넘겨도 서버 기준이 흔들리지 않는다.

- [ ] **Step 5: 변환 테스트를 통과시킨다**

```powershell
pnpm vitest run src/lib/challenge.test.ts
```

Expected: 새 변환 테스트 2개와 기존 점수 테스트가 모두 통과한다.

---

### Task 5: 모든 화면과 관리자 호출부를 새 경로로 바꾼다

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx`
- Modify: `src/lib/challenge.ts`
- Modify: `src/components/home/challenge-performance-card.tsx`
- Modify: `src/components/challenge/invite-sheet.tsx`
- Modify: `src/lib/admin/queries.ts`
- Test: `src/components/challenge/invite-sheet.test.tsx`

- [ ] **Step 1: 챌린지 탭의 프로필·점수 조회를 바꾼다**

`page.tsx`에서 다음 import를 제거한다.

```ts
profilesByIds
getChallengeParticipants
```

다음 import를 `@/lib/challenge` 목록에 추가한다.

```ts
getChallengeParticipantProfiles
type ChallengeParticipantProfile
```

선택된 챌린지 자료 로딩 부분을 다음 모양으로 바꾼다.

```ts
const [profiles, chGoals, appr] = await Promise.all([
  getChallengeParticipantProfiles(ch.id),
  getChallengeGoals(ch.id),
  getChallengeApprovals(ch.id),
]);
if (cancelled) return;
setMembers(profiles);
setGoals(chGoals);
setApprovals(appr);

if (ch.status === "active" || ch.status === "ended") {
  const statsByUser = await getPeriodStatsByUser(
    ch.id,
    ch.start_date,
    ch.end_date,
    timeZone,
  );
  if (cancelled) return;
  setStats(statsByUser);
} else {
  setStats(null);
}
```

`members` 상태는 다음 작은 타입을 사용한다.

```ts
const [members, setMembers] = useState<ChallengeParticipantProfile[]>([]);
```

`@/lib/types` import에서는 `Profile`을 제거하고, 같은 파일 아래쪽 `ResultView`의 자료형도 다음으로 바꾼다.

```ts
profileOf: (id: string) => ChallengeParticipantProfile | undefined;
```

- [ ] **Step 2: 공용 랭킹 함수가 챌린지 ID를 넘기게 바꾼다**

`getActiveChallengeRanking`의 점수 호출을 다음으로 바꾼다.

```ts
const stats = await getPeriodStatsByUser(
  ch.id,
  ch.start_date,
  ch.end_date,
  DEFAULT_TIMEZONE,
  client,
);
```

이 함수의 직접 호출부도 검색한다.

```powershell
rg -n "getActiveChallengeRanking|getPeriodStatsByUser" src
```

Expected direct callers:

- `src/app/(tabs)/challenge/page.tsx`
- `src/lib/challenge.ts`
- `src/components/home/challenge-performance-card.tsx`
- `src/lib/social.ts`
- `src/lib/admin/queries.ts`

`social.ts`는 `getActiveChallengeRanking(challengeId)`를 부르므로 별도 점수 함수 인자 변경은 없어야 한다.

- [ ] **Step 3: 홈 성과 카드의 이름 원천과 문구를 바꾼다**

import를 다음처럼 바꾼다.

```ts
import {
  getActiveChallengeRanking,
  getChallengeParticipantProfiles,
  getMyChallenges,
  getTodaysPeekTarget,
  pickPeekTarget,
  type ChallengeRanking,
} from "@/lib/challenge";
```

`getGroupMemberProfiles(ch.group_id)` 대신 다음을 사용한다.

```ts
getChallengeParticipantProfiles(ch.id)
```

화면 문구는 정확히 다음으로 바꾼다.

```text
🏆 챌린지 참가자 성과
성과를 볼 참가자 한 명을 고르세요. 오늘은 바꿀 수 없어요.
아직 함께 참가한 사람이 없어요
참가자
```

`오늘은 ...님만 볼 수 있어요`의 기본 이름도 `참가자`로 바꾼다.

- [ ] **Step 4: 초대 시트가 새 관계를 정확히 설명하게 바꾼다**

제목 두 곳을 `🏆 챌린지 초대`로 바꾸고 링크 설명을 다음 JSX로 교체한다.

```tsx
<p className="mt-1.5 text-[11px] text-muted">
  링크로 참가해도{" "}
  <b className="text-text">서로 크루가 되지는 않아요.</b> 이름과 랭킹은
  이 챌린지 안에서만 보여요.
</p>
```

옛 D5 설명 주석도 새 규칙으로 다시 쓴다.

- [ ] **Step 5: 관리자 참가 인원을 챌린지 참가자 기준으로 바꾼다**

`src/lib/admin/queries.ts`의 그룹 멤버 조회를 다음으로 바꾼다.

```ts
const { data: participants, error: participantError } = await db
  .from("challenge_participants")
  .select("challenge_id,status")
  .in("status", ["joined", "dropped"]);
if (participantError) {
  throw new Error(
    `challenge_participants 조회 실패: ${participantError.message}`,
  );
}

const memberCount = new Map<string, number>();
for (const participant of participants ?? []) {
  const challengeId = participant.challenge_id as string;
  memberCount.set(challengeId, (memberCount.get(challengeId) ?? 0) + 1);
}
```

반환 부분은 그룹 ID가 아니라 챌린지 ID를 사용한다.

```ts
memberCount: memberCount.get(c.id as string) ?? 0,
```

`challenges` select에서 더 이상 쓰지 않는 `group_id`를 제거한다.

- [ ] **Step 6: 목표 단위 테스트를 통과시킨다**

```powershell
pnpm vitest run src/lib/challenge.test.ts
pnpm vitest run src/components/challenge/invite-sheet.test.tsx
pnpm typecheck
```

Expected:

- 두 테스트 파일 모두 통과
- 타입 오류 0
- `getPeriodStatsByUser`의 옛 `string[]` 호출이 남아 있으면 typecheck가 실패

- [ ] **Step 7: 오해를 만드는 옛 문구와 옛 조회를 전수 검색한다**

```powershell
rg -n "서로 크루가 돼요|챌린지 크루 성과|성과를 볼 크루원|getGroupMemberProfiles" `
  src/app src/components src/lib
```

Expected:

- 챌린지 문맥의 옛 문구 0건
- 실제 크루 기능에서 필요한 `getGroupMemberProfiles` 정의만 남을 수 있음

---

### Task 6: 실제 DB 검증이 새 규칙을 실패 없이 지키게 바꾼다

**Files:**
- Modify: `scripts/challenge-invite-link-check.mjs`
- Modify: `scripts/challenge-room-check.mjs`
- Modify: `scripts/admin-dashboard-check.mjs`

- [ ] **Step 1: 링크 참가 검증의 D5 단언을 반대로 바꾼다**

`scripts/challenge-invite-link-check.mjs`의 제목과 설명에서 “크루 연결”을 제거하고 단언을 다음으로 바꾼다.

```js
check(
  "링크 참가 후 crew_links가 생기지 않는다",
  linkRows.length === 0,
  JSON.stringify(linkRows),
);
```

Expected 총계는 기존과 같은 `13/13`이다. 단언 개수는 유지하고 뜻만 반대로 바꾼다.

- [ ] **Step 2: 방 검증의 초대 수락 단언 네 개를 반대로 바꾼다**

`scripts/challenge-room-check.mjs`의 `[10]`~`[13]`을 다음 의미로 바꾼다.

```js
check(
  "[10] 수락 → joined, 크루 연결 0",
  r.json?.status === "joined" && r.json?.crewLinked === 0,
  JSON.stringify(r.json),
);

const linksB = await api(
  SERVICE_KEY,
  "GET",
  `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${b.id},user_b.eq.${b.id})`,
);
check("[11] a-b 크루 연결이 생기지 않는다", (linksB.json ?? []).length === 0);

check(
  "[12] 두 번째 수락자도 크루 연결 0",
  r.json?.status === "joined" && r.json?.crewLinked === 0,
  JSON.stringify(r.json),
);

const linksC = await api(
  SERVICE_KEY,
  "GET",
  `/rest/v1/crew_links?select=user_a,user_b&or=(user_a.eq.${c.id},user_b.eq.${c.id})`,
);
check("[13] c도 a·b와 크루가 되지 않는다", (linksC.json ?? []).length === 0);
```

- [ ] **Step 3: 방 픽스처 챌린지는 사진 비필수로 만든다**

첫 번째와 두 번째 `create_challenge_room` 호출에 다음 인자를 추가한다.

```js
p_photo_required: false,
```

이유: 이 스크립트는 공개 범위를 검사한다. 사진 필수 규칙은 `challenge-photo-test.mjs`가 따로 검사하므로 여기서 섞지 않는다.

- [ ] **Step 4: 크루가 아닌 참가자의 운동 한 건을 만든다**

`a`, `b`, `c`가 참가한 직후 service key로 다음 픽스처를 만든다. 응답 ID가 없으면 `throw`해서 빈 자료가 가짜 통과하지 못하게 한다.

```js
const seededSession = await api(
  SERVICE_KEY,
  "POST",
  "/rest/v1/workout_sessions",
  {
    user_id: a.id,
    group_id: groupId,
    status: "completed",
    started_at: `${start}T02:00:00Z`,
    completed_at: `${start}T03:00:00Z`,
    visibility: "group",
    timezone: "Asia/Seoul",
  },
);
const sessionId = seededSession.json?.[0]?.id;
if (!sessionId) {
  throw new Error(`세션 픽스처 실패: ${JSON.stringify(seededSession.json)}`);
}

const seededExercise = await api(
  SERVICE_KEY,
  "POST",
  "/rest/v1/workout_exercises",
  {
    session_id: sessionId,
    exercise_name: "벤치프레스",
    exercise_type: "weight",
    body_part: "가슴",
    sort_order: 0,
  },
);
const exerciseId = seededExercise.json?.[0]?.id;
if (!exerciseId) {
  throw new Error(`종목 픽스처 실패: ${JSON.stringify(seededExercise.json)}`);
}

const seededSet = await api(
  SERVICE_KEY,
  "POST",
  "/rest/v1/workout_sets",
  {
    workout_exercise_id: exerciseId,
    set_number: 1,
    weight_kg: 60,
    reps: 10,
    is_completed: true,
  },
);
if (!seededSet.json?.[0]?.id) {
  throw new Error(`세트 픽스처 실패: ${JSON.stringify(seededSet.json)}`);
}
```

- [ ] **Step 5: 참가자 전용 RPC와 친구 기능 차단을 검증한다**

같은 스크립트에 다음 단언을 추가한다.

```js
const profilesB = await rpc(b.token, "get_challenge_participant_profiles", {
  p_challenge_id: chId,
});
check(
  "정식 참가자는 같은 챌린지 참가자 3명의 프로필을 본다",
  profilesB.status === 200 && (profilesB.json ?? []).length === 3,
  JSON.stringify(profilesB.json),
);

const scopedB = await rpc(b.token, "get_challenge_period_sessions", {
  p_challenge_id: chId,
});
check(
  "크루가 아닌 참가자도 챌린지 RPC로 방장 운동을 본다",
  scopedB.status === 200 &&
    (scopedB.json ?? []).some((row) => row.user_id === a.id),
  JSON.stringify(scopedB.json),
);

const directB = await api(
  b.token,
  "GET",
  `/rest/v1/workout_sessions?id=eq.${sessionId}&select=id`,
);
check(
  "같은 참가자라도 운동 원본은 직접 읽지 못한다",
  directB.status === 200 && (directB.json ?? []).length === 0,
  JSON.stringify(directB.json),
);

const reactionB = await api(b.token, "POST", "/rest/v1/reactions", {
  session_id: sessionId,
  user_id: b.id,
  reaction_type: "fire",
});
check(
  "같은 참가자라도 친구 전용 반응 권한은 생기지 않는다",
  reactionB.status >= 400,
  JSON.stringify(reactionB.json),
);

const scopedAdmin = await rpc(
  SERVICE_KEY,
  "get_challenge_period_sessions",
  { p_challenge_id: chId },
);
check(
  "관리자 service_role은 같은 RPC로 집계 자료를 읽는다",
  scopedAdmin.status === 200 &&
    (scopedAdmin.json ?? []).some((row) => row.user_id === a.id),
  JSON.stringify(scopedAdmin.json),
);
```

- [ ] **Step 6: 초대·외부인·취소·중도탈락·종료 경계를 검증한다**

각 상태가 만들어지는 기존 위치 바로 뒤에 다음 검사를 배치한다.

```js
// d가 invited인 동안
const invitedProfiles = await rpc(
  d.token,
  "get_challenge_participant_profiles",
  { p_challenge_id: chId },
);
check(
  "invited는 참가자 프로필을 못 본다",
  invitedProfiles.status === 200 &&
    (invitedProfiles.json ?? []).length === 0,
  JSON.stringify(invitedProfiles.json),
);

const invitedSessions = await rpc(
  d.token,
  "get_challenge_period_sessions",
  { p_challenge_id: chId },
);
check(
  "invited는 기간 운동 RPC를 못 연다",
  hasCode(invitedSessions, "challenge_not_found"),
  JSON.stringify(invitedSessions.json),
);

// d가 초대를 거절해 외부인이 된 뒤
const outsiderProfiles = await rpc(
  d.token,
  "get_challenge_participant_profiles",
  { p_challenge_id: chId },
);
check(
  "외부인은 참가자 프로필을 못 본다",
  outsiderProfiles.status === 200 &&
    (outsiderProfiles.json ?? []).length === 0,
  JSON.stringify(outsiderProfiles.json),
);

// secondId 챌린지를 service key로 cancelled로 바꾼다.
await api(
  SERVICE_KEY,
  "PATCH",
  `/rest/v1/challenges?id=eq.${secondId}`,
  { status: "cancelled" },
  "return=minimal",
);

const cancelledProfiles = await rpc(
  a.token,
  "get_challenge_participant_profiles",
  { p_challenge_id: secondId },
);
check(
  "취소된 챌린지는 참가자도 프로필을 못 본다",
  cancelledProfiles.status === 200 &&
    (cancelledProfiles.json ?? []).length === 0,
  JSON.stringify(cancelledProfiles.json),
);

const cancelledSessions = await rpc(
  a.token,
  "get_challenge_period_sessions",
  { p_challenge_id: secondId },
);
check(
  "취소된 챌린지는 참가자도 운동 자료를 못 본다",
  hasCode(cancelledSessions, "challenge_not_found"),
  JSON.stringify(cancelledSessions.json),
);

// 자동 시작으로 c가 dropped 된 뒤
const droppedSessions = await rpc(
  c.token,
  "get_challenge_period_sessions",
  { p_challenge_id: chId },
);
check(
  "dropped 참가자는 자신이 참가했던 결과 자료를 본다",
  droppedSessions.status === 200,
  JSON.stringify(droppedSessions.json),
);

// 자동 종료 뒤
const endedSessions = await rpc(
  b.token,
  "get_challenge_period_sessions",
  { p_challenge_id: chId },
);
check(
  "종료된 챌린지는 참가자에게 결과가 남는다",
  endedSessions.status === 200 &&
    (endedSessions.json ?? []).some((row) => row.user_id === a.id),
  JSON.stringify(endedSessions.json),
);
```

Expected: 기존 36개 단언에 12개가 추가되어 `48 passed, 0 failed`.

- [ ] **Step 7: 관리자 읽기 전용 검증을 새 원천으로 바꾼다**

`scripts/admin-dashboard-check.mjs`의 `group_members` 검사를 다음으로 교체한다.

```js
const participants = await db
  .from("challenge_participants")
  .select("challenge_id,status")
  .in("status", ["joined", "dropped"]);
check(
  "challenge_participants(challenge_id,status) joined/dropped",
  !participants.error,
  participants.error?.message ?? `${participants.data.length}행`,
);
```

활성 챌린지마다 관리자 RPC를 확인한다.

```js
for (const challenge of challenges.data ?? []) {
  const scoped = await db.rpc("get_challenge_period_sessions", {
    p_challenge_id: challenge.id,
  });
  check(
    `관리자 챌린지 RPC ${challenge.name}`,
    !scoped.error && Array.isArray(scoped.data),
    scoped.error?.message ?? `${scoped.data.length}행`,
  );
}
```

Expected: 기존 14개 검사에 활성 챌린지 수만큼 추가되고 실패 0.

---

### Task 7: 데이터베이스 적용 전에 코드 품질 검증을 통과시킨다

**Files:**
- Verify: all modified application and test files

- [ ] **Step 1: 변경 파일만 확인한다**

```powershell
git status --short
git diff --stat
git diff --check
```

Expected:

- 계획에 적힌 파일만 수정
- 사용자 소유 미추적 폴더는 그대로
- 공백 오류 0

- [ ] **Step 2: 옛 전제를 전수 검색한다**

```powershell
rg -n "서로 크루가 돼요|crewLinked === [1-9]|insert into crew_links" `
  src scripts supabase/migrations/0051_challenge_scoped_visibility.sql
```

Expected:

- 0051 참가 함수 실행부에 `insert into crew_links` 0건
- 새 검증 스크립트에 `crewLinked === 1` 또는 `2` 0건
- 옛 화면 문구 0건

- [ ] **Step 3: 전체 정적 검증을 실행한다**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- 모두 종료 코드 0
- 단위 테스트 688개 이상 통과
- 실패 0

- [ ] **Step 4: 아직 커밋하지 않는다**

프로젝트 지침상 실제 DB 마이그레이션과 사용자 흐름을 확인한 뒤에만 커밋한다. 이 시점에는 코드가 준비됐다는 중간 보고만 한다.

---

### Task 8: 사용자 확인 후 0051을 적용하고 실제 DB를 검증한다

**Files:**
- Apply manually: `supabase/migrations/0051_challenge_scoped_visibility.sql`
- Modify after application: `docs/db-current-schema.sql`

- [ ] **Step 1: 적용 전 사용자에게 변화와 중단 조건을 보여준다**

사용자에게 다음 내용을 쉬운 말로 알리고 Run 승인을 받는다.

```text
바뀌는 것:
- 앞으로 챌린지 참가만으로 친구가 생기지 않습니다.
- 같은 챌린지의 이름과 점수는 계속 보입니다.
- 초대만 받은 사람과 외부인은 다른 사람 점수를 볼 수 없습니다.

사라지지 않는 것:
- 기존 친구 관계
- 기존 챌린지와 목표
- 운동 기록

적용 후 검증이 실패하면:
- 배포하지 않습니다.
- 실패 원인을 고친 새 번호 마이그레이션을 준비합니다.
```

- [ ] **Step 2: 사용자가 Supabase SQL Editor에서 0051 전체를 실행한다**

입력 장소: Supabase 웹사이트 → SQL Editor

입력 내용: `supabase/migrations/0051_challenge_scoped_visibility.sql` 전체

정상 결과: 오류 없이 `Success`

되돌리는 방법: 이미 적용된 0051 파일을 고치지 않는다. 문제가 있으면 새 번호 `0052_...sql`로 복구한다.

- [ ] **Step 3: 적용 확인 SQL을 별도로 실행한다**

Task 3 Step 5의 확인 SQL을 SQL Editor에서 실행한다.

Expected:

- 새 함수 3개
- `shares_challenge_with` 인자 2개
- 참가 RPC 두 개의 `still_links = false`
- 기존 크루 연결 개수 불변

- [ ] **Step 4: 운영 스키마 스냅샷을 갱신한다**

입력 장소: PowerShell 또는 VS Code 터미널

현재 폴더: `C:\Users\SAMSUNG\workout-app`

```powershell
pnpm db:snapshot
```

Expected:

- `docs/db-current-schema.sql` 갱신
- 새 함수 3개와 수정된 참가 함수 2개가 포함

확인:

```powershell
rg -n "shares_challenge_with|get_challenge_participant_profiles|get_challenge_period_sessions" `
  docs/db-current-schema.sql
```

- [ ] **Step 5: 읽기·쓰기 실 DB 검증을 간격을 두고 실행한다**

첫 실행:

```powershell
node scripts/challenge-invite-link-check.mjs
```

Expected: `13/13`, 실패 0

익명 가입 제한을 피하기 위해 첫 스크립트가 끝난 뒤 1~2분 후 실행:

```powershell
node scripts/challenge-room-check.mjs
```

Expected: `48 passed, 0 failed`

그 뒤 읽기 전용 검증:

```powershell
node scripts/challenge-aggregation-parity.mjs
node scripts/admin-dashboard-check.mjs
```

Expected:

- 집계 동등성 실패 0
- 관리자 검사 실패 0
- 진행 중 `7월 GND 챌린지`가 실제 비교 대상에 포함

- [ ] **Step 6: 나머지 회귀 검증을 실행한다**

쓰기·가입 스크립트는 1~2분 간격을 둔다.

```powershell
node scripts/rls-test.mjs
node scripts/challenge-consent-test.mjs
node scripts/challenge-subset-start-check.mjs
node scripts/challenge-photo-test.mjs
node scripts/challenge-peek-check.mjs
node scripts/poke-levelup-check.mjs
```

Expected:

- 모든 스크립트 실패 0
- 기존 기준선보다 통과 수가 줄지 않음

- [ ] **Step 7: 테스트 흔적이 남지 않았는지 확인한다**

계정·그룹·크루 연결 개수를 안전한 기존 점검 방법으로 확인한다.

Expected:

- 실사용 계정 4개
- 그룹 `리얼GND` 유지
- 기존 실사용 크루 연결 수 불변
- 테스트 닉네임·테스트 그룹 0개

하나라도 다르면 삭제부터 하지 말고 어떤 행이 남았는지 사용자에게 보여준다.

---

### Task 9: localhost에서 사람이 보는 화면을 직접 확인한다

**Files:**
- Verify: application UI only

- [ ] **Step 1: 개발 서버를 실행한다**

입력 장소: VS Code 터미널

현재 폴더: `C:\Users\SAMSUNG\workout-app`

```powershell
pnpm dev
```

정상 결과: `http://localhost:3000` 접속 가능

종료 방법: 터미널에서 `Ctrl + C`

- [ ] **Step 2: 챌린지 탭을 확인한다**

확인 항목:

1. 선택한 챌린지의 참가자 수가 실제 참가자 수와 같다.
2. 다른 챌린지 참가자가 섞이지 않는다.
3. 닉네임과 아바타가 빈칸이 아니다.
4. 진행 중 랭킹 점수가 작업 전과 같다.
5. 종료된 챌린지 결과가 계속 보인다.
6. 같은 챌린지가 참가자 수만큼 중복 표시되지 않는다.

- [ ] **Step 3: 홈 성과 카드를 확인한다**

확인 항목:

1. 제목이 `챌린지 참가자 성과`
2. 사람 선택 문구가 `참가자`
3. 현재 활성 챌린지 참가자만 표시
4. 실제 크루 목록에는 챌린지 참가만 한 사람이 나타나지 않음

- [ ] **Step 4: 초대 링크 전 과정을 확인한다**

```text
방장이 링크 복사
→ 새 시크릿 창에서 링크 열기
→ "챌린지에 초대받았어요 🏆" 확인
→ 닉네임 설정
→ 크루 화면을 거치지 않고 챌린지 탭 이동
→ 목표 등록
→ 주소의 ?join= 제거
→ 크루 목록에는 새 참가자가 없음
→ 챌린지 참가자·랭킹에는 새 참가자가 있음
```

- [ ] **Step 5: 관리자 화면을 확인한다**

확인 항목:

1. `/admin`이 검은 화면이나 500 오류가 아님
2. 활성 챌린지 달성률이 비어 있지 않음
3. 참가 인원 수가 그룹 전체가 아니라 실제 챌린지 참가자 수와 같음

화면 하나라도 틀리면 배포하지 않는다.

---

### Task 10: 전체 재검증 후 문서와 코드만 골라 커밋한다

**Files:**
- Modify: `docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md`
- Modify: `PROGRESS.md`
- Verify: all modified files

- [ ] **Step 1: 인수인계서의 낡은 상태를 갱신한다**

다음을 실제 결과로 바꾼다.

```text
0051: 적용 완료 또는 검증 실패로 중단
앱 코드: RPC 전환 완료 여부
검증: 각 스크립트의 실제 passed/failed 숫자
localhost: 챌린지 탭·홈·관리자 확인 결과
폰: 확인한 항목과 아직 남은 항목
main의 origin 대비 실제 ahead 숫자
```

`0051 미커밋`이라는 낡은 문구는 제거한다. 0051 SQL 초안은 커밋 `4e18781`에 이미 포함돼 있다.

- [ ] **Step 2: `PROGRESS.md`에 한 곳의 완료 기록을 추가한다**

기록할 내용:

```text
문제: 챌린지 참가가 친구 관계를 자동 생성
해결: 참가 RPC에서 crew_links 생성 제거
보안: RLS 확대 없이 챌린지 전용 RPC 사용
경계: joined/dropped 허용, invited/외부인/cancelled 차단, ended 허용
관리자: service_role RPC와 참가자 수 유지
검증: 실제 실행 숫자
배포: 아직 안 했으면 미배포라고 명시
```

- [ ] **Step 3: 전체 검증을 새로 실행한다**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected:

- 모두 종료 코드 0
- 단위 테스트 688개 이상, 실패 0
- 공백 오류 0

- [ ] **Step 4: 커밋 대상 파일을 정확히 고른다**

```powershell
git status --short
git diff --name-only
```

다음 파일만 `git add`한다.

```powershell
git add -- `
  supabase/migrations/0051_challenge_scoped_visibility.sql `
  src/lib/challenge.ts `
  src/lib/challenge.test.ts `
  "src/app/(tabs)/challenge/page.tsx" `
  src/components/home/challenge-performance-card.tsx `
  src/components/challenge/invite-sheet.tsx `
  src/components/challenge/invite-sheet.test.tsx `
  src/lib/admin/queries.ts `
  scripts/challenge-invite-link-check.mjs `
  scripts/challenge-room-check.mjs `
  scripts/admin-dashboard-check.mjs `
  docs/db-current-schema.sql `
  docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md `
  PROGRESS.md
```

기존 미추적 폴더는 절대 추가하지 않는다. `git add .`을 사용하지 않는다.

- [ ] **Step 5: 스테이징된 내용만 검토하고 커밋한다**

```powershell
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
git commit -m "fix: 챌린지 참가자와 크루 관계 분리"
```

Expected:

- 계획한 파일만 커밋
- 커밋 성공
- 사용자 소유 미추적 폴더는 여전히 미추적 상태

---

### Task 11: 별도 승인 후 운영 배포와 폰 확인을 수행한다

**Files:**
- Deploy: verified `main` only

- [ ] **Step 1: 배포 전에 사용자 승인을 받는다**

사용자에게 다음을 보여준다.

```text
배포하면 달라지는 화면:
- 챌린지 참가자가 크루 목록에 자동으로 들어오지 않습니다.
- 챌린지 안에서는 이름과 랭킹이 계속 보입니다.
- 초대 안내 문구가 새 규칙으로 바뀝니다.

데이터:
- 기존 크루 관계와 운동 기록은 삭제하지 않습니다.

검증:
- 자동 검증 숫자
- localhost 화면 확인 결과
```

승인 전에는 `vercel --prod`를 실행하지 않는다.

- [ ] **Step 2: `main` 전용 워크트리에서 빌드한다**

워크트리(깨끗한 복사 작업장): 다른 세션의 미완성 파일이 배포에 섞이지 않게 별도 폴더를 만드는 방법이다.

PowerShell에서 다음 고정 경로가 아직 없는지 먼저 확인한다.

```powershell
$deployWorktree = 'C:\Users\SAMSUNG\AppData\Local\Temp\workout-app-deploy-0051'
Test-Path -LiteralPath $deployWorktree
```

Expected: `False`. `True`면 덮어쓰거나 삭제하지 말고 작업을 중단해 기존 폴더의 용도를 확인한다.

경로가 없는 것이 확인되면:

```powershell
git worktree add --detach $deployWorktree main
Copy-Item -LiteralPath .env.local -Destination $deployWorktree
Copy-Item -LiteralPath .vercel -Destination $deployWorktree -Recurse
Set-Location -LiteralPath $deployWorktree
```

그 워크트리에서:

```powershell
pnpm install --frozen-lockfile
pnpm build
```

Expected: build 종료 코드 0

- [ ] **Step 3: 승인받은 main을 배포한다**

```powershell
npx vercel@latest --prod --yes
```

Expected:

- 영문·숫자 식별자가 붙은 새 `gnd-...-gnd4.vercel.app` 주소 생성
- `https://gnd-one.vercel.app` 별칭 연결

- [ ] **Step 4: 프로덕션 파일과 화면을 확인한다**

확인 항목:

1. 프로덕션 번들에 `서로 크루가 되지는 않아요`가 있음
2. `/challenge`, `/home`, `/admin`이 기대한 상태로 열림
3. 초대 링크 참가 후 크루 목록에는 안 나타남
4. 챌린지 랭킹에는 나타남
5. 기존 `7월 GND 챌린지` 점수 유지

- [ ] **Step 5: 사용자 폰 확인을 요청한다**

사용자에게 다음 네 가지를 요청한다.

```text
1. 초대 링크로 새 참가자가 들어오는지
2. 새 참가자가 크루 목록에는 없는지
3. 챌린지 참가자와 랭킹에는 보이는지
4. 기존 챌린지 점수가 그대로인지
```

폰 확인 전에는 전체 작업을 최종 완료라고 말하지 않는다.

- [ ] **Step 6: 공지는 사용자 지시가 있을 때만 준비한다**

사용자가 요청한 경우에만:

```powershell
pnpm release:notify
```

먼저 DRY RUN 결과를 보여주고, 실제 발송은 다시 확인받는다.

---

## 최종 성공 판정

다음 항목이 전부 참일 때만 완료다.

- [ ] 링크 참가와 닉네임 초대 수락이 `crew_links`를 만들지 않는다.
- [ ] 같은 챌린지의 `joined`·`dropped` 참가자는 이름과 랭킹을 본다.
- [ ] `invited`·외부인·취소된 챌린지는 다른 참가자 자료를 못 본다.
- [ ] 종료된 챌린지 결과는 참가자에게 남는다.
- [ ] 챌린지 참가만으로 피드·응원·반응 권한이 생기지 않는다.
- [ ] 관리자 챌린지 달성률과 참가 인원 수가 정상이다.
- [ ] 진행 중 챌린지 점수가 전후 동일하다.
- [ ] lint·typecheck·unit·build와 모든 실 DB 검증이 실패 0이다.
- [ ] 테스트 계정·그룹·크루 연결 찌꺼기가 없다.
- [ ] localhost 화면 확인이 끝났다.
- [ ] 운영 배포는 사용자 승인을 받은 뒤 실행했다.
- [ ] 사용자 폰에서 최종 흐름을 확인했다.
