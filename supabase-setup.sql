-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/drvocrtufqtifkgmijpg/sql/new

CREATE TABLE IF NOT EXISTS public.progress_state (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.progress_state ENABLE ROW LEVEL SECURITY;

-- Drop the old overly-permissive policy if it exists
DROP POLICY IF EXISTS "anon_all" ON public.progress_state;

-- Users can only read their own data (matched by user_id sent from client)
CREATE POLICY "user_read_own" ON public.progress_state
  FOR SELECT USING (
    user_id = coalesce(current_setting('request.jwt.claims', true)::json->>'sub',
              current_setting('request.headers', true)::json->>'x-user-id')
  );

-- Users can only insert/update their own data
CREATE POLICY "user_write_own" ON public.progress_state
  FOR INSERT WITH CHECK (
    user_id = coalesce(current_setting('request.jwt.claims', true)::json->>'sub',
              current_setting('request.headers', true)::json->>'x-user-id')
  );

CREATE POLICY "user_update_own" ON public.progress_state
  FOR UPDATE USING (
    user_id = coalesce(current_setting('request.jwt.claims', true)::json->>'sub',
              current_setting('request.headers', true)::json->>'x-user-id')
  ) WITH CHECK (
    user_id = coalesce(current_setting('request.jwt.claims', true)::json->>'sub',
              current_setting('request.headers', true)::json->>'x-user-id')
  );

-- Create an index on updated_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_progress_state_updated_at
  ON public.progress_state (updated_at);
