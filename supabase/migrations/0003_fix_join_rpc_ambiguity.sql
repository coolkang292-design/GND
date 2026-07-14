-- ============================================================
-- 0003: join_group_with_code 모호성 수정
-- 문제: returns table(group_id …)의 출력 변수명이 group_members.group_id
--       컬럼과 충돌 → on conflict (group_id, …)에서 42702 ambiguous.
-- 수정: #variable_conflict use_column 지시어로 컬럼 우선 해석.
-- 실행: Supabase Dashboard → SQL Editor에 붙여넣기 → Run
-- ============================================================

create or replace function public.join_group_with_code(p_code text)
returns table (group_id uuid, group_name text)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into g from groups
  where invite_code = upper(trim(p_code));

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return query select g.id, g.name;
end $$;
