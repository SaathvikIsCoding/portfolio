-- Visitor survey storage for the portfolio.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Security model:
--   * Visitors (the public publishable/anon key) can only INSERT a response. They cannot
--     read, change or delete anything.
--   * Reading and deleting go through two functions that require your admin passphrase,
--     which lives in a private table the public API cannot see.
--   * This file is public on GitHub, so the script refuses to run until you replace the
--     example passphrase below with your own.

-- 1. Your admin passphrase ----------------------------------------------------------
create schema if not exists private;
create table if not exists private.survey_admin (key text primary key);
-- Extra lock: the private schema isn't exposed by the API anyway, and the functions below
-- read this table as its owner (owners bypass RLS), so enabling RLS changes nothing else.
alter table private.survey_admin enable row level security;

do $$
declare
  -- >>> REPLACE the text between the quotes with your own passphrase (12+ characters). <<<
  -- You'll type this same passphrase in the admin page's Survey tab to see responses.
  passphrase text := 'CHANGE-ME';
begin
  if passphrase = 'CHANGE-ME' or char_length(passphrase) < 12 then
    raise exception 'Put your own passphrase (at least 12 characters) in place of CHANGE-ME, then run again.';
  end if;
  delete from private.survey_admin;               -- running again replaces the old passphrase
  insert into private.survey_admin (key) values (passphrase);
end $$;

-- 2. The responses table -------------------------------------------------------------
create table if not exists public.survey_responses (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name)    between 1 and 80),
  purpose    text not null check (char_length(purpose) between 1 and 60),
  source     text not null check (char_length(source)  between 1 and 60),
  page       text          check (char_length(page) <= 200)
);

alter table public.survey_responses enable row level security;

drop policy if exists "Visitors can submit a response" on public.survey_responses;
create policy "Visitors can submit a response"
  on public.survey_responses for insert to anon
  with check (true);
-- No select/update/delete policies: the public key can't read or change responses.

-- 3. Functions the admin page calls with the passphrase ------------------------------
-- A wrong passphrase raises SQLSTATE 28000, which the API returns as HTTP 403.
create or replace function public.get_survey_responses(admin_key text)
returns setof public.survey_responses
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from private.survey_admin a where a.key = admin_key) then
    raise exception 'Wrong survey passphrase' using errcode = '28000';
  end if;
  return query select r.* from public.survey_responses r order by r.created_at desc;
end;
$$;

create or replace function public.delete_survey_response(admin_key text, response_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from private.survey_admin a where a.key = admin_key) then
    raise exception 'Wrong survey passphrase' using errcode = '28000';
  end if;
  delete from public.survey_responses where id = response_id;
end;
$$;

revoke all on function public.get_survey_responses(text) from public;
revoke all on function public.delete_survey_response(text, bigint) from public;
grant execute on function public.get_survey_responses(text) to anon;
grant execute on function public.delete_survey_response(text, bigint) to anon;

-- To change your passphrase later, edit it in step 1 and run this whole script again.
