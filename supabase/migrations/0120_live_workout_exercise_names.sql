-- 0120: Publish a small, current workout exercise-name snapshot to existing crew event rows.
-- Workout sets/exercises are saved only on completion; active workouts live in a
-- device-local draft. Store ONLY names on the existing workout_started event.
-- That event is already SELECT-visible to the owner and their connected crew
-- through events_select_own_or_crew -> session_crew_shared(session_id).
-- Never widen workout_exercises/workout_sessions RLS to expose drafts or set data.

begin;

alter table public.workout_events
  add column if not exists exercise_names text[] not null default '{}'::text[];

-- No direct UPDATE RLS exists for workout_events. Only this author-verified RPC
-- can update a live event. Do not expose UPDATE privileges to app clients.
create or replace function public.set_live_workout_exercise_names(
  p_session_id uuid,
  p_exercise_names text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_exercise_names is null
     or cardinality(p_exercise_names) > 30
     or exists (
       select 1 from unnest(p_exercise_names) as n(name)
       where n.name is null
          or char_length(btrim(n.name)) = 0
          or char_length(n.name) > 40
     )
  then
    raise exception 'invalid_exercise_names';
  end if;

  -- Crucial: an authenticated user may ONLY update their own active session.
  if not exists (
    select 1 from public.workout_sessions s
    where s.id = p_session_id
      and s.user_id = v_uid
      and s.status = 'active'
      and s.deleted_at is null
  ) then
    raise exception 'session_not_active_or_not_owner';
  end if;

  update public.workout_events e
  set exercise_names = p_exercise_names
  where e.session_id = p_session_id
    and e.user_id = v_uid
    and e.event_type = 'workout_started';

  if not found then
    raise exception 'start_event_not_found';
  end if;
end;
$$;

revoke all on function public.set_live_workout_exercise_names(uuid, text[]) from public, anon;
grant execute on function public.set_live_workout_exercise_names(uuid, text[]) to authenticated;

commit;
