-- Shlav A (Geriatrics) leaderboard — server-side upsert RPC.
--
-- Live-state finding 2026-05-08: shlav_leaderboard is in `public`, NOT
-- in `geriatrics` schema. The schema-split migration
-- 20260421120000_split_app_schema.sql was apparently not applied to
-- the leaderboard table. Live shape: ts is `timestamptz` (default
-- now()), accuracy is `integer`, no updated_at column. Has 4 historical
-- rows (the existing direct-POST path works because PostgREST auto-casts
-- the client's ISO string into timestamptz).
--
-- This RPC adds the SECURITY DEFINER write path so the leaderboard
-- survives the sb_publishable_* key migration that already broke
-- direct-table writes for backups (Track-Q, v10.64.42 fixed via
-- backup_set RPC).
--
-- Idempotent (CREATE OR REPLACE FUNCTION). Reversible:
--   DROP FUNCTION IF EXISTS public.shlav_leaderboard_upsert(text,int,int,int,int,text);

CREATE OR REPLACE FUNCTION public.shlav_leaderboard_upsert(
  p_uid       text,
  p_answered  int,
  p_correct   int,
  p_streak    int,
  p_readiness int,
  p_ts        text DEFAULT NULL
)
RETURNS public.shlav_leaderboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result  public.shlav_leaderboard;
  v_ts    timestamptz;
BEGIN
  IF p_uid IS NULL OR length(trim(p_uid)) = 0 THEN
    RAISE EXCEPTION 'p_uid required';
  END IF;
  IF p_answered IS NULL OR p_answered < 0 THEN
    RAISE EXCEPTION 'p_answered must be >= 0';
  END IF;
  IF p_correct IS NULL OR p_correct < 0 OR p_correct > p_answered THEN
    RAISE EXCEPTION 'p_correct must be in [0, p_answered]';
  END IF;

  IF p_ts IS NULL OR length(trim(p_ts)) = 0 THEN
    v_ts := now();
  ELSE
    BEGIN
      v_ts := p_ts::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := now();
    END;
  END IF;

  -- public.shlav_leaderboard.accuracy is GENERATED ALWAYS AS — must NOT be assigned.
  -- Postgres throws PG 428C9 if we try. Generation expression matches what we
  -- would have computed: ROUND((correct::numeric / answered::numeric) * 100)::integer.
  INSERT INTO public.shlav_leaderboard
    (uid, answered, correct, streak, readiness, ts)
  VALUES (
    p_uid,
    p_answered,
    p_correct,
    COALESCE(p_streak, 0),
    GREATEST(0, LEAST(100, COALESCE(p_readiness, 0))),
    v_ts
  )
  ON CONFLICT (uid) DO UPDATE SET
    answered  = EXCLUDED.answered,
    correct   = EXCLUDED.correct,
    streak    = EXCLUDED.streak,
    readiness = EXCLUDED.readiness,
    ts        = EXCLUDED.ts
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE
  ON FUNCTION public.shlav_leaderboard_upsert(text, int, int, int, int, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.shlav_leaderboard_upsert IS
  'Idempotent leaderboard upsert. Accepts ts as text (ISO 8601), stores as timestamptz. '
  'Computes accuracy server-side as integer. SECURITY DEFINER bypasses RLS. '
  'Sibling: mishpacha_leaderboard_upsert (FM), pnimit_leaderboard_upsert (IM).';
