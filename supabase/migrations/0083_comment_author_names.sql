-- 0083: 댓글 작성자 이름 — 닉네임·아바타만 여는 RPC
-- 설계: docs/superpowers/plans/2026-08-30-feed-instagram-restructure.md (§12)
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0082는 수정하지 않는다.
--
-- ⚠ **배포보다 먼저 Run 해도 안전하다.** 새 RPC 하나뿐이고, 운영에 떠 있는 앱은
--   부르지 않는다. 정책·테이블·컬럼을 건드리지 않는다.
--
-- ── 무엇을 고치나 ──────────────────────────────────────────
--
-- 0082로 댓글이 생기면서 **읽기 범위와 이름 범위가 어긋났다.**
--
--   댓글 읽기  cheers_select_related      → session_crew_shared   = **글 주인의 크루**
--   이름 읽기  profiles_select_own_or_crew → is_crew_with OR shares_group_with
--                                          = **내 크루 / 같은 그룹**
--
-- 그래서 "글 주인의 크루이지만 나와는 크루도 그룹도 아닌" 사람에게는 댓글 **내용은
-- 보이는데 작성자 이름이 안 보인다.** 화면은 `who?.nickname ?? "크루원"`으로 떨어져
-- **누가 한 말인지 모르는 댓글**이 남는다. 적용 시점 운영 데이터로 세어 보니
-- 읽을 수 있는 제3자 11쌍 중 **3쌍**이 여기 걸렸다.
--
-- ── 왜 profiles 정책을 넓히지 않았나 (사용자 결정 2026-08-30) ──
--
-- 사용자는 "이름을 보이게 한다"를 골랐다. 그 방법으로 `profiles_select_own_or_crew`에
-- 한 줄 더하는 길이 있었지만 **쓰지 않았다.**
--
-- ⚠⚠ `profiles`에는 닉네임·아바타만 있는 게 아니다:
--     `invite_code` · `invited_by` · `acquisition_source` · `acquisition_medium` ·
--     `acquisition_campaign` · `acquisition_referrer` · `acquisition_landing` ·
--     `acquisition_captured_at` (0079·0080).
--     테이블 정책을 넓히면 **초대 코드와 마케팅 유입 데이터까지** 크루의 크루에게
--     통째로 열린다. 사용자가 승인한 것은 "이름"이지 그것이 아니다.
--
-- 그래서 정의자 RPC로 **딱 세 칸(id·nickname·avatar_url)만** 돌려준다.
-- 컬럼이 나중에 늘어도 이 함수는 자동으로 넓어지지 않는다.
--
-- 되돌리기: drop function public.get_session_comment_authors(uuid[]);
--           (화면은 다시 "크루원"으로 떨어질 뿐 깨지지 않는다)

begin;

create or replace function public.get_session_comment_authors(
  p_session_ids uuid[]
)
returns table (id uuid, nickname text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.nickname, p.avatar_url
  from cheers c
  join profiles p on p.id = c.sender_id
  where c.session_id = any(p_session_ids)
    -- 말이 있는 것만. 말 없는 이모지 응원은 화면에서 `🔥3 💪1`로 **익명 집계**라
    -- 이름이 필요 없다 — 필요 없는 노출은 하지 않는다.
    and c.message is not null
    -- ⚠⚠ **이 줄이 문지기다.** SECURITY DEFINER라 RLS를 지나치므로, 여기가 없으면
    --    누구나 아무 세션의 작성자 명단을 긁을 수 있다.
    --
    --    `session_crew_shared`를 **직접 쓰는 이유**: `cheers_select_related`가
    --    쓰는 것과 **같은 함수**다. 조건을 여기 베껴 적으면 언젠가 한쪽만 고쳐져
    --    "댓글은 보이는데 이름은 안 보이는" 지금 이 버그가 반대 방향으로 다시 난다.
    --    규칙은 하나다 — **댓글을 읽을 수 있으면 이름도 읽을 수 있다.**
    --
    --    `auth.uid()`는 정의자가 아니라 **호출자**의 JWT를 본다. 그래서 이 함수가
    --    SECURITY DEFINER여도 판정은 부르는 사람 기준으로 난다.
    and public.session_crew_shared(c.session_id)
$$;

grant execute on function public.get_session_comment_authors(uuid[]) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 함수가 생겼나 — 1
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='get_session_comment_authors';
--
-- (2) 문지기가 실제로 막는가 — **보이지 않는 세션 id를 넣어 0행이 나와야 한다.**
--     (앱에서 로그인한 채로 호출해야 auth.uid()가 잡힌다. SQL Editor는
--      service_role이라 session_crew_shared가 다르게 판정한다 — 여기서 행이
--      나온다고 새는 게 아니다.)
