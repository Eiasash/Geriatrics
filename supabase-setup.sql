-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/drvocrtufqtifkgmijpg/sql/new

CREATE TABLE IF NOT EXISTS public.progress_state (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.progress_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON public.progress_state
  FOR ALL USING (true) WITH CHECK (true);
