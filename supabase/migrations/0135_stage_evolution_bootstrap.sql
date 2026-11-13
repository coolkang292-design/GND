-- 운영 적용 2026-11-13(MCP, 사용자 승인). settings.enabled=false: 규칙은 꺼져 있고 기존 XP 진화가 유지된다. 롤백: docs/superpowers/evolution-gate-rollback-0133-0136.sql
-- 기존 단계/레벨/XP를 바꾸거나 알림을 만들지 않는다. 적용 결과: 사용자 7명, user_stage_history 16행(grandfathered 7·legacy_xp 9), 오류 0.
create function gnd_evolution.bootstrap_user(p_user_id uuid)
returns boolean language plpgsql set search_path='' as $$
declare stage int; entry timestamptz; current_stage int; all_ready boolean:=true;
begin
  select p.current_stage into current_stage from public.user_progress p where user_id=p_user_id for update;
  if not found then return false; end if;
  for stage in 1..current_stage loop
    if stage=1 then select created_at into entry from public.profiles where id=p_user_id;
    else select entered_at into entry from public.user_level_history where user_id=p_user_id and level=1+(stage-1)*5; end if;
    if entry is null then all_ready:=false; continue; end if;
    perform gnd_evolution.freeze_stage(p_user_id,stage,entry,case when stage=current_stage then 'grandfathered' else 'legacy_xp' end);
  end loop;
  return all_ready;
end $$;
revoke all on all functions in schema gnd_evolution from public,anon,authenticated;
do $$ declare u record; begin
  for u in select user_id from public.user_progress order by user_id loop
    perform gnd_evolution.bootstrap_user(u.user_id);
  end loop;
end $$;
-- 이 마이그레이션은 enabled를 켜지 않는다. 준비 누락/대체 경로 정책은 활성화 전 검토 대상.
