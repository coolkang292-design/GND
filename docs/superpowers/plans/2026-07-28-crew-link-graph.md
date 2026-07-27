# 크루 연결 그래프 — 닉네임 검색 · 상호 수락 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **먼저 §0(현재 상태)과 §1(실행 순서)을 읽어라.** 마이그레이션이 **두 개**로 쪼개져 있고, 그 사이에 배포·실기기 확인이 낀다. 순서를 바꾸면 안 된다.

**Goal:** "같은 그룹에 속했으니 크루"를 "닉네임으로 찾아 **서로 수락했으니 크루**"로 바꾼다. 크루가 된 사람끼리만 알림·피드·프로필이 오간다.

**Architecture:** 그룹(`groups`)은 **챌린지 전용으로 의미만 축소**하고 지우지 않는다. 새 테이블 `crew_requests`(요청 이력) + `crew_links`(수락된 연결, `user_a < user_b` 정규화)를 만들고, 관계 판정 함수 `shares_group_with` → `is_crew_with`를 갈아끼우면 권한 검사 5곳이 한 번에 바뀐다. 알림 팬아웃 3곳(운동 시작·기록 갱신·레벨업)은 `group_members` 조인을 `crew_links` 조인으로 교체한다. 마이그레이션은 **0038(추가만·무해)** 과 **0039(전환)** 로 나눠, 0038 적용 후 화면을 먼저 배포해 실기기로 확인한 뒤 0039로 넘어간다.

**Tech Stack:** Next.js 16(App Router)·React 19·TypeScript·Tailwind v4·Supabase(Postgres RPC·RLS)·vitest. DB는 SQL Editor에 **사용자가 수동 Run**.

**설계 문서:** `docs/superpowers/specs/2026-07-28-crew-link-graph-design.md` (커밋 `be70656`)

---

## 0. 현재 상태 지도 (콜드 에이전트 필독)

프로덕션 **https://gnd-one.vercel.app**. 저장소 `workout-app`, 브랜치 `main`.

**게이트(모든 커밋 전):** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
**현재 테스트 수:** 483 passed (49 파일). 이 계획은 여기에 **+18개**를 더한다.

**마이그레이션:** 신규 번호 파일로만. **0001~0037 적용됨·수정 금지.** 다음 번호 **0038**. 상단에 "SQL Editor Run" 주석. **DDL은 에이전트가 못 돌린다 — 사용자에게 Run 요청 후 실 DB 스크립트로 검증한다.**

**핵심 파일·심볼 (실측):**

| 대상 | 위치 | 핵심 |
|---|---|---|
| 관계 판정 | `0001_identity_crew.sql:61` | `shares_group_with(uid)` — 같은 그룹인가 |
| `profiles` SELECT RLS | `0001_identity_crew.sql:81` | `id = auth.uid() or shares_group_with(id)` |
| `notify` 헬퍼 | `0011_social.sql:183` | `notify(user, actor, type, ref, title, body)` — 단순 insert, 알림설정 검사 **안 함**. `authenticated`에서 revoke됨(정의자 함수만 호출 가능) |
| 알림 type 제약 | `0034_notification_app_update.sql:12` | 허용 목록 방식. 새 type은 목록에 더해야 한다 |
| 크루 조회 | `src/lib/crew.ts:74` | `getCrewProfiles(groupId)` → `Profile[]` |
| 피드 조회 | `src/lib/social.ts:149` | `getGroupFeed(groupId, myUserId, before?, photoOnly?)` |
| 소셜 에러 | `src/lib/social.ts:46` | `SocialErrorCode` 유니온 + `SOCIAL_ERROR_CODES` 배열 **둘 다** 고쳐야 한다 |
| 알림 행 타입 | `src/lib/social.ts:24` | `NotificationRow['type']` 유니온 |
| 크루원 시트 | `src/components/crew/member-profile-sheet.tsx` | `MemberProfileSheet({ member, onClose })` — 그대로 재사용 |
| 프로필 탭 | `src/app/(tabs)/profile/page.tsx` | `TOGGLES` 배열 + 성장 허브. 여기에 크루 메뉴를 단다 |
| 실 DB 검증 관례 | `scripts/crew-profile-check.mjs` | `.env.local` 파싱 → anon signup(REST) → RPC 호출 → `check(name, ok)` 집계 |

**테스트 관례:** 순수 도메인은 `src/lib/domain/*.test.ts`(vitest), 컴포넌트는 `renderToStaticMarkup` SSR(`src/components/**/*.test.tsx`).

### 0.1 함정 — 고칠 정의는 "가장 나중에 덮어쓴 것"이다

이 저장소는 마이그레이션마다 `create or replace function`으로 같은 함수를 덮어쓴다. **옛 번호 파일을 고치면 아무 효과가 없다.**

| 함수 | 덮어쓴 이력 | **현행(고칠 것)** |
|---|---|---|
| `mark_record_beaten` | 0018 → 0020 → 0021 → 0032 | **`0032_badge_point_engine.sql:355`** |
| `poke_user` | 0011 → 0028 | **`0028_poke_requires_workout.sql:15`** |
| `get_crew_member_profile` | 0026 → 0032 | **`0032_badge_point_engine.sql:382`** |
| `evaluate_badges` | 0032 → 0036 | `0036` — 배지 알림은 **본인 대상**이라 수정 없음 |
| `start_workout` | 0011 | `0011_social.sql:196` |
| `apply_xp_and_progress` | 0029 | `0029_level_up_notification.sql:48` |
| `view_record` | 0012 | `0012_record_view_rpc.sql` |

**Task 8에서 이 함수들을 옮겨 쓸 때는 파일이 아니라 DB에서 현행 정의를 뽑는다.** 방법은 Task 8 Step 1에 있다.

---

## 1. 실행 순서 (중요)

```
Task 1~2   0038 작성 (테이블·RPC·알림유형·이관)      — 코드만, DB 무변화
Task 3     사용자가 0038 Run  →  scripts/crew-link-check.mjs 로 실 DB 검증
Task 4~7   도메인·클라·화면 (/crew) 구현              — 0038만으로 동작
Task 8     0039 작성 (관계 판정·팬아웃·RLS 전환)      — 코드만, DB 무변화
Task 9     사용자가 0039 Run  →  회귀 검증
Task 10~11 클라 조회 전환(피드·홈) + 브리핑 본문 제거
Task 12    최종 게이트 · 배포 · 릴리스 노트
```

**왜 나누는가.** 0038까지만 적용된 상태에서도 앱은 지금과 똑같이 돈다(그룹 기반 판정이 그대로 살아 있다). 크루 화면을 먼저 배포해 실기기로 요청·수락을 확인한 뒤 0039로 전환하면, 문제가 생겨도 되돌릴 지점이 있다. 한 번에 하면 "요청도 안 되고 피드도 비어 있는" 상태에서 원인을 못 가른다.

---

## 2. 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0038_crew_link_graph.sql` | 테이블·RLS·`is_crew_with`·알림유형·RPC 8개·기존 크루 이관 |
| `supabase/migrations/0039_crew_link_switchover.sql` | 관계 판정 교체·팬아웃 3곳·세션 RLS 2곳 |
| `src/lib/domain/crew-link.ts` | 순수 함수 — 닉네임 정규화, 쌍 정렬, 버튼 상태 판정 |
| `src/lib/domain/crew-link.test.ts` | 위의 vitest |
| `src/lib/crew-link.ts` | Supabase RPC 래퍼 (`searchProfileByNickname`·`sendCrewRequest`·…) |
| `src/components/crew/crew-search-result.tsx` | 검색 결과 1행 — 상태별 버튼 |
| `src/components/crew/crew-search-result.test.tsx` | SSR 테스트 |
| `src/components/crew/crew-list.tsx` | 내 크루 목록 + 받은 요청 목록 (표시 전용) |
| `src/components/crew/crew-list.test.tsx` | SSR 테스트 |
| `src/app/crew/page.tsx` | `/crew` 화면 — 조회·상태·액션 배선 |
| `scripts/crew-link-check.mjs` | 실 DB 검증 (요청·수락·자동수락·차단·해제) |

**수정**

| 파일 | 무엇 |
|---|---|
| `src/lib/social.ts` | `NotificationRow['type']`에 2종, `SocialErrorCode`+배열에 6종 |
| `src/lib/social.ts:149` | `getGroupFeed` → `getCrewFeed` |
| `src/lib/workout.ts:842` | `getLatestCrewWorkoutWithPhoto(groupId)` → 크루 기준 |
| `src/app/(tabs)/feed/page.tsx` | `getCrewFeed`로 |
| `src/app/(tabs)/profile/page.tsx` | 크루 메뉴 진입점 |
| `src/components/crew-card.tsx` | `getMyCrew()`로 |
| `src/components/crew-latest-workout.tsx` | 그룹 조회 제거 |
| `src/components/feed/active-workout-cards.tsx` | 크루 기준 |
| `src/components/home/king-card.tsx` | `getMyCrew()`로 |
| `src/components/notification-bell.tsx` | 새 알림 2종 라우팅 |
| `src/lib/domain/briefing.ts` + `.test.ts` + `src/app/api/briefing/route.ts` | 본문 제거 |

**손대지 않음:** `src/app/(tabs)/challenge/page.tsx`, `src/components/home/challenge-performance-card.tsx`, `src/app/(tabs)/record/page.tsx` — 전부 챌린지·세션 소속용 그룹 조회다. 챌린지는 이번 범위 밖(설계 §15).

---

## Task 1: 마이그레이션 0038 — 테이블·RLS·판정·알림유형·이관

**Files:** Create `supabase/migrations/0038_crew_link_graph.sql`

- [ ] **Step 1: 파일 생성 — 헤더와 스키마**

```sql
-- 0038: 크루 연결 그래프 — 닉네임 검색 · 상호 수락 (추가만)
-- 설계: docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
-- 계획: docs/superpowers/plans/2026-07-28-crew-link-graph.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0037은 수정 금지.
--
-- 이 파일은 테이블·판정함수·알림유형·RPC를 "추가"만 한다. 기존 그룹 기반 권한
-- 검사는 그대로라 적용 직후에도 앱은 지금과 똑같이 돈다. 실제 전환은 0039다.
-- 순서를 나눈 이유: 0038만 적용된 상태로 크루 화면을 먼저 배포해 실기기로 확인한
-- 뒤 0039로 전환해야, 문제가 생겨도 되돌릴 지점이 있다.

-- ── 1. 요청 이력 ─────────────────────────────────────────────
create table if not exists public.crew_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint crew_requests_not_self check (requester_id <> addressee_id)
);

-- 진행 중 요청은 방향당 1건. 거절 뒤 재요청은 새 행으로 허용된다.
create unique index if not exists crew_requests_pending_unique
  on public.crew_requests (requester_id, addressee_id)
  where status = 'pending';
create index if not exists crew_requests_inbox_idx
  on public.crew_requests (addressee_id, status);
-- requester_id는 위 부분 인덱스가 pending만 덮으므로 별도로 깐다. 없으면
-- profiles의 on delete cascade가 이 테이블을 통째로 훑는다.
create index if not exists crew_requests_outbox_idx
  on public.crew_requests (requester_id, status);

-- ── 2. 수락된 연결 ───────────────────────────────────────────
-- user_a < user_b 정규화: 대칭 관계를 두 행으로 저장하면 한쪽만 지워진 반쪽
-- 상태가 생긴다. "쌍 하나 = 행 하나"를 DB가 강제한다.
create table if not exists public.crew_links (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint crew_links_ordered check (user_a < user_b)
);
create index if not exists crew_links_user_b_idx on public.crew_links (user_b);

-- ── 3. RLS — 읽기만 열고 쓰기는 RPC로만 ──────────────────────
alter table public.crew_requests enable row level security;
alter table public.crew_links enable row level security;
revoke all on public.crew_requests from anon, authenticated;
revoke all on public.crew_links from anon, authenticated;
grant select on public.crew_requests to authenticated;
grant select on public.crew_links to authenticated;

drop policy if exists "crew_requests_mine_select" on public.crew_requests;
create policy "crew_requests_mine_select" on public.crew_requests
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "crew_links_mine_select" on public.crew_links;
create policy "crew_links_mine_select" on public.crew_links
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ── 4. 관계 판정 — 0039가 shares_group_with 자리에 이걸 넣는다 ─
-- RLS 정책이 부르는 판정 함수라 revoke하지 않는다(0001의 shares_group_with와 같다).
-- 정책은 호출자 권한으로 평가되므로 revoke하면 anon 요청이 0행이 아니라 42501로 죽는다.
-- auth.uid()는 스칼라 서브쿼리로 감싼다 — stable sql 함수는 정책에 인라인돼
-- 후보 행마다 재평가되는데, 감싸면 쿼리당 1회(InitPlan)로 끝난다.
create or replace function public.is_crew_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_links
    where user_a = least((select auth.uid()), uid)
      and user_b = greatest((select auth.uid()), uid)
  )
$$;

-- ── 5. 알림 유형 2종 추가 (0034 목록에 이어붙임) ─────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted'
));
```

- [ ] **Step 2: 같은 파일 끝에 기존 크루 이관 추가**

```sql
-- ── 6. 기존 크루원 자동 연결 ─────────────────────────────────
-- 같은 그룹에 있던 모든 쌍을 연결로 옮긴다. 리얼GND 3명 → 3쌍.
-- crew_links가 비어 있을 때만 돈다 — 이 파일을 다시 Run해도 "해제한 사이"가
-- 되살아나지 않게 하려는 것이다. on conflict는 중복만 막고 삭제는 못 막는다.
-- 프로필 없는 계정(온보딩 미완)은 FK가 막으므로 미리 걸러 낸다.
insert into public.crew_links (user_a, user_b)
select distinct a.user_id, b.user_id
from public.group_members a
join public.group_members b
  on a.group_id = b.group_id and a.user_id < b.user_id
where not exists (select 1 from public.crew_links)
  and exists (select 1 from public.profiles p where p.id = a.user_id)
  and exists (select 1 from public.profiles p where p.id = b.user_id)
on conflict do nothing;
```

`a.user_id < b.user_id` 조건이 정규화(`user_a < user_b`)를 이미 만족시키므로 `least/greatest`가 필요 없다.

**`where not exists (select 1 from crew_links)` 가드가 이 블록의 핵심이다.** 다음 태스크에서 같은 파일에 `remove_crew`(연결 삭제)가 붙는다. 가드가 없으면 파일을 다시 Run하는 순간 **일부러 해제한 사이가 되살아난다** — 상대에게 내 피드·레벨·배지가 다시 열리는데 아무도 눈치채지 못한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0038_crew_link_graph.sql
git commit -m "feat(0038): 크루 연결 그래프 스키마 + 관계 판정 + 기존 크루 이관"
```

---

## Task 2: 마이그레이션 0038 — RPC 8개

**Files:** Modify `supabase/migrations/0038_crew_link_graph.sql` (파일 끝에 추가)

- [ ] **Step 1: 검색 RPC**

```sql
-- ── 7. RPC ───────────────────────────────────────────────────
-- 검색은 정확 일치 1행만 준다. 앞글자 검색을 열면 전체 가입자 명단을 훑을 수
-- 있고, 유료 확장 시 그대로 위험이 된다. 닉네임은 0017에서 유일값이다.
-- relation을 서버가 실어 주므로 화면이 버튼 상태를 추측하지 않는다.
create or replace function public.search_profile_by_nickname(p_nickname text)
returns table (
  id uuid, nickname text, avatar_url text,
  relation text, request_id uuid
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.nickname, p.avatar_url,
    case
      when p.id = auth.uid()            then 'self'
      when public.is_crew_with(p.id)    then 'crew'
      when r_out.id is not null         then 'request_sent'
      when r_in.id is not null          then 'request_received'
      else 'none'
    end,
    coalesce(r_out.id, r_in.id)
  from public.profiles p
  left join public.crew_requests r_out
    on r_out.requester_id = auth.uid()
   and r_out.addressee_id = p.id
   and r_out.status = 'pending'
  left join public.crew_requests r_in
    on r_in.requester_id = p.id
   and r_in.addressee_id = auth.uid()
   and r_in.status = 'pending'
  where auth.uid() is not null
    and btrim(p_nickname) <> ''
    and lower(btrim(p.nickname)) = lower(btrim(p_nickname))
  limit 1
$$;
revoke all on function public.search_profile_by_nickname(text) from public, anon;
grant execute on function public.search_profile_by_nickname(text) to authenticated;
```

- [ ] **Step 2: 수락 RPC (요청 RPC가 이걸 부르므로 먼저 정의한다)**

```sql
create or replace function public.accept_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_req crew_requests%rowtype;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> v_me then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  insert into crew_links (user_a, user_b)
  values (least(v_req.requester_id, v_req.addressee_id),
          greatest(v_req.requester_id, v_req.addressee_id))
  on conflict do nothing;

  update crew_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id;

  -- 반대 방향에 남아 있던 pending도 함께 닫는다. 안 닫으면 이미 크루가 된
  -- 뒤에도 상대 받은함에 요청이 남아 "수락" 버튼이 계속 보인다.
  update crew_requests
     set status = 'accepted', responded_at = now()
   where requester_id = v_req.addressee_id
     and addressee_id = v_req.requester_id
     and status = 'pending';

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    v_req.requester_id, v_me, 'crew_accepted', p_request_id,
    coalesce(v_nick, '누군가') || '님과 크루가 됐어요 🤝',
    '이제 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'accepted');
end $$;
revoke all on function public.accept_crew_request(uuid) from public, anon;
grant execute on function public.accept_crew_request(uuid) to authenticated;
```

- [ ] **Step 3: 요청 RPC (역방향 자동 수락 포함)**

```sql
create or replace function public.send_crew_request(p_target_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_nick text;
  v_reverse crew_requests%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_request'; end if;
  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if public.is_crew_with(p_target_id) then raise exception 'already_crew'; end if;

  -- 역방향 pending이 있으면 양쪽이 서로를 원한 것이다 → 즉시 맺는다.
  -- 이게 없으면 "둘 다 요청했는데 아무 일도 안 일어남"이 되고, 사용자는
  -- 원인을 알 수 없다.
  select * into v_reverse from crew_requests
  where requester_id = p_target_id and addressee_id = v_me
    and status = 'pending'
  limit 1;
  if found then
    perform public.accept_crew_request(v_reverse.id);
    return jsonb_build_object('status', 'accepted', 'requestId', v_reverse.id);
  end if;

  if exists (select 1 from crew_requests
             where requester_id = v_me and addressee_id = p_target_id
               and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into crew_requests (requester_id, addressee_id)
  values (v_me, p_target_id)
  returning id into v_id;

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    p_target_id, v_me, 'crew_request', v_id,
    coalesce(v_nick, '누군가') || '님이 크루 요청을 보냈어요 🤝',
    '수락하면 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'pending', 'requestId', v_id);
end $$;
revoke all on function public.send_crew_request(uuid) from public, anon;
grant execute on function public.send_crew_request(uuid) to authenticated;
```

- [ ] **Step 4: 거절·취소·해제 RPC**

세 개 모두 **알림을 보내지 않는다.** 거절당한 사실을 통보하면 지인 기반 앱에서 관계가 상한다(설계 D7).

`cancel_crew_request`는 **서버에만 둔다.** 화면에서 `request_sent`는 비활성 "요청됨"이라 취소 버튼이 없다(설계 §9). Task 5의 클라이언트 래퍼에도 넣지 않는다 — 쓰지 않는 코드를 미리 만들지 않는다. 나중에 취소 UI를 붙일 때 RPC는 이미 있다.

```sql
create or replace function public.reject_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> auth.uid() then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'rejected', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end $$;

create or replace function public.cancel_crew_request(p_request_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_requester';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'canceled', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'canceled');
end $$;

create or replace function public.remove_crew(p_target_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from crew_links
   where user_a = least(auth.uid(), p_target_id)
     and user_b = greatest(auth.uid(), p_target_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'not_crew'; end if;
  return jsonb_build_object('status', 'removed');
end $$;

revoke all on function public.reject_crew_request(uuid) from public, anon;
revoke all on function public.cancel_crew_request(uuid) from public, anon;
revoke all on function public.remove_crew(uuid) from public, anon;
grant execute on function public.reject_crew_request(uuid) to authenticated;
grant execute on function public.cancel_crew_request(uuid) to authenticated;
grant execute on function public.remove_crew(uuid) to authenticated;
```

- [ ] **Step 5: 목록 조회 RPC 2개**

`user_progress`는 본인 전용 RLS(0022)라 클라가 남의 레벨을 직접 못 읽는다. 0026이 쓴 정의자 패턴을 그대로 따라 **레벨까지 함께** 돌려준다(왕복 1회, 권한 검사 1곳).

```sql
create or replace function public.get_my_crew()
returns table (
  id uuid, nickname text, avatar_url text,
  total_xp integer, current_level smallint, current_stage smallint,
  linked_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url,
         coalesce(up.total_xp, 0),
         coalesce(up.current_level, 1::smallint),
         coalesce(up.current_stage, 1::smallint),
         l.created_at
  from public.crew_links l
  join public.profiles p
    on p.id = case when l.user_a = auth.uid() then l.user_b else l.user_a end
  left join public.user_progress up on up.user_id = p.id
  where auth.uid() in (l.user_a, l.user_b)
  order by p.nickname
$$;

create or replace function public.get_incoming_crew_requests()
returns table (
  request_id uuid, requester_id uuid,
  nickname text, avatar_url text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.requester_id, p.nickname, p.avatar_url, r.created_at
  from public.crew_requests r
  join public.profiles p on p.id = r.requester_id
  where r.addressee_id = auth.uid() and r.status = 'pending'
  order by r.created_at desc
$$;

revoke all on function public.get_my_crew() from public, anon;
revoke all on function public.get_incoming_crew_requests() from public, anon;
grant execute on function public.get_my_crew() to authenticated;
grant execute on function public.get_incoming_crew_requests() to authenticated;
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0038_crew_link_graph.sql
git commit -m "feat(0038): 크루 요청·수락·해제·검색 RPC"
```

---

## Task 3: 0038 적용 + 실 DB 검증

**Files:** Create `scripts/crew-link-check.mjs`

- [ ] **Step 1: 검증 스크립트 작성**

`scripts/crew-profile-check.mjs`의 `.env.local` 파싱·`api()`·`check()` 골격을 그대로 따른다. 새로 만드는 것은 시나리오뿐이다.

```js
// 0038 검증: 크루 연결 그래프 — 요청·수락·자동수락·중복차단·해제.
// 실행: node scripts/crew-link-check.mjs
// 사전조건: 0038이 적용되어 있어야 한다.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(".env.local에 Supabase 설정이 없습니다");
}

const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (ok) passed++;
  else failed++;
}

async function api(token, method, path, body, prefer = "return=representation") {
  const service = token === SERVICE_KEY;
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: service ? SERVICE_KEY : ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function signUp(tag) {
  const email = `crewlink-${RUN}-${tag}@example.com`;
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `pw-${RUN}-${tag}!` }),
  });
  const json = await res.json();
  const token = json.access_token;
  const id = json.user?.id;
  if (!token || !id) throw new Error(`signup 실패(${tag}): ${JSON.stringify(json)}`);
  const nickname = `링크${RUN}${tag}`;
  await api(token, "POST", "/rest/v1/profiles", {
    id, nickname, avatar_url: "🐤", weekly_goal: 3, timezone: "Asia/Seoul",
  });
  return { id, token, nickname };
}

async function rpc(token, name, args) {
  return api(token, "POST", `/rest/v1/rpc/${name}`, args ?? {});
}

async function main() {
  const a = await signUp("a");
  const b = await signUp("b");
  const c = await signUp("c");

  // 1. 검색 — 정확 일치
  let r = await rpc(a.token, "search_profile_by_nickname", { p_nickname: b.nickname });
  check("검색: 정확 일치 1행", r.json?.length === 1 && r.json[0].id === b.id, JSON.stringify(r.json));
  check("검색: relation=none", r.json?.[0]?.relation === "none", r.json?.[0]?.relation);

  // 2. 검색 — 앞글자로는 안 나온다
  r = await rpc(a.token, "search_profile_by_nickname", {
    p_nickname: b.nickname.slice(0, 2),
  });
  check("검색: 앞글자 부분일치 0행", (r.json ?? []).length === 0, JSON.stringify(r.json));

  // 3. 요청
  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check("요청: pending 생성", r.json?.status === "pending", JSON.stringify(r.json));
  const reqId = r.json?.requestId;

  // 4. 중복 요청 차단
  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check("요청: 중복 차단", JSON.stringify(r.json).includes("request_exists"), JSON.stringify(r.json));

  // 5. 자기 자신 차단
  r = await rpc(a.token, "send_crew_request", { p_target_id: a.id });
  check("요청: 자기 자신 차단", JSON.stringify(r.json).includes("self_request"), JSON.stringify(r.json));

  // 6. 받은 요청 목록
  r = await rpc(b.token, "get_incoming_crew_requests");
  check("받은요청: 1건", r.json?.length === 1 && r.json[0].request_id === reqId, JSON.stringify(r.json));

  // 7. 제3자는 남의 요청을 수락 못 한다
  r = await rpc(c.token, "accept_crew_request", { p_request_id: reqId });
  check("수락: 제3자 차단", JSON.stringify(r.json).includes("not_addressee"), JSON.stringify(r.json));

  // 8. 수락
  r = await rpc(b.token, "accept_crew_request", { p_request_id: reqId });
  check("수락: 성공", r.json?.status === "accepted", JSON.stringify(r.json));

  // 9. 양쪽 목록에 서로가 보인다
  const crewA = await rpc(a.token, "get_my_crew");
  const crewB = await rpc(b.token, "get_my_crew");
  check("목록: A에 B", (crewA.json ?? []).some((m) => m.id === b.id), JSON.stringify(crewA.json));
  check("목록: B에 A", (crewB.json ?? []).some((m) => m.id === a.id), JSON.stringify(crewB.json));

  // 10. 이미 크루면 재요청 차단
  r = await rpc(a.token, "send_crew_request", { p_target_id: b.id });
  check("요청: 이미 크루 차단", JSON.stringify(r.json).includes("already_crew"), JSON.stringify(r.json));

  // 11. 역방향 동시 요청 → 자동 수락 (A→C 보낸 상태에서 C→A)
  await rpc(a.token, "send_crew_request", { p_target_id: c.id });
  r = await rpc(c.token, "send_crew_request", { p_target_id: a.id });
  check("요청: 역방향 자동 수락", r.json?.status === "accepted", JSON.stringify(r.json));

  // 12. 크루 요청 알림이 실제로 쌓였다
  r = await api(b.token, "GET", "/rest/v1/notifications?type=eq.crew_request&select=id");
  check("알림: crew_request 도달", (r.json ?? []).length >= 1, JSON.stringify(r.json));
  r = await api(a.token, "GET", "/rest/v1/notifications?type=eq.crew_accepted&select=id");
  check("알림: crew_accepted 도달", (r.json ?? []).length >= 1, JSON.stringify(r.json));

  // 13. 직접 쓰기는 막혀 있다
  r = await api(a.token, "POST", "/rest/v1/crew_links", {
    user_a: a.id, user_b: c.id,
  });
  check("RLS: crew_links 직접 insert 차단", r.status >= 400, `status=${r.status}`);

  // 14. 해제
  r = await rpc(a.token, "remove_crew", { p_target_id: b.id });
  check("해제: 성공", r.json?.status === "removed", JSON.stringify(r.json));
  const after = await rpc(a.token, "get_my_crew");
  check("해제: 목록에서 사라짐", !(after.json ?? []).some((m) => m.id === b.id), JSON.stringify(after.json));

  // 15. 크루 아닌 상대 해제는 에러
  r = await rpc(a.token, "remove_crew", { p_target_id: b.id });
  check("해제: 비크루 차단", JSON.stringify(r.json).includes("not_crew"), JSON.stringify(r.json));

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) process.exitCode = 1;
}

await main();
```

- [ ] **Step 2: 사용자에게 0038 Run 요청**

작업을 멈추고 사용자에게 요청한다:

> `supabase/migrations/0038_crew_link_graph.sql` 전체를 Supabase SQL Editor에 붙여넣고 Run 해주세요. 완료되면 알려주세요.

**사용자가 완료를 알리기 전에는 다음 Step으로 넘어가지 않는다.**

- [ ] **Step 3: 검증 실행**

Run: `node scripts/crew-link-check.mjs`
Expected: `19/19 passed` (위 스크립트의 `check()` 호출 19건). 하나라도 FAIL이면 원인을 고치고 **새 번호(0040)** 로 보정한다 — **0038 파일은 이미 Run됐으므로 수정하지 않는다.**

- [ ] **Step 4: 기존 3명 이관 확인**

Supabase SQL Editor에서 사용자가 실행:

```sql
select count(*) from crew_links;
```

Expected: **3** (리얼GND 3명 → 3쌍). 테스트 계정 쌍이 남아 있으면 그보다 크게 나온다 — 스크립트가 만든 `링크*` 계정은 Step 5에서 지운다.

- [ ] **Step 5: 테스트 계정 정리**

`scripts/crew-profile-check.mjs`와 같은 관례로, service_role로 `crewlink-<RUN>-*@example.com` 계정을 지운다. 실계정 4개(오뎅끼데스까·스칼레또·낭만송곳니·repro-mry7tyx0)는 **절대 건드리지 않는다.**

- [ ] **Step 6: 커밋**

```bash
git add scripts/crew-link-check.mjs
git commit -m "test(0038): 크루 연결 그래프 실 DB 검증 스크립트"
```

---

## Task 4: 순수 도메인 — `crew-link.ts`

**Files:**
- Create: `src/lib/domain/crew-link.ts`
- Test: `src/lib/domain/crew-link.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  crewActionButton,
  isSearchable,
  normalizeNickname,
  orderedPair,
  type CrewRelation,
} from "./crew-link";

describe("normalizeNickname", () => {
  it("앞뒤 공백을 없앤다", () => {
    expect(normalizeNickname("  스칼레또 ")).toBe("스칼레또");
  });
  it("대소문자를 낮춘다 — 서버 비교와 같은 규칙이어야 한다", () => {
    expect(normalizeNickname("GnD")).toBe("gnd");
  });
});

describe("isSearchable", () => {
  it("공백만 있으면 검색하지 않는다", () => {
    expect(isSearchable("   ")).toBe(false);
  });
  it("한 글자여도 정확 일치 검색이므로 허용한다", () => {
    expect(isSearchable("가")).toBe(true);
  });
});

describe("orderedPair", () => {
  it("순서를 바꿔 넣어도 같은 쌍이 나온다", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    expect(orderedPair(a, b)).toEqual(orderedPair(b, a));
  });
  it("사전순으로 정렬한다 — DB의 user_a < user_b와 같은 규칙", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    expect(orderedPair(b, a)).toEqual([a, b]);
  });
});

describe("crewActionButton", () => {
  const cases: [CrewRelation, string, boolean][] = [
    ["none", "크루 요청", false],
    ["request_received", "수락하기", false],
    ["request_sent", "요청됨", true],
    ["crew", "이미 크루", true],
    ["self", "나예요", true],
  ];
  it.each(cases)("%s → %s (disabled=%s)", (relation, label, disabled) => {
    const button = crewActionButton(relation);
    expect(button.label).toBe(label);
    expect(button.disabled).toBe(disabled);
  });

  it("none만 send, request_received만 accept를 낸다", () => {
    expect(crewActionButton("none").action).toBe("send");
    expect(crewActionButton("request_received").action).toBe("accept");
    expect(crewActionButton("crew").action).toBe("none");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/crew-link.test.ts`
Expected: FAIL — `Failed to resolve import "./crew-link"`

- [ ] **Step 3: 구현**

```ts
/**
 * 크루 연결 순수 함수 — 설계 docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
 * 화면·서버가 같은 규칙을 쓰도록 정규화와 버튼 판정을 여기 한 곳에 둔다.
 */

/** 서버 search_profile_by_nickname이 돌려주는 관계 5값 */
export type CrewRelation =
  | "self"
  | "crew"
  | "request_sent"
  | "request_received"
  | "none";

export type CrewSearchResult = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  relation: CrewRelation;
  requestId: string | null;
};

export type CrewMember = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  totalXp: number;
  currentLevel: number;
  currentStage: number;
};

export type CrewRequest = {
  requestId: string;
  requesterId: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: Date;
};

/** 서버의 lower(btrim(...))과 같은 규칙 — 두 곳이 갈라지면 "찾았는데 없다"가 된다 */
export function normalizeNickname(input: string): string {
  return input.trim().toLowerCase();
}

export function isSearchable(input: string): boolean {
  return normalizeNickname(input).length > 0;
}

/** DB의 user_a < user_b 정규화와 같은 규칙 */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type CrewAction = "send" | "accept" | "none";

export type CrewActionButton = {
  label: string;
  action: CrewAction;
  disabled: boolean;
};

/** 검색 결과 버튼 — 서버가 준 relation만으로 결정한다(클라가 추측하지 않는다) */
export function crewActionButton(relation: CrewRelation): CrewActionButton {
  switch (relation) {
    case "none":
      return { label: "크루 요청", action: "send", disabled: false };
    case "request_received":
      return { label: "수락하기", action: "accept", disabled: false };
    case "request_sent":
      return { label: "요청됨", action: "none", disabled: true };
    case "crew":
      return { label: "이미 크루", action: "none", disabled: true };
    case "self":
      return { label: "나예요", action: "none", disabled: true };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/domain/crew-link.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/crew-link.ts src/lib/domain/crew-link.test.ts
git commit -m "feat: 크루 연결 순수 도메인(닉네임 정규화·쌍 정렬·버튼 판정)"
```

---

## Task 5: 클라이언트 API — `src/lib/crew-link.ts` + 에러 코드 확장

**Files:**
- Create: `src/lib/crew-link.ts`
- Modify: `src/lib/social.ts:24`(알림 type), `src/lib/social.ts:46`+`:62`(에러 코드)

- [ ] **Step 1: `social.ts`의 알림 type 유니온에 2종 추가**

`src/lib/social.ts:24`의 `type:` 유니온 끝(`| "app_update"; // 0034 — 배포·업데이트 소식`) 뒤에 추가:

```ts
    | "app_update" // 0034 — 배포·업데이트 소식
    | "crew_request" // 0038 — 크루 요청 도착
    | "crew_accepted"; // 0038 — 상대가 내 요청을 수락
```

- [ ] **Step 2: `social.ts`의 에러 코드 확장 — 유니온과 배열 둘 다**

`SocialErrorCode`(`:46`) 유니온에 7개를 더한다:

```ts
  | "self_view"
  | "self_request" // 0038 — 자기 자신에게 요청
  | "already_crew" // 0038 — 이미 크루
  | "request_exists" // 0038 — 진행 중 요청이 이미 있음
  | "target_not_found" // 0038 — 그 닉네임의 사람이 없음
  | "not_addressee" // 0038 — 내가 받은 요청이 아님
  | "not_pending" // 0038 — 이미 처리된 요청
  | "not_requester"; // 0038 — 내가 보낸 요청이 아님
```

**`SOCIAL_ERROR_CODES` 배열(`:62`)에도 같은 7개를 반드시 추가한다.** 배열이 런타임 매칭의 원천이라, 유니온만 고치면 타입은 통과하는데 코드가 `null`로 떨어져 "알 수 없는 오류" 토스트가 뜬다.

```ts
  "self_view",
  "self_request",
  "already_crew",
  "request_exists",
  "target_not_found",
  "not_addressee",
  "not_pending",
  "not_requester",
];
```

`not_crew`는 **이미 배열에 있으므로 추가하지 않는다**(해제 실패 코드로 재사용).

- [ ] **Step 3: RPC 래퍼 작성**

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSearchable } from "@/lib/domain/crew-link";
import type {
  CrewMember,
  CrewRelation,
  CrewRequest,
  CrewSearchResult,
} from "@/lib/domain/crew-link";
import { SocialError, type SocialErrorCode } from "@/lib/social";

/** RPC 에러 문자열 → SocialError. social.ts의 toSocialError와 같은 규칙.
 *  여기 나열한 코드는 전부 Step 2에서 SocialErrorCode에 넣은 것들이다 —
 *  둘이 갈라지면 타입은 통과하는데 화면엔 "알 수 없는 오류"만 뜬다. */
const CREW_ERROR_CODES: SocialErrorCode[] = [
  "self_request",
  "already_crew",
  "request_exists",
  "target_not_found",
  "not_addressee",
  "not_pending",
  "not_requester",
  "not_crew",
];

function toError(error: { message?: string }): SocialError {
  const message = error.message ?? "unknown";
  const found = CREW_ERROR_CODES.find((c) => message.includes(c)) ?? null;
  return new SocialError(message, found);
}

/** 닉네임 정확 일치 검색 — 없으면 null (에러 아님) */
export async function searchProfileByNickname(
  nickname: string,
): Promise<CrewSearchResult | null> {
  if (!isSearchable(nickname)) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("search_profile_by_nickname", {
    p_nickname: nickname,
  });
  if (error) throw toError(error);
  const row = (data ?? [])[0] as
    | {
        id: string;
        nickname: string;
        avatar_url: string | null;
        relation: string;
        request_id: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    relation: row.relation as CrewRelation,
    requestId: row.request_id,
  };
}

export async function getMyCrew(): Promise<CrewMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_crew");
  if (error) throw toError(error);
  return ((data ?? []) as {
    id: string;
    nickname: string;
    avatar_url: string | null;
    total_xp: number;
    current_level: number;
    current_stage: number;
  }[]).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    totalXp: r.total_xp,
    currentLevel: r.current_level,
    currentStage: r.current_stage,
  }));
}

export async function getIncomingCrewRequests(): Promise<CrewRequest[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_incoming_crew_requests");
  if (error) throw toError(error);
  return ((data ?? []) as {
    request_id: string;
    requester_id: string;
    nickname: string;
    avatar_url: string | null;
    created_at: string;
  }[]).map((r) => ({
    requestId: r.request_id,
    requesterId: r.requester_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    createdAt: new Date(r.created_at),
  }));
}

/** 요청 — 역방향 pending이 있으면 서버가 즉시 수락하고 'accepted'를 준다 */
export async function sendCrewRequest(
  targetId: string,
): Promise<"pending" | "accepted"> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_crew_request", {
    p_target_id: targetId,
  });
  if (error) throw toError(error);
  return (data as { status: "pending" | "accepted" }).status;
}

export async function acceptCrewRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("accept_crew_request", {
    p_request_id: requestId,
  });
  if (error) throw toError(error);
}

export async function rejectCrewRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reject_crew_request", {
    p_request_id: requestId,
  });
  if (error) throw toError(error);
}

export async function removeCrew(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("remove_crew", {
    p_target_id: targetId,
  });
  if (error) throw toError(error);
}
```

- [ ] **Step 4: 타입 검사**

Run: `pnpm typecheck`
Expected: 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/crew-link.ts src/lib/social.ts
git commit -m "feat: 크루 연결 RPC 래퍼 + 알림 유형·에러 코드 확장"
```

---

## Task 6: 표시 컴포넌트 2개 (SSR 테스트 먼저)

**Files:**
- Create: `src/components/crew/crew-search-result.tsx`, `src/components/crew/crew-search-result.test.tsx`
- Create: `src/components/crew/crew-list.tsx`, `src/components/crew/crew-list.test.tsx`

두 컴포넌트는 **표시 전용**이다. 조회·상태는 Task 7의 페이지가 맡는다. 이렇게 나눠야 SSR로 렌더해 단언할 수 있다.

- [ ] **Step 1: 검색 결과 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrewSearchResult } from "./crew-search-result";
import type { CrewSearchResult as Result } from "@/lib/domain/crew-link";

const base: Result = {
  id: "u1",
  nickname: "스칼레또",
  avatarUrl: "🐉",
  relation: "none",
  requestId: null,
};

describe("CrewSearchResult", () => {
  it("relation=none이면 요청 버튼이 눌린다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending={false} onAction={() => {}} />,
    );
    expect(html).toContain("크루 요청");
    expect(html).not.toContain("disabled");
  });

  it("relation=crew면 버튼이 잠긴다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult
        result={{ ...base, relation: "crew" }}
        pending={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("이미 크루");
    expect(html).toContain("disabled");
  });

  it("relation=request_received면 수락 버튼이 나온다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult
        result={{ ...base, relation: "request_received", requestId: "r1" }}
        pending={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("수락하기");
  });

  it("닉네임과 아바타를 보여준다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending={false} onAction={() => {}} />,
    );
    expect(html).toContain("스칼레또");
    expect(html).toContain("🐉");
  });

  it("pending이면 눌린 상태로 잠긴다", () => {
    const html = renderToStaticMarkup(
      <CrewSearchResult result={base} pending onAction={() => {}} />,
    );
    expect(html).toContain("disabled");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/components/crew/crew-search-result.test.tsx`
Expected: FAIL — `Failed to resolve import "./crew-search-result"`

- [ ] **Step 3: 검색 결과 컴포넌트 구현**

```tsx
"use client";

import { crewActionButton, type CrewSearchResult as Result } from "@/lib/domain/crew-link";

export function CrewSearchResult({
  result,
  pending,
  onAction,
}: {
  result: Result;
  pending: boolean;
  onAction: (result: Result) => void;
}) {
  const button = crewActionButton(result.relation);
  const disabled = button.disabled || pending;

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/40 text-lg">
          {result.avatarUrl ?? "👤"}
        </span>
        <span className="truncate text-[14px] font-extrabold">
          {result.nickname}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction(result)}
        className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-extrabold text-white disabled:bg-line disabled:text-muted"
      >
        {pending ? "처리 중…" : button.label}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/components/crew/crew-search-result.test.tsx`
Expected: PASS — 5 tests

- [ ] **Step 5: 크루 목록 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrewList } from "./crew-list";
import type { CrewMember, CrewRequest } from "@/lib/domain/crew-link";

const member: CrewMember = {
  id: "u1",
  nickname: "낭만송곳니",
  avatarUrl: "🐺",
  totalXp: 640,
  currentLevel: 3,
  currentStage: 1,
};

const request: CrewRequest = {
  requestId: "r1",
  requesterId: "u2",
  nickname: "오뎅끼데스까",
  avatarUrl: "🍢",
  createdAt: new Date("2026-07-28T09:00:00Z"),
};

const noop = () => {};

describe("CrewList", () => {
  it("크루가 없고 요청도 없으면 빈 상태 안내를 낸다", () => {
    const html = renderToStaticMarkup(
      <CrewList
        members={[]}
        requests={[]}
        pendingIds={new Set()}
        onAccept={noop}
        onReject={noop}
        onRemove={noop}
        onSelect={noop}
      />,
    );
    expect(html).toContain("아직 크루가 없어요");
  });

  it("받은 요청이 있으면 수락·거절이 보인다", () => {
    const html = renderToStaticMarkup(
      <CrewList
        members={[]}
        requests={[request]}
        pendingIds={new Set()}
        onAccept={noop}
        onReject={noop}
        onRemove={noop}
        onSelect={noop}
      />,
    );
    expect(html).toContain("오뎅끼데스까");
    expect(html).toContain("수락");
    expect(html).toContain("거절");
  });

  it("크루원은 닉네임과 레벨을 보여준다", () => {
    const html = renderToStaticMarkup(
      <CrewList
        members={[member]}
        requests={[]}
        pendingIds={new Set()}
        onAccept={noop}
        onReject={noop}
        onRemove={noop}
        onSelect={noop}
      />,
    );
    expect(html).toContain("낭만송곳니");
    expect(html).toContain("Lv.3");
  });

  it("크루가 있으면 빈 상태 문구는 사라진다", () => {
    const html = renderToStaticMarkup(
      <CrewList
        members={[member]}
        requests={[]}
        pendingIds={new Set()}
        onAccept={noop}
        onReject={noop}
        onRemove={noop}
        onSelect={noop}
      />,
    );
    expect(html).not.toContain("아직 크루가 없어요");
  });

  it("크루 수를 제목에 낸다", () => {
    const html = renderToStaticMarkup(
      <CrewList
        members={[member]}
        requests={[]}
        pendingIds={new Set()}
        onAccept={noop}
        onReject={noop}
        onRemove={noop}
        onSelect={noop}
      />,
    );
    expect(html).toContain("내 크루 1명");
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm vitest run src/components/crew/crew-list.test.tsx`
Expected: FAIL — `Failed to resolve import "./crew-list"`

- [ ] **Step 7: 크루 목록 컴포넌트 구현**

```tsx
"use client";

import type { CrewMember, CrewRequest } from "@/lib/domain/crew-link";

export function CrewList({
  members,
  requests,
  pendingIds,
  onAccept,
  onReject,
  onRemove,
  onSelect,
}: {
  members: CrewMember[];
  requests: CrewRequest[];
  pendingIds: Set<string>;
  onAccept: (request: CrewRequest) => void;
  onReject: (request: CrewRequest) => void;
  onRemove: (member: CrewMember) => void;
  onSelect: (member: CrewMember) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-extrabold text-muted">
            받은 요청 {requests.length}건
          </h2>
          {requests.map((r) => (
            <div
              key={r.requestId}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/40 text-lg">
                  {r.avatarUrl ?? "👤"}
                </span>
                <span className="truncate text-[14px] font-extrabold">
                  {r.nickname}
                </span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  disabled={pendingIds.has(r.requestId)}
                  onClick={() => onAccept(r)}
                  className="rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-extrabold text-white disabled:bg-line disabled:text-muted"
                >
                  수락
                </button>
                <button
                  type="button"
                  disabled={pendingIds.has(r.requestId)}
                  onClick={() => onReject(r)}
                  className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted"
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-extrabold text-muted">
          내 크루 {members.length}명
        </h2>
        {members.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-3.5 py-6 text-center text-[13px] text-muted">
            아직 크루가 없어요.
            <br />
            닉네임으로 크루를 찾아보세요 🔍
          </p>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
            >
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line/40 text-lg">
                  {m.avatarUrl ?? "👤"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-extrabold">
                    {m.nickname}
                  </span>
                  <span className="block text-[12px] text-muted">
                    Lv.{m.currentLevel}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={pendingIds.has(m.id)}
                onClick={() => onRemove(m)}
                className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-[12.5px] font-bold text-muted"
              >
                해제
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 8: 통과 확인**

Run: `pnpm vitest run src/components/crew/`
Expected: PASS — 10 tests (5 + 5)

- [ ] **Step 9: 커밋**

```bash
git add src/components/crew/crew-search-result.tsx src/components/crew/crew-search-result.test.tsx src/components/crew/crew-list.tsx src/components/crew/crew-list.test.tsx
git commit -m "feat: 크루 검색 결과·목록 표시 컴포넌트"
```

---

## Task 7: `/crew` 화면 + 프로필 진입점 + 알림 라우팅

**Files:**
- Create: `src/app/crew/page.tsx`
- Modify: `src/app/(tabs)/profile/page.tsx`, `src/components/notification-bell.tsx`

- [ ] **Step 1: `/crew` 페이지 작성**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CrewList } from "@/components/crew/crew-list";
import { CrewSearchResult } from "@/components/crew/crew-search-result";
import { MemberProfileSheet } from "@/components/crew/member-profile-sheet";
import {
  acceptCrewRequest,
  getIncomingCrewRequests,
  getMyCrew,
  rejectCrewRequest,
  removeCrew,
  searchProfileByNickname,
  sendCrewRequest,
} from "@/lib/crew-link";
import {
  isSearchable,
  type CrewMember,
  type CrewRequest,
  type CrewSearchResult as Result,
} from "@/lib/domain/crew-link";
import { SocialError } from "@/lib/social";

export default function CrewPage() {
  const { userId, loading, configured } = useAuth();
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [requests, setRequests] = useState<CrewRequest[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [crew, inbox] = await Promise.all([
      getMyCrew(),
      getIncomingCrewRequests(),
    ]);
    setMembers(crew);
    setRequests(inbox);
  }, []);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [crew, inbox] = await Promise.all([
          getMyCrew(),
          getIncomingCrewRequests(),
        ]);
        if (cancelled) return;
        setMembers(crew);
        setRequests(inbox);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, loading, userId]);

  function toast(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  function withPending<T>(key: string, run: () => Promise<T>) {
    setPendingIds((s) => new Set(s).add(key));
    return run().finally(() =>
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      }),
    );
  }

  async function search() {
    if (!isSearchable(query)) return;
    setSearching(true);
    setSearched(false);
    try {
      setResult(await searchProfileByNickname(query));
      setSearched(true);
    } catch {
      toast("검색에 실패했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setSearching(false);
    }
  }

  async function act(target: Result) {
    await withPending(target.id, async () => {
      try {
        if (target.relation === "request_received" && target.requestId) {
          await acceptCrewRequest(target.requestId);
          toast(`${target.nickname}님과 크루가 됐어요 🤝`);
        } else {
          const status = await sendCrewRequest(target.id);
          toast(
            status === "accepted"
              ? `${target.nickname}님과 크루가 됐어요 🤝`
              : `${target.nickname}님에게 요청을 보냈어요`,
          );
        }
        await reload();
        setResult(await searchProfileByNickname(query));
      } catch (e) {
        const code = e instanceof SocialError ? e.code : null;
        if (code === "already_crew") toast("이미 크루예요");
        else if (code === "request_exists") toast("이미 요청을 보냈어요");
        else if (code === "target_not_found") toast("그 사람을 찾을 수 없어요");
        else toast("요청을 보내지 못했어요");
      }
    });
  }

  async function accept(request: CrewRequest) {
    await withPending(request.requestId, async () => {
      try {
        await acceptCrewRequest(request.requestId);
        toast(`${request.nickname}님과 크루가 됐어요 🤝`);
        await reload();
      } catch {
        toast("수락하지 못했어요");
      }
    });
  }

  async function reject(request: CrewRequest) {
    await withPending(request.requestId, async () => {
      try {
        await rejectCrewRequest(request.requestId);
        await reload();
      } catch {
        toast("거절하지 못했어요");
      }
    });
  }

  async function remove(member: CrewMember) {
    if (!confirm(`${member.nickname}님과 크루를 해제할까요?`)) return;
    await withPending(member.id, async () => {
      try {
        await removeCrew(member.id);
        toast("크루를 해제했어요");
        await reload();
      } catch {
        toast("해제하지 못했어요");
      }
    });
  }

  if (!configured) return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pb-10">
      <header className="flex items-center justify-between gap-2 pt-3 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">크루</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            서로 수락한 사람끼리 운동 소식을 주고받아요
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted"
        >
          닫기
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="닉네임을 정확히 입력하세요"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-2 text-[14px]"
          />
          <button
            type="button"
            disabled={!isSearchable(query) || searching}
            onClick={() => void search()}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-extrabold text-white disabled:bg-line disabled:text-muted"
          >
            찾기
          </button>
        </div>
        {result && (
          <CrewSearchResult
            result={result}
            pending={pendingIds.has(result.id)}
            onAction={(r) => void act(r)}
          />
        )}
        {searched && !result && (
          <p className="px-1 text-[12.5px] text-muted">
            그 닉네임을 쓰는 사람이 없어요. 닉네임은 정확히 일치해야 찾을 수 있어요.
          </p>
        )}
      </section>

      {ready && (
        <CrewList
          members={members}
          requests={requests}
          pendingIds={pendingIds}
          onAccept={(r) => void accept(r)}
          onReject={(r) => void reject(r)}
          onRemove={(m) => void remove(m)}
          onSelect={(m) => setSelected(m)}
        />
      )}

      {notice && (
        <p className="fixed inset-x-4 bottom-6 mx-auto max-w-md rounded-full bg-black/80 px-4 py-2.5 text-center text-[13px] font-bold text-white">
          {notice}
        </p>
      )}

      {selected && (
        <MemberProfileSheet
          userId={selected.id}
          nickname={selected.nickname}
          avatarUrl={selected.avatarUrl}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
```

`MemberProfileSheet`의 실제 props는 `{ userId, nickname, avatarUrl, streak?, onClose }`(`member-profile-sheet.tsx:121`)다 — 객체 하나가 아니라 **평평한 4개**다. `streak`는 선택값이고 크루 목록은 스트릭을 조회하지 않으므로 넘기지 않는다(시트가 알아서 감춘다).

- [ ] **Step 2: 프로필 탭에 진입점 추가**

`src/app/(tabs)/profile/page.tsx`의 `<GrowthHub />` 바로 아래에 메뉴 행을 넣는다. 받은 요청 수를 뱃지로 띄우기 위해 `getIncomingCrewRequests()`를 마운트 시 1회 호출한다.

```tsx
// import 추가
import Link from "next/link";
import { getIncomingCrewRequests } from "@/lib/crew-link";

// 컴포넌트 상태 추가
const [requestCount, setRequestCount] = useState(0);

useEffect(() => {
  if (!configured || loading || !userId) return;
  let cancelled = false;
  getIncomingCrewRequests()
    .then((rows) => {
      if (!cancelled) setRequestCount(rows.length);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [configured, loading, userId]);

// JSX — 성장 허브 아래
<Link
  href="/crew"
  className="flex items-center justify-between rounded-card border border-line bg-surface px-3.5 py-3.5"
>
  <span className="flex items-center gap-2 text-[14px] font-extrabold">
    🤝 크루
    {requestCount > 0 && (
      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-white">
        {requestCount}
      </span>
    )}
  </span>
  <span className="text-[13px] text-muted">닉네임으로 찾기 ›</span>
</Link>
```

- [ ] **Step 3: 알림 라우팅 2종 추가**

`src/components/notification-bell.tsx`에서 알림 type → 이동 경로를 정하는 곳을 찾아(0034가 `app_update` → `/whats-new`를 넣은 자리) 두 줄을 더한다:

```ts
    case "crew_request":
    case "crew_accepted":
      return "/crew";
```

- [ ] **Step 4: 게이트 실행**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0, typecheck 0, **493 passed**(483 + 10), build 성공

- [ ] **Step 5: 커밋**

```bash
git add src/app/crew/page.tsx "src/app/(tabs)/profile/page.tsx" src/components/notification-bell.tsx
git commit -m "feat: 내 정보 › 크루 화면 — 닉네임 검색·요청·수락·해제"
```

- [ ] **Step 6: 배포 + 실기기 확인 (사용자)**

```bash
pnpm dlx vercel deploy --prod --yes
```

사용자에게 요청한다:

> 폰에서 **내 정보 › 크루**를 열어 서로의 닉네임으로 요청·수락이 되는지 확인해 주세요. 이 시점에는 아직 알림·피드는 **기존 크루 기준** 그대로입니다(전환은 다음 단계).

**확인 전에는 Task 8로 넘어가지 않는다.**

---

## Task 8: 마이그레이션 0039 — 관계 판정·팬아웃·RLS 전환

**Files:** Create `supabase/migrations/0039_crew_link_switchover.sql`

- [ ] **Step 1: 현행 함수 정의를 DB에서 뽑는다**

**파일에서 베끼지 마라.** §0.1대로 여러 마이그레이션이 같은 함수를 덮어썼다. 사용자에게 SQL Editor에서 아래를 실행해 결과를 달라고 요청한다:

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('start_workout', 'mark_record_beaten',
                    'apply_xp_and_progress', 'view_record',
                    'get_crew_member_profile');
```

받은 정의를 기준으로 0039를 쓴다. 아래 Step들은 **그 정의에서 바꿀 부분만** 지정한다.

- [ ] **Step 2: 헤더 + 관계 판정 교체**

```sql
-- 0039: 크루 연결로 전환 — 판정·팬아웃·세션 RLS
-- 설계: docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0038은 수정 금지.
--
-- 이 파일부터 "크루"의 뜻이 바뀐다: 같은 그룹 → 서로 수락한 사이.
-- 0038이 is_crew_with와 데이터를 이미 만들어 뒀으므로, 여기서는 판정을 갈아끼운다.
-- 함수 본문은 SQL Editor의 pg_get_functiondef로 뽑은 현행 정의를 옮긴 것이며,
-- 바뀐 줄에는 -- 0039 주석을 달았다.

-- ── 1. profiles SELECT — 그룹 조건은 한시적으로 남긴다 ────────
-- 챌린지 랭킹판에 참가자 닉네임이 떠야 하기 때문이다. 챌린지를 크루 초대
-- 기반으로 개편할 때 or shares_group_with(id)를 지운다. 새는 것은 닉네임과
-- 아바타뿐이고 레벨·배지·기록은 아래에서 전부 크루 전용이 된다.
drop policy if exists "profiles_select_self_or_crew" on public.profiles;
create policy "profiles_select_self_or_crew" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_crew_with(id)
    or public.shares_group_with(id)
  );

-- ── 2. record_views INSERT RLS ───────────────────────────────
drop policy if exists "record_views_insert_crew" on public.record_views;
create policy "record_views_insert_crew" on public.record_views
  for insert with check (
    viewer_id = auth.uid() and public.is_crew_with(target_id)
  );
```

> **주의:** 두 정책의 **실제 이름**을 `0001_identity_crew.sql:81`과 `0011_social.sql:179` 부근에서 확인해 그대로 쓴다. 이름이 다르면 `drop policy if exists`가 조용히 아무것도 안 지우고 **옛 정책이 살아남아 그룹 기준이 유지된다.** 확인 쿼리:
> ```sql
> select policyname, cmd from pg_policies
> where tablename in ('profiles', 'record_views');
> ```

- [ ] **Step 3: `poke_user` 전체 재정의 (한 줄만 바뀜)**

0028의 본문을 그대로 옮기되 `shares_group_with` → `is_crew_with`:

```sql
create or replace function public.poke_user(p_target_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nick text;
  v_wants boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'self_poke';
  end if;
  if not public.is_crew_with(p_target_id) then  -- 0039: 그룹 → 크루 연결
    raise exception 'not_crew';
  end if;

  -- 0028: 오늘 운동을 마친 사람만 찌를 수 있다
  if not exists (
    select 1 from workout_sessions
    where user_id = auth.uid()
      and status = 'completed'
      and deleted_at is null
      and completed_at is not null
      and (completed_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception 'poke_requires_workout';
  end if;

  if exists (
    select 1 from notifications
    where type = 'poke' and actor_id = auth.uid() and user_id = p_target_id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'poke_cooldown';
  end if;

  select coalesce(ns.pokes, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = p_target_id;
  if not v_wants then
    raise exception 'pokes_disabled';
  end if;

  select nickname into v_nick from profiles where id = auth.uid();
  perform notify(
    p_target_id, auth.uid(), 'poke', null,
    coalesce(v_nick, '크루원') || '님이 콕 찔렀어요 👉',
    '오늘 운동 어때요?'
  );
end $$;
revoke execute on function public.poke_user(uuid) from anon, public;
grant execute on function public.poke_user(uuid) to authenticated;
```

- [ ] **Step 4: `view_record`·`get_crew_member_profile` 판정 교체**

Step 1에서 뽑은 정의를 그대로 옮기고, 각각 아래 한 줄만 바꾼다:

- `view_record`: `if not shares_group_with(p_target_id) then` → `if not public.is_crew_with(p_target_id) then`
- `get_crew_member_profile`: `if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then` → `... and not public.is_crew_with(p_target_id) then`

`view_record` 안의 **챌린지 조회(같은 그룹의 active 챌린지)는 그대로 둔다** — 챌린지는 아직 그룹 기반이다.

- [ ] **Step 5: 팬아웃 3곳 교체**

Step 1에서 뽑은 정의를 옮기고, 아래 블록만 갈아끼운다.

**(a) `start_workout` — 운동 시작**

옛:
```sql
  if s.visibility = 'group' and s.group_id is not null then
    ...
    from group_members gm
    where gm.group_id = s.group_id and gm.user_id <> s.user_id;
  end if;
```
새:
```sql
  -- 0039: 크루 연결 기준. group_id 조건을 뺀 이유 — 혼자모드 유저는
  -- group_id가 null이라 지금까지 시작 알림이 한 건도 나가지 않았다.
  if s.visibility = 'group' then
    select nickname into v_nick from profiles where id = s.user_id;
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select case when l.user_a = s.user_id then l.user_b else l.user_a end,
           s.user_id, 'workout_started', s.id,
           coalesce(v_nick, '크루원') || '님이 운동을 시작했어요 💪',
           '응원을 보내볼까요?'
    from crew_links l
    where s.user_id in (l.user_a, l.user_b);
  end if;
```

**(b) `mark_record_beaten` — 기록 갱신**

옛(`0032:355`):
```sql
  from group_members gm
  where gm.user_id <> v_session.user_id
    and gm.group_id in (
      select group_id from group_members where user_id = v_session.user_id);
```
새:
```sql
  from crew_links l                                   -- 0039
  where v_session.user_id in (l.user_a, l.user_b);
```
select 목록의 첫 컬럼 `gm.user_id`도 함께 바꾼다:
```sql
  select case when l.user_a = v_session.user_id then l.user_b else l.user_a end,
```
`select distinct`는 **`distinct`를 빼도 된다** — `crew_links`는 쌍당 1행이라 중복이 없다. 남겨 둬도 무해하다.

**(c) `apply_xp_and_progress` — 레벨업**

옛(`0029:148`):
```sql
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select distinct gm.user_id, p_user_id, 'level_up', null::uuid, v_title, v_body
    from group_members gm
    where gm.user_id <> p_user_id
      and gm.group_id in (
        select group_id from group_members where user_id = p_user_id
      );
```
새:
```sql
    -- reference_id는 uuid 컬럼이다. 타입 없는 null을 그대로 두면 text로 추론돼
    -- 42804로 죽고 완료 트랜잭션 전체가 롤백된다(0029에서 실제로 겪음).
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select case when l.user_a = p_user_id then l.user_b else l.user_a end,
           p_user_id, 'level_up', null::uuid, v_title, v_body
    from crew_links l                                 -- 0039
    where p_user_id in (l.user_a, l.user_b);
```

**`null::uuid` 캐스트를 절대 빼지 마라.** 0029에서 이것 때문에 운동 종료가 통째로 실패한 적이 있다.

- [ ] **Step 6: 세션 열람 RLS 2곳 교체**

```sql
-- ── 세션 공개 판정 — 그룹 소속이 아니라 크루 연결로 ───────────
-- 이 함수가 운동·세트·인증사진까지 연쇄로 열어 준다. 아래 정책만 바꾸고
-- 이 함수를 안 바꾸면 피드에 껍데기(제목만)가 뜬다.
create or replace function public.workout_session_crew_visible(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and s.status = 'completed'
      and s.deleted_at is null
      and public.is_crew_with(s.user_id)   -- 0039
  )
$$;

drop policy if exists "sessions_select_own_or_crew" on public.workout_sessions;
create policy "sessions_select_own_or_crew" on public.workout_sessions
  for select using (
    user_id = auth.uid()
    or (
      visibility = 'group'
      and status = 'completed'
      and deleted_at is null
      and public.is_crew_with(user_id)     -- 0039
    )
  );
```

`sessions_insert_own_draft` 정책은 **손대지 않는다** — 그룹은 챌린지 몫으로 남는다.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/0039_crew_link_switchover.sql
git commit -m "feat(0039): 관계 판정·알림 팬아웃·세션 RLS를 크루 연결 기준으로 전환"
```

---

## Task 9: 0039 적용 + 회귀 검증

- [ ] **Step 1: 사용자에게 0039 Run 요청**

> `supabase/migrations/0039_crew_link_switchover.sql` 전체를 SQL Editor에 붙여넣고 Run 해주세요.

**완료 통보 전에는 다음 Step으로 넘어가지 않는다.**

- [ ] **Step 2: 정책이 실제로 갈렸는지 확인**

사용자에게 SQL Editor에서 실행 요청:

```sql
select tablename, policyname, qual
from pg_policies
where tablename in ('profiles', 'workout_sessions', 'record_views')
order by tablename, policyname;
```

Expected: `profiles`·`workout_sessions`·`record_views` 정책 정의에 **`is_crew_with`가 보인다.** `is_group_member`만 있고 `is_crew_with`가 없으면 정책 이름이 달라 옛 정책이 살아남은 것이다(Task 8 Step 2 주의 참고) — 이름을 확인해 **0040**으로 보정한다.

- [ ] **Step 3: 팬아웃 3종 회귀 검증 스크립트 추가**

`scripts/crew-link-check.mjs` 끝(집계 출력 직전)에 시나리오를 덧붙인다. **3종을 따로따로 확인한다** — 셋이 서로 다른 마이그레이션에 흩어져 있어 하나를 빠뜨려도 나머지 둘이 통과하면 눈치채지 못한다.

```js
  // ── 0039 회귀: 팬아웃은 크루에게만 ─────────────────────────
  const d = await signUp("d"); // 아무와도 연결되지 않은 제3자
  const e = await signUp("e");
  // e와 a를 크루로 맺는다
  const req = await rpc(e.token, "send_crew_request", { p_target_id: a.id });
  await rpc(a.token, "accept_crew_request", { p_request_id: req.json.requestId });

  // a가 운동을 시작한다 (visibility=group, group_id 없음 = 혼자모드)
  const draft = await api(a.token, "POST", "/rest/v1/workout_sessions", {
    user_id: a.id, status: "draft", visibility: "group", timezone: "Asia/Seoul",
  });
  const sessionId = draft.json?.[0]?.id;
  check("세션 생성", !!sessionId, JSON.stringify(draft.json));
  await rpc(a.token, "start_workout", { p_session_id: sessionId });

  const eNotis = await api(e.token, "GET",
    "/rest/v1/notifications?type=eq.workout_started&select=id");
  check("팬아웃①: 크루(e)에게 운동시작 도달 — 그룹 없이도", (eNotis.json ?? []).length >= 1,
    JSON.stringify(eNotis.json));

  const dNotis = await api(d.token, "GET",
    "/rest/v1/notifications?type=eq.workout_started&select=id");
  check("팬아웃①: 비크루(d)에게는 안 감", (dNotis.json ?? []).length === 0,
    JSON.stringify(dNotis.json));

  // 비크루의 프로필·콕·열람 차단
  let blocked = await rpc(d.token, "get_crew_member_profile", { p_target_id: a.id });
  check("차단: 비크루 프로필 조회", JSON.stringify(blocked.json).includes("not_crew"),
    JSON.stringify(blocked.json));
  blocked = await rpc(d.token, "poke_user", { p_target_id: a.id });
  check("차단: 비크루 콕", JSON.stringify(blocked.json).includes("not_crew")
    || JSON.stringify(blocked.json).includes("poke_requires_workout"),
    JSON.stringify(blocked.json));
  blocked = await rpc(d.token, "view_record", { p_target_id: a.id });
  check("차단: 비크루 열람", JSON.stringify(blocked.json).includes("not_crew")
    || JSON.stringify(blocked.json).includes("not_eligible"),
    JSON.stringify(blocked.json));

  // 비크루는 남의 공개 세션을 읽지 못한다
  const peek = await api(d.token, "GET",
    `/rest/v1/workout_sessions?id=eq.${sessionId}&select=id`);
  check("차단: 비크루 세션 열람", (peek.json ?? []).length === 0, JSON.stringify(peek.json));
```

**팬아웃 ② 기록 갱신** — 세션을 완료시킨 뒤 `mark_record_beaten`을 부른다. 완료 시퀀스(운동·세트 추가 → `complete_workout`)는 `scripts/poke-levelup-check.mjs`에 이미 있는 것을 그대로 재사용한다.

```js
  await rpc(a.token, "complete_workout", { p_session_id: sessionId });
  await rpc(a.token, "mark_record_beaten", {
    p_session_id: sessionId,
    p_note: "벤치프레스 지난 기록을 넘었어요",
  });
  const eBeaten = await api(e.token, "GET",
    "/rest/v1/notifications?type=eq.record_beaten&select=id");
  check("팬아웃②: 크루(e)에게 기록갱신 도달", (eBeaten.json ?? []).length >= 1,
    JSON.stringify(eBeaten.json));
  const dBeaten = await api(d.token, "GET",
    "/rest/v1/notifications?type=eq.record_beaten&select=id");
  check("팬아웃②: 비크루(d)에게는 안 감", (dBeaten.json ?? []).length === 0,
    JSON.stringify(dBeaten.json));
```

**팬아웃 ③ 레벨업 — 런타임으로는 못 잡는다. 구조로 잡는다.**

Lv.2는 **200 XP**가 필요한데(`domain/progression.ts`의 `CUTS`), 하루에 받을 수 있는 XP는 기본 100 + 보너스(시간 30 · 기록 10 · 사진 10)로 최대 150이고 **같은 날 두 번째 운동은 0 XP**다(0032). 즉 스크립트 한 번으로는 레벨업을 일으킬 수 없다.

그래서 정의 자체를 단언한다. 사용자에게 SQL Editor 실행을 요청해 결과를 확인한다:

```sql
select
  position('crew_links'   in pg_get_functiondef(p.oid)) > 0 as uses_crew_links,
  position('group_members' in pg_get_functiondef(p.oid)) > 0 as uses_group_members
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'apply_xp_and_progress';
```

Expected: `uses_crew_links = true`, `uses_group_members = false`.

**이 한계를 스크립트 출력에도 남긴다** — 조용히 빠뜨리면 나중에 "전부 검증됨"으로 읽힌다:

```js
  console.log("SKIP 팬아웃③(레벨업): 하루 XP 상한(최대 150 < Lv.2 200)으로 " +
    "런타임 재현 불가 — 0039 Step에서 pg_get_functiondef로 구조 확인할 것");
```

- [ ] **Step 4: 실행**

Run: `node scripts/crew-link-check.mjs`
Expected: 전 항목 PASS (`N/N passed`). 하나라도 FAIL이면 원인을 고쳐 **0040**으로 보정한다.

- [ ] **Step 5: 기존 검증 스크립트 회귀 확인**

Run:
```bash
node scripts/crew-profile-check.mjs
node scripts/poke-levelup-check.mjs
```

두 스크립트는 그룹으로 계정을 엮으므로 **셋업에 크루 연결을 맺는 단계를 추가**한다(`send_crew_request` → `accept_crew_request`). **단언은 그대로 통과해야 한다 — 통과하지 않으면 그게 회귀다.**

- [ ] **Step 6: 테스트 계정 정리 + 커밋**

```bash
git add scripts/
git commit -m "test(0039): 팬아웃 3종·비크루 차단 회귀 검증"
```

---

## Task 10: 클라이언트 조회 전환

**Files:** `src/lib/social.ts:149`, `src/lib/crew.ts`, `src/lib/workout.ts:842`, `src/app/(tabs)/feed/page.tsx`, `src/components/crew-card.tsx`, `src/components/crew-latest-workout.tsx`, `src/components/feed/active-workout-cards.tsx`, `src/components/home/king-card.tsx`

- [ ] **Step 1: `getGroupFeed` → `getCrewFeed`**

`src/lib/social.ts:149`의 시그니처와 쿼리를 바꾼다. `group_id` 필터를 없애고 **내 크루 + 나**로 좁힌다. RLS가 이미 크루 기준이지만, 클라 쿼리도 좁혀야 페이지네이션 개수(`FEED_PAGE_SIZE`)가 정확하다.

```ts
/**
 * 크루(상호 수락) 공개 완료 세션 피드 한 페이지.
 * `before`(ISO)보다 이전 completed_at만 — 페이지네이션 커서.
 * `photoOnly`: true면 인증사진이 있는 세션만.
 */
export async function getCrewFeed(
  myUserId: string,
  before?: string,
  photoOnly = false,
): Promise<FeedItem[]> {
  const supabase = getSupabaseBrowserClient();
  const crew = await getMyCrew();
  const visibleIds = [myUserId, ...crew.map((m) => m.id)];

  const imagesEmbed = photoOnly
    ? "workout_images!inner(image_path)"
    : "workout_images(image_path)";

  let query = supabase
    .from("workout_sessions")
    .select(
      `id, user_id, title, completed_at, duration_minutes, record_note, tabata_minutes, workout_exercises(exercise_name, exercise_type, sort_order, workout_sets(weight_kg, reps, duration_seconds, distance_meters, is_completed)), ${imagesEmbed}`,
    )
    .in("user_id", visibleIds)
    .eq("status", "completed")
    .eq("visibility", "group")
    .is("deleted_at", null)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (before) query = query.lt("completed_at", before);
```

**여기까지가 바뀌는 전부다.** `const { data, error } = await query;`(현행 `social.ts:177`)부터 함수 끝(`:225`)까지 — rows 처리, `fetchProfiles`·`fetchReactions`·`fetchStreaks`·`signFirstImages` 조합, `return rows.map(...)` — 은 **한 글자도 바꾸지 않고 그대로 둔다.**

`getMyCrew`는 `@/lib/crew-link`에서 import한다. `getGroupFeed`라는 이름은 **삭제**한다(호출부가 피드 페이지 2곳뿐이라 typecheck가 남은 참조를 전부 잡는다).

- [ ] **Step 2: `getActiveCrewSessions(groupId)` → `getActiveCrewSessions()`**

`src/lib/social.ts:367`에서 `group_members` 조회를 `getMyCrew()`로 바꾼다:

```ts
export async function getActiveCrewSessions(): Promise<ActiveCrewSession[]> {
  const supabase = getSupabaseBrowserClient();
  const crew = await getMyCrew();
  const memberIds = crew.map((m) => m.id);
  if (memberIds.length === 0) return [];
```

바뀌는 것은 **머리 4줄뿐**이다. 현행 `social.ts:372~378`의 `group_members` 조회를 위 3줄로 갈아끼우고, `const since = ...`(현행 `:381`)부터 함수 끝(`:424`)까지는 그대로 둔다 — `memberIds`라는 변수 이름을 유지했으므로 이후 코드가 손댈 곳 없이 붙는다.

- [ ] **Step 3: `getLatestCrewWorkoutWithPhoto(groupId)` → 크루 기준**

`src/lib/workout.ts:842`에서 `.eq("group_id", groupId)`를 `.in("user_id", crewIds)`로 바꾸고 인자를 없앤다. `crewIds`는 `getMyCrew()`로 얻는다(본인 포함 — 홈 카드가 "(나)" 표시를 이미 한다).

- [ ] **Step 4: 호출부 4곳 정리**

각 파일에서 `getMyGroups()` → 크루 조회로 교체하고, 그룹이 없을 때 렌더를 접던 `if (!g) return;` 가드를 **크루 0명 가드**로 바꾼다.

| 파일 | 바뀌는 것 |
|---|---|
| `src/app/(tabs)/feed/page.tsx:37`·`:78` | `getMyGroups`+`getGroupFeed` → `getCrewFeed(userId)` / `getCrewFeed(userId, before)`. `group` 상태 제거 |
| `src/components/crew-card.tsx:38`·`:43` | `getMyGroups`+`getCrewProfiles` → `getMyCrew()`. **크루 만들기·초대코드 UI는 그대로 둔다**(챌린지 진입 경로) |
| `src/components/crew-latest-workout.tsx:25` | `getMyGroups` 제거, `getLatestCrewWorkoutWithPhoto()` 직접 호출 |
| `src/components/feed/active-workout-cards.tsx:42` | `getMyGroups` 제거, `getActiveCrewSessions()` 직접 호출 |
| `src/components/home/king-card.tsx:57`·`:65` | `getCrewProfiles(g.id)` → `getMyCrew()` (열람권이 크루 기준이 됐으므로 꾸준왕 후보도 크루) |

**손대지 않는 곳:** `challenge/page.tsx`, `challenge-performance-card.tsx`, `record/page.tsx` — 챌린지·세션 소속용이다.

- [ ] **Step 5: 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 통과. `getGroupFeed`를 참조하던 곳이 남아 있으면 typecheck가 잡는다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib src/app src/components
git commit -m "feat: 피드·홈 조회를 크루 연결 기준으로 전환"
```

---

## Task 11: 아침 브리핑 본문 제거

**Files:** `src/lib/domain/briefing.ts`, `src/lib/domain/briefing.test.ts`, `src/app/api/briefing/route.ts`

- [ ] **Step 1: 테스트를 먼저 고친다**

`src/lib/domain/briefing.test.ts`에서 본문을 단언하는 3건(`:114`·`:120`·`:128`)을 지우고 하나로 대체한다:

```ts
  it("본문은 언제나 null — 크루 집계 문구를 없앴다 (2026-07-28)", () => {
    const { briefings } = buildBriefings(
      [user({ userId: "me", completedAts: [new Date("2026-07-27T10:00:00Z")] })],
      new Map(),
      new Date("2026-07-28T00:00:00Z"),
      9,
    );
    expect(briefings[0].body).toBeNull();
  });
```

> 파일 상단의 `user(...)` 헬퍼 실제 이름·시그니처를 확인해 맞춘다. `crewMemberIds`를 넘기던 인자는 전부 지운다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/domain/briefing.test.ts`
Expected: FAIL — `crewMemberIds`가 아직 필수 필드라 타입/런타임 불일치

- [ ] **Step 3: 도메인에서 크루 집계 제거**

`src/lib/domain/briefing.ts`에서:
- `crewFriendsWorkedYesterday()` 함수(`:42`) **삭제**
- `briefingBody()` 함수(`:73`) **삭제**
- `BriefingUser.crewMemberIds` 필드(`:23`) **삭제**
- `buildBriefings` 안의 `hasFriends`/`friendCount` 계산(`:115~120`) **삭제**
- `briefings.push`의 `body`를 `null`로 고정:

```ts
    briefings.push({
      userId: u.userId,
      title: briefingTitle(stage, streak, todayKey),
      // 크루 집계 문구를 없앴다(2026-07-28). 타입은 남긴다 — 알림 INSERT와
      // 푸시 페이로드가 body를 그대로 넘기고 있어 시그니처를 흔들 이유가 없다.
      body: null,
      dedupeKey: `morning_briefing:${u.userId}:${todayKey}`,
    });
```

`completedAtsByUser` 인자는 **`buildBriefings` 시그니처에 그대로 둔다** — 라우트가 이미 넘기고 있고, 지우면 호출부까지 흔들린다. 쓰지 않는 인자가 되므로 lint가 잡으면 `_completedAtsByUser`로 이름만 바꾼다.

- [ ] **Step 4: 라우트에서 크루 조회 제거**

`src/app/api/briefing/route.ts`:
- `:56`의 `admin.from("group_members").select("group_id, user_id")` 조회 **삭제**(Promise.all 배열에서 제거)
- `:92`의 `crewMemberIds: ...` 조립 **삭제**
- `groupsByUser` 등 그 조회에만 쓰이던 지역 변수 **삭제**

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run src/lib/domain/briefing.test.ts`
Expected: PASS

- [ ] **Step 6: 게이트 + 커밋**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

```bash
git add src/lib/domain/briefing.ts src/lib/domain/briefing.test.ts src/app/api/briefing/route.ts
git commit -m "feat: 아침 브리핑 본문(크루 집계) 제거 — 제목만 보낸다"
```

---

## Task 12: 최종 검증 · 배포 · 릴리스 노트

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0 · typecheck 0 · **503 passed** · build 성공

계산: 483(현재) + 12(`crew-link.test.ts` — `it.each` 5건 포함) + 10(컴포넌트 5+5) − 2(브리핑 본문 단언 3건 → 1건) = **503**. 숫자가 다르면 어느 단계에서 테스트를 빠뜨렸는지 먼저 확인한다.

- [ ] **Step 2: 실 DB 스크립트 전부**

```bash
node scripts/crew-link-check.mjs
node scripts/crew-profile-check.mjs
node scripts/poke-levelup-check.mjs
node scripts/badge-point-check.mjs
node scripts/streak-parity-check.mjs
```

Expected: 전부 `N/N passed`, 불일치 0건

- [ ] **Step 3: 배포**

```bash
pnpm dlx vercel deploy --prod --yes
```

Expected: `● Ready` (target production)

- [ ] **Step 4: 배포 번들 실검증**

`https://gnd-one.vercel.app`의 `/home`·`/feed`·`/record`·`/profile`·`/crew`가 **200**인지 확인하고, 번들에서 새 문구를 grep한다: `크루 요청` · `아직 크루가 없어요` · `닉네임을 정확히 입력하세요` · `이미 크루`

- [ ] **Step 5: 릴리스 노트 + 알림 발송**

`src/lib/domain/release-notes.data.json` **맨 앞**에 항목을 추가한다(단일 원천 — 화면·알림·스크립트가 같은 파일을 읽는다):

```json
{
  "version": "크루 연결",
  "date": "2026-07-28",
  "title": "이제 닉네임으로 크루를 맺어요 🤝",
  "items": [
    "내 정보 › 크루에서 닉네임을 검색해 크루 요청을 보낼 수 있어요.",
    "서로 수락한 크루끼리만 운동 소식·응원·콕·레벨업 알림이 오가요.",
    "피드와 프로필도 크루에게만 보여요.",
    "크루 해제는 크루 목록에서 언제든 할 수 있어요."
  ]
}
```

> 실제 필드 이름은 파일의 기존 항목을 열어 그대로 따른다.

```bash
pnpm release:notify           # 미리보기
pnpm release:notify -- --send # 발송
```

- [ ] **Step 6: PROGRESS.md 갱신 + 커밋**

`PROGRESS.md` 맨 위에 이번 작업 항목을 추가한다(기존 항목 형식을 따라: 무엇을·왜·실측 수치·범위 밖).

```bash
git add PROGRESS.md src/lib/domain/release-notes.data.json
git commit -m "docs: 크루 연결 그래프 진행 기록 + 릴리스 노트"
```

- [ ] **Step 7: 사용자 실기기 확인 요청**

> 폰에서 확인해 주세요:
> 1. 내 정보 › 크루 — 3명이 서로 크루로 보이는지
> 2. 피드에 크루 운동이 그대로 뜨는지
> 3. 아침 브리핑이 제목만 오는지(다음 날 09시)
> 4. 운동 시작 시 크루에게 알림이 가는지

---

## 부록 A: 되돌리기

0039까지 적용한 뒤 문제가 생기면 **0040**으로 되돌린다. 0039를 수정하지 않는다.

되돌릴 것은 판정 함수 한 줄씩이다 — `is_crew_with(x)` → `shares_group_with(x)`로 다시 바꾼 정의를 0040에 넣고 Run한다. `crew_links`·`crew_requests` 데이터는 **지우지 않는다**(다시 전환할 때 그대로 쓴다).

## 부록 B: 이번에 하지 않는 것

- **챌린지 개편** — "내가 만들고 크루를 초대하는 방". 전원 목표 + 전원 동의 게이트(0025)·랭킹·목표 승인을 동시에 손대야 해서 별도 스펙.
- 차단(block), 크루 추천, 크루 수 상한, QR·링크로 크루 맺기, 앞글자 검색.
- `profiles` SELECT RLS의 `or shares_group_with(id)` 제거 — 챌린지 개편과 함께.
