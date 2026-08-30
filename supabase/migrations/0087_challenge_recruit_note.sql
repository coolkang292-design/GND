-- 0087: 챌린지 모집글
-- 설계: docs/superpowers/plans/2026-08-31-follow-profile-discoverable.md
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0086은 수정하지 않는다.
--
-- 배포보다 먼저 Run 해도 안전하다. 새 컬럼(널 허용) + 컬럼 GRANT + 목록 RPC의
-- 반환 칸 하나 추가뿐이다. 운영 앱은 아직 이 칸을 읽지 않는다.
--
-- ── 무엇을 하나 ────────────────────────────────────────────
--
-- 사용자 지시: "공개 모집을 할 때는 모집글을 작성하게".
--
-- 지금 모집 카드에는 챌린지 **이름**밖에 없다. 이름만 보고는 "누가 어떤 사람을
-- 찾는지"를 알 수 없어서, 모르는 사람이 참여를 결정할 근거가 없다.
--
--   1) challenges.recruit_note / recruit_image_url  - 모집글과 모집 사진
--   2) 컬럼 UPDATE GRANT        - **이게 없으면 42501로 죽는다** (0086에서 겪었다)
--   3) list_discoverable_challenges 반환에 recruit_note 추가
--
-- ⚠️⚠️ **RLS 정책만으로는 못 쓴다.** `challenges_update_creator` 정책이 있어도
--    GRANT가 없으면 RLS에 닿기도 전에 `42501 permission denied`다.
--    0086에서 `discoverable`로 정확히 이 함정을 밟았다.
--      RLS 정책 = 어떤 **행**을 건드릴 수 있나
--      GRANT    = 그 **작업 자체**를 할 수 있나
--
-- ⚠️ 테이블 전체가 아니라 **컬럼 하나**에만 연다. `status`가 열리면 방장이
--    start_challenge의 목표·동의 게이트를 건너뛰고 시작할 수 있다.
--
-- 되돌리기
--   drop function if exists public.list_discoverable_challenges();
--   -- 0085의 함수 정의를 다시 Run (recruit_note 없는 판)
--   revoke update (recruit_note) on public.challenges from authenticated;
--   alter table public.challenges drop column recruit_note;

begin;

-- ============================================================
-- 1) 모집글 컬럼
-- ============================================================
--
-- 150자 — 카드 한 장에 두세 줄로 들어가는 길이다. 길면 카드가 길어지고,
-- 카드가 길어지면 가로 스크롤 한 줄이라는 전제가 깨진다.

alter table public.challenges
  add column if not exists recruit_note text,
  -- 모집 사진 (0087). `avatars` 버킷(public)의 공개 URL을 그대로 담는다 —
  -- `profiles.avatar_url`과 같은 방식이다. **새 버킷도 새 정책도 없다**:
  -- `avatars_upload_own`이 `{auth.uid()}/…` 경로를 이미 허용한다(0005).
  -- 모집글은 크루 밖 사람에게 보이라고 만든 것이라 public이 맞다
  -- (인증사진 `workout-images`가 private + 서명 URL인 것과 목적이 다르다).
  add column if not exists recruit_image_url text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'challenges_recruit_note_len_check') then
    alter table public.challenges
      add constraint challenges_recruit_note_len_check
      check (recruit_note is null or char_length(recruit_note) <= 150);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'challenges_recruit_image_url_check') then
    alter table public.challenges
      add constraint challenges_recruit_image_url_check
      check (recruit_image_url is null
             or (recruit_image_url like 'https://%'
                 and char_length(recruit_image_url) <= 500));
  end if;
end $$;

-- ============================================================
-- 2) 컬럼 UPDATE 권한 (0086과 같은 이유·같은 범위)
-- ============================================================

grant update (recruit_note, recruit_image_url) on public.challenges to authenticated;

-- ============================================================
-- 3) 목록 RPC에 모집글 추가
-- ============================================================
--
-- ⚠️ `create or replace`로는 안 된다. RETURNS TABLE의 칸이 늘면 **반환 타입이
--    달라져서** Postgres가 `cannot change return type of existing function`으로
--    거부한다. 먼저 지운다.
--
-- ⚠️ 지우면 EXECUTE 권한도 같이 사라진다 — 아래에서 다시 잠그고 다시 준다.
--    (0085에서 anon EXECUTE를 걷어낸 것을 되살리면 안 된다.)

drop function if exists public.list_discoverable_challenges();

create or replace function public.list_discoverable_challenges()
returns table (
  id                uuid,
  name              text,
  recruit_note      text,
  recruit_image_url text,
  start_date        date,
  end_date          date,
  photo_required    boolean,
  participant_count integer,
  host_id           uuid,
  host_nickname     text,
  host_avatar_url   text,
  already_joined    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.name,
         c.recruit_note,
         c.recruit_image_url,
         c.start_date,
         c.end_date,
         c.photo_required,
         (select count(*)::int
            from challenge_participants cp
           where cp.challenge_id = c.id
             and cp.status = 'joined')                    as participant_count,
         c.created_by                                     as host_id,
         p.nickname                                       as host_nickname,
         p.avatar_url                                     as host_avatar_url,
         exists (select 1 from challenge_participants me
                  where me.challenge_id = c.id
                    and me.user_id = (select auth.uid())
                    and me.status = 'joined')             as already_joined
  from challenges c
  join profiles p on p.id = c.created_by
  where c.discoverable
    and c.status = 'setup'
    and (select auth.uid()) is not null
  order by c.start_date asc, c.created_at desc
  limit 12
$$;

-- ⚠️ Postgres가 함수에 PUBLIC EXECUTE를 기본으로 준다. drop/create로 다시
--    생겼으므로 **다시 걷어내야 한다** — 0085에서 잠근 것이 풀린 상태다.
revoke execute on function public.list_discoverable_challenges() from public, anon;
grant  execute on function public.list_discoverable_challenges() to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 컬럼 — 1
--   select count(*) from information_schema.columns
--   where table_name='challenges' and column_name='recruit_note';
--
-- (2) 컬럼 UPDATE 권한 — 둘 다 true
--   select has_column_privilege('authenticated','public.challenges','recruit_note','UPDATE'),
--          has_column_privilege('authenticated','public.challenges','recruit_image_url','UPDATE');
--
-- (3) ⚠️ 테이블 전체·status는 여전히 잠겨 있어야 한다 — 둘 다 false
--   select has_table_privilege('authenticated','public.challenges','UPDATE'),
--          has_column_privilege('authenticated','public.challenges','status','UPDATE');
--
-- (4) RPC가 모집글을 내는가 — true
--   select pg_get_functiondef(oid) like '%recruit_note%'
--   from pg_proc where proname='list_discoverable_challenges';
--
-- (5) ⚠️ anon EXECUTE가 되살아나지 않았나 — 0이어야 한다
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='list_discoverable_challenges'
--     and array_to_string(p.proacl,',') like '%anon=X%';
