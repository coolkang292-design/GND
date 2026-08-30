-- 0084: 대댓글 + 좋아요 누른 사람
-- 설계: docs/superpowers/plans/2026-08-30-feed-instagram-restructure.md (§13)
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0083은 수정하지 않는다.
--
-- ⚠ **배포보다 먼저 Run 해도 안전하다.** 새 컬럼(널 허용) · 새 인덱스 ·
--   RPC 교체뿐이다. 운영에 떠 있는 앱은 `p_parent_id`를 안 보내는데,
--   기본값이 null이라 지금까지와 똑같이 동작한다.
--
-- 무엇을 하나
--   ① cheers.parent_id — 대댓글 (2단계 고정)
--   ② post_session_comment에 p_parent_id 추가 (기본 null)
--   ③ get_session_actor_profiles — 댓글**과 좋아요**를 남긴 사람의 이름
--      (0083의 get_session_comment_authors를 대체하고 지운다)
--   ④ cheers.edited_at + edit_session_comment — 나중에 댓글 고치기

begin;

-- ════════════════════════════════════════════════════════════
-- ① 대댓글 — cheers.parent_id
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ **2단계로 고정한다.** 답글의 답글은 같은 묶음에 평평하게 눕는다(아래 ②의
--    v_parent 정규화). 무한 중첩을 허용하면 화면이 좁은 폰에서 오른쪽으로 계속
--    밀리고, 스레드를 접는 규칙도 깊이마다 달라진다. 인스타도 2단계다.
--
-- `on delete cascade` — 부모 댓글을 지우면 답글도 같이 간다. 부모 없는 답글이
-- 남으면 화면에 뜰 자리가 없어 **보이지 않는 데이터**가 된다.

alter table public.cheers
  add column if not exists parent_id uuid
    references public.cheers(id) on delete cascade;

-- ④에서 쓴다. 고친 적이 있으면 화면에 "(수정됨)"을 단다 —
-- 답글이 달린 뒤에 몸통이 바뀌면 읽는 사람이 앞뒤가 안 맞는다고 느낀다.
alter table public.cheers
  add column if not exists edited_at timestamptz;

-- 스레드를 한 세션치 읽어 부모별로 접는다. 세션 조건이 이미 인덱스에 있으므로
-- (0082의 cheers_session_created_idx) 부모 조회용으로만 하나 더 둔다.
create index if not exists cheers_parent_idx
  on public.cheers (parent_id) where parent_id is not null;

-- ════════════════════════════════════════════════════════════
-- ② post_session_comment — p_parent_id 추가
-- ════════════════════════════════════════════════════════════
--
-- ⚠️⚠️ **`create or replace`가 아니라 drop 후 create다.** 인자를 더하면 시그니처가
--    달라져 `create or replace`가 **덮어쓰지 않고 오버로드를 하나 더 만든다.**
--    그러면 PostgREST가 어느 쪽을 부를지 몰라 `PGRST203`(ambiguous)으로 실패한다.
--    0082의 2인자 판을 명시적으로 지운다.

drop function if exists public.post_session_comment(uuid, text);

create or replace function public.post_session_comment(
  p_session_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        workout_sessions;
  c        cheers;
  v_owner  uuid;
  v_parent uuid := null;
  v_last   timestamptz;
  v_nick   text;
  v_body   text;
  r        record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'comment_empty';
  end if;
  if char_length(v_body) > 200 then
    raise exception 'comment_too_long';
  end if;

  select * into s from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  -- 완료 · visibility='group' · deleted_at is null · (본인 또는 크루).
  -- **피드가 보여주는 조건과 정확히 같다** — 보이는 것에만 댓글이 달린다.
  if not public.workout_session_crew_visible(p_session_id) then
    raise exception 'session_not_found';
  end if;

  v_owner := s.user_id;

  -- ── 부모 댓글 정규화 (0084) ────────────────────────────────
  if p_parent_id is not null then
    -- ⚠️ **같은 세션인지 반드시 본다.** 안 보면 남의 글 댓글을 부모로 지정해
    --    이 세션 스레드에 끼워 넣을 수 있다(스레드 오염).
    -- ⚠️ 말이 있는 행만 부모가 될 수 있다 — 말 없는 이모지 응원은 화면에서
    --    `🔥3` 익명 집계라 답글이 붙을 자리가 없다.
    select coalesce(parent_id, id) into v_parent   -- ← 2단계 평탄화
    from cheers
    where id = p_parent_id
      and session_id = p_session_id
      and message is not null;

    if v_parent is null then
      raise exception 'parent_not_found';
    end if;
  end if;

  -- 도배 방어. 응원의 3회 제한과 달리 총량은 안 막는다(대화니까).
  select max(created_at) into v_last
  from cheers
  where session_id = p_session_id
    and sender_id = auth.uid()
    and cheer_type = 'comment';
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'comment_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message, parent_id)
  values (p_session_id, auth.uid(), v_owner, 'comment', v_body, v_parent)
  returning * into c;

  select nickname into v_nick from profiles where id = auth.uid();

  -- 팬아웃: 세션 주인 + 앞선 댓글 작성자 전원. union이 중복을 접는다.
  --
  -- ⚠️ 주인에게만 보내면 안 된다. `cheers.receiver_id`가 세션 주인이라,
  --    B가 A 글에 댓글 → A 알림 → **A가 답글 → receiver가 또 A라서 B는 영영
  --    모른다.** 왕복이 안 닫힌다.
  for r in
    select v_owner as uid
    union
    select ch.sender_id
    from cheers ch
    where ch.session_id = p_session_id
      and ch.cheer_type = 'comment'
  loop
    continue when r.uid = auth.uid();          -- 내가 쓴 글을 나에게 알리지 않는다
    continue when r.uid is null;

    -- 행이 없으면 true (0011 관례)
    if coalesce(
         (select ns.comments from notification_settings ns where ns.user_id = r.uid),
         true
       ) then
      perform notify(
        r.uid,
        auth.uid(),
        'comment_received',
        p_session_id,                          -- ⚠ 세션 id다. 딥링크가 이걸 쓴다
        coalesce(v_nick, '크루원') ||
          case when v_parent is not null then '님이 답글을 남겼어요 💬'
               when r.uid = v_owner       then '님이 내 운동에 댓글을 남겼어요 💬'
               else                            '님도 이 운동에 댓글을 남겼어요 💬'
          end,
        left(v_body, 120)
      );
    end if;
  end loop;

  return jsonb_build_object('id', c.id, 'created_at', c.created_at,
                            'parent_id', c.parent_id);
end $$;

grant execute on function public.post_session_comment(uuid, text, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- ③ 댓글·좋아요를 남긴 사람의 이름
-- ════════════════════════════════════════════════════════════
--
-- 0083이 댓글 작성자만 다뤘는데, 사용자가 **"좋아요 누른 사람이 누군지 확인할 수
-- 있는 기능"**을 요청했다. 같은 문제(읽기 범위 ≠ 이름 범위)가 좋아요에도 그대로
-- 있으므로 **함수를 하나로 합친다** — 규칙을 두 곳에 두면 언젠가 갈라진다.
--
-- ⚠ 0083의 `get_session_comment_authors`는 **지운다.** 남겨 두면 같은 일을 하는
--   함수가 둘이 되고, 다음 사람이 어느 쪽을 고쳐야 할지 모른다. 오늘 만든 것이라
--   운영 앱이 아직 부르지 않는다(앱 배포는 이 마이그레이션 뒤다).
--
-- ⚠⚠ 반환은 여전히 **세 칸뿐**이다. `profiles`에는 `invite_code` ·
--    `acquisition_source/medium/campaign/referrer/landing`도 있어서, 테이블 정책을
--    넓히면 초대 코드와 마케팅 유입 데이터까지 딸려 나간다. 승인된 것은 "이름"이다.

drop function if exists public.get_session_comment_authors(uuid[]);

create or replace function public.get_session_actor_profiles(
  p_session_ids uuid[]
)
returns table (id uuid, nickname text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  -- 댓글·응원 중 **말이 있는 것**을 남긴 사람.
  -- 말 없는 이모지 응원은 화면에서 `🔥3` 익명 집계라 이름이 필요 없다 —
  -- 필요 없는 노출은 하지 않는다.
  select distinct p.id, p.nickname, p.avatar_url
  from cheers c
  join profiles p on p.id = c.sender_id
  where c.session_id = any(p_session_ids)
    and c.message is not null
    -- ⚠⚠ **이 줄이 문지기다.** SECURITY DEFINER라 RLS를 지나친다.
    --    `cheers_select_related`가 쓰는 것과 **같은 함수**를 쓴다 →
    --    규칙은 하나다: 댓글을 읽을 수 있으면 이름도 읽을 수 있다.
    --    `auth.uid()`는 정의자가 아니라 **호출자**의 JWT를 본다.
    and public.session_crew_shared(c.session_id)

  union

  -- 좋아요를 누른 사람 (0084).
  select distinct p.id, p.nickname, p.avatar_url
  from reactions rx
  join profiles p on p.id = rx.user_id
  where rx.session_id = any(p_session_ids)
    -- 좋아요 읽기 정책(`reactions_select_visible`)이 쓰는 것과 **같은 함수**다.
    -- cheers 쪽과 함수가 다른 이유: 정책이 원래 다른 것을 쓴다
    -- (reactions는 `workout_session_crew_visible`, cheers는 `session_crew_shared`).
    -- 각자 자기 정책과 맞춰야 "보이는데 이름은 안 나오는" 어긋남이 안 생긴다.
    and public.workout_session_crew_visible(rx.session_id)
$$;

grant execute on function public.get_session_actor_profiles(uuid[]) to authenticated;

-- ════════════════════════════════════════════════════════════
-- ④ edit_session_comment — 나중에 댓글 고치기
-- ════════════════════════════════════════════════════════════
--
-- 사용자 요청 2026-08-30: "피드를 올린 다음에 나중에 작성한 글을 편집할 수 있게",
-- "인증샷 말고 코멘트 정도만". 인증사진은 손대지 않는다 — 그건 기록의 증거라
-- 나중에 갈아 끼우면 증거가 아니게 된다.
--
-- ⚠️ **UPDATE 정책을 열지 않고 RPC로 한다.** `cheers`에는 지금 UPDATE 정책이
--    아예 없다(select/delete만). 정책을 열면 RLS는 **컬럼을 못 가려서**
--    `cheer_type`·`session_id`·`parent_id`·`receiver_id`까지 바꿀 수 있게 된다 —
--    남의 글 스레드로 자기 댓글을 옮기거나, 응원을 댓글로 둔갑시킬 수 있다.
--    정의자 함수는 **`message`와 `edited_at`만** 건드린다.
--
-- ⚠️ 캡션(`workout_sessions.title`)은 이미 고칠 수 있다 —
--    `sessions_update_own`이 주인의 UPDATE를 열어 두고 있고 화면에도 붙어 있다.
--    여기서 다루는 것은 **댓글**이다.

create or replace function public.edit_session_comment(
  p_comment_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c      cheers;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'comment_empty';
  end if;
  if char_length(v_body) > 200 then
    raise exception 'comment_too_long';
  end if;

  select * into c from cheers where id = p_comment_id;
  if not found then
    raise exception 'comment_not_found';
  end if;

  -- 본인 것만. `cheers_delete_own`과 같은 기준이다.
  if c.sender_id <> auth.uid() then
    raise exception 'not_author';
  end if;

  -- ⚠️ 말이 없는 이모지 응원은 고칠 몸통이 없다. 여기서 막지 않으면
  --    "🔥 응원"이 갑자기 문장으로 바뀌어 머리줄 집계에서 사라진다.
  if c.message is null then
    raise exception 'comment_not_found';
  end if;

  -- ⚠️ 그 세션이 아직 보이는지 다시 본다. 크루가 끊긴 뒤에도 옛 댓글을 계속
  --    고칠 수 있으면, 상대 화면에 내 새 문장이 꽂힌다.
  if not public.workout_session_crew_visible(c.session_id) then
    raise exception 'session_not_found';
  end if;

  update cheers
     set message = v_body,
         edited_at = now()
   where id = p_comment_id
  returning * into c;

  -- 알림은 보내지 않는다. 고칠 때마다 알림이 가면 도배 경로가 된다.
  return jsonb_build_object('id', c.id, 'edited_at', c.edited_at);
end $$;

grant execute on function public.edit_session_comment(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) parent_id 컬럼 — 1
--   select count(*) from information_schema.columns
--   where table_name='cheers' and column_name='parent_id';
--
-- (2) post_session_comment가 **3인자 하나뿐**인가 — 1이어야 한다.
--     2가 나오면 오버로드가 남은 것이고 PostgREST가 PGRST203으로 실패한다.
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='post_session_comment';
--
-- (3) 옛 함수가 지워졌나 — 0
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='get_session_comment_authors';
--
-- (4) 새 함수 — 1
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='get_session_actor_profiles';
--
-- (5) 수정 기능 — 각각 1
--   select count(*) from information_schema.columns
--   where table_name='cheers' and column_name='edited_at';
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='edit_session_comment';
