-- Split Geriatrics tables into their own schema.
--
-- Background: project krmlzwwelqvlfslwltol is shared with the InternalMedicine
-- app. Per-app tables are moved out of `public` into app-specific schemas so
-- the two apps cannot collide on table names and can be audited / backed up
-- independently. Shared tables (answer_reports, question-images bucket,
-- auth.*) stay where they are.
--
-- After applying this migration you MUST open the Supabase dashboard
-- (Project Settings -> API -> Exposed schemas) and add `geriatrics` to the
-- list. Without that, PostgREST returns 404 for requests that target the new
-- schema via the Accept-Profile / Content-Profile headers.

create schema if not exists geriatrics;

grant usage on schema geriatrics to anon, authenticated, service_role;

alter default privileges in schema geriatrics
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema geriatrics
  grant usage, select on sequences to anon, authenticated;

alter table if exists public.shlav_leaderboard set schema geriatrics;
alter table if exists public.shlav_feedback    set schema geriatrics;
alter table if exists public.samega_backups    set schema geriatrics;
alter table if exists public.progress_state    set schema geriatrics;

-- Ensure progress_state exists in the new schema even if it was never created
-- in `public` first. DDL mirrors the retired supabase-setup.sql; RLS matches
-- user_id against the Supabase JWT `sub` claim, falling back to the
-- `x-user-id` header so pre-auth clients still work.
create table if not exists geriatrics.progress_state (
  user_id    text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_progress_state_updated_at
  on geriatrics.progress_state (updated_at);

alter table geriatrics.progress_state enable row level security;

drop policy if exists user_read_own   on geriatrics.progress_state;
drop policy if exists user_write_own  on geriatrics.progress_state;
drop policy if exists user_update_own on geriatrics.progress_state;

create policy user_read_own on geriatrics.progress_state
  for select using (
    user_id = coalesce(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers',    true)::json->>'x-user-id'
    )
  );

create policy user_write_own on geriatrics.progress_state
  for insert with check (
    user_id = coalesce(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers',    true)::json->>'x-user-id'
    )
  );

create policy user_update_own on geriatrics.progress_state
  for update using (
    user_id = coalesce(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers',    true)::json->>'x-user-id'
    )
  ) with check (
    user_id = coalesce(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers',    true)::json->>'x-user-id'
    )
  );

grant select, insert, update, delete on all tables    in schema geriatrics to anon, authenticated;
grant usage,  select                on all sequences in schema geriatrics to anon, authenticated;
