-- A stamped date is immutable and owner-only. No XP or challenge reward changes.
-- The release timestamp prevents late RPC calls backfilling historical sessions.
CREATE TABLE public.workout_stamp_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  launched_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.workout_stamp_release(singleton) VALUES (true);
ALTER TABLE public.workout_stamp_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_stamp_release FROM PUBLIC, anon, authenticated;

CREATE TABLE public.workout_stamp_colors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date date NOT NULL,
  variant text NOT NULL CHECK (variant IN ('basic','orange','gold')),
  awarded_session_id uuid NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, workout_date)
);
ALTER TABLE public.workout_stamp_colors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_stamp_colors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_stamp_colors TO authenticated;
CREATE POLICY workout_stamp_colors_select_own ON public.workout_stamp_colors
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.claim_workout_stamp(p_session_id uuid)
RETURNS TABLE(stamp_date date, stamp_variant text, newly_awarded boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_completed timestamptz;
  v_tz text;
  v_day date;
  v_variant text;
  v_rows integer;
  v_entropy bytea;
  v_roll integer;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT s.completed_at, p.timezone INTO v_completed, v_tz
    FROM public.workout_sessions s JOIN public.profiles p ON p.id = s.user_id
   WHERE s.id = p_session_id AND s.user_id = v_uid
     AND s.status = 'completed' AND s.deleted_at IS NULL AND s.completed_at IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_completed < (SELECT r.launched_at FROM public.workout_stamp_release r WHERE r.singleton) THEN RETURN; END IF;
  v_day := (v_completed AT TIME ZONE v_tz)::date;

  SELECT c.variant INTO v_variant FROM public.workout_stamp_colors c
   WHERE c.user_id = v_uid AND c.workout_date = v_day;
  IF FOUND THEN
    RETURN QUERY SELECT v_day, v_variant, false;
    RETURN;
  END IF;

  -- All first-ever workout DAYS get orange, irrespective of sessions on that day.
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_sessions s
     WHERE s.user_id = v_uid AND s.status = 'completed' AND s.deleted_at IS NULL
       AND s.completed_at IS NOT NULL
       AND (s.completed_at AT TIME ZONE v_tz)::date < v_day
  ) THEN
    v_variant := 'orange';
  ELSE
    v_entropy := gen_random_bytes(4);
    v_roll := ((get_byte(v_entropy,0)::bigint*16777216
      +get_byte(v_entropy,1)::bigint*65536
      +get_byte(v_entropy,2)::bigint*256
      +get_byte(v_entropy,3)::bigint)%100)::integer;
    v_variant := CASE WHEN v_roll < 70 THEN 'basic'
                      WHEN v_roll < 95 THEN 'orange'
                      ELSE 'gold' END;
  END IF;

  INSERT INTO public.workout_stamp_colors(user_id,workout_date,variant,awarded_session_id)
  VALUES (v_uid,v_day,v_variant,p_session_id)
  ON CONFLICT (user_id,workout_date) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  SELECT c.variant INTO v_variant FROM public.workout_stamp_colors c
   WHERE c.user_id = v_uid AND c.workout_date = v_day;
  RETURN QUERY SELECT v_day, v_variant, (v_rows = 1);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_workout_stamp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_workout_stamp(uuid) TO authenticated;
