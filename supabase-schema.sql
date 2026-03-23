create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key,
  name text not null,
  phone text not null,
  preferred_language text not null default 'english',
  current_stage_index integer not null default 0,
  active_game_date date,
  stage_question_ids jsonb not null default '{}'::jsonb,
  daily_completed_at timestamptz,
  daily_total_time_seconds integer,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.players add column if not exists current_stage_index integer not null default 0;
alter table public.players add column if not exists preferred_language text not null default 'english';
alter table public.players add column if not exists active_game_date date;
alter table public.players add column if not exists stage_question_ids jsonb not null default '{}'::jsonb;
alter table public.players add column if not exists daily_completed_at timestamptz;
alter table public.players add column if not exists daily_total_time_seconds integer;

create table if not exists public.questions (
  id uuid primary key,
  game_date date not null,
  category text not null check (category in ('easy', 'medium', 'hard', 'difficult', 'expert')),
  question_type text not null default 'mcq' check (question_type in ('mcq', 'image_puzzle')),
  image_url text,
  prompt text not null,
  prompt_hi text,
  option_a text,
  option_a_hi text,
  option_b text,
  option_b_hi text,
  option_c text,
  option_c_hi text,
  option_d text,
  option_d_hi text,
  correct_option_id text not null check (correct_option_id in ('a', 'b', 'c', 'd')),
  created_at timestamptz not null default now()
);

alter table public.questions add column if not exists game_date date;
alter table public.questions add column if not exists category text;
alter table public.questions add column if not exists question_type text;
alter table public.questions add column if not exists image_url text;
alter table public.questions add column if not exists prompt_hi text;
alter table public.questions add column if not exists option_a_hi text;
alter table public.questions add column if not exists option_b_hi text;
alter table public.questions add column if not exists option_c_hi text;
alter table public.questions add column if not exists option_d_hi text;
alter table public.questions add column if not exists created_at timestamptz not null default now();
update public.questions set game_date = current_date where game_date is null;
update public.questions set category = 'easy' where category is null;
update public.questions set question_type = 'mcq' where question_type is null;
update public.players set preferred_language = 'english' where preferred_language is null;
alter table public.questions alter column game_date set not null;
alter table public.questions alter column category set not null;
alter table public.questions alter column question_type set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_preferred_language_check'
  ) then
    alter table public.players
      add constraint players_preferred_language_check
      check (preferred_language in ('english', 'hindi'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_category_check'
  ) then
    alter table public.questions
      add constraint questions_category_check
      check (category in ('easy', 'medium', 'hard', 'difficult', 'expert'));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_type_check'
  ) then
    alter table public.questions
      add constraint questions_type_check
      check (question_type in ('mcq', 'image_puzzle'));
  end if;
end $$;

alter table public.questions alter column option_a drop not null;
alter table public.questions alter column option_b drop not null;
alter table public.questions alter column option_c drop not null;
alter table public.questions alter column option_d drop not null;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  game_date date not null,
  category text not null check (category in ('easy', 'medium', 'hard', 'difficult', 'expert')),
  question_id text not null,
  question_prompt text not null,
  selected_option_id text not null,
  selected_option_label text not null,
  correct boolean not null,
  time_taken_seconds integer not null,
  submitted_at timestamptz not null default now()
);

alter table public.attempts add column if not exists game_date date;
alter table public.attempts add column if not exists category text;
update public.attempts set game_date = current_date where game_date is null;
update public.attempts set category = 'easy' where category is null;
alter table public.attempts alter column game_date set not null;
alter table public.attempts alter column category set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attempts_category_check'
  ) then
    alter table public.attempts
      add constraint attempts_category_check
      check (category in ('easy', 'medium', 'hard', 'difficult', 'expert'));
  end if;
end $$;

alter table public.players enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.players to anon, authenticated;
grant select, insert on table public.questions to anon, authenticated;
grant select, insert on table public.attempts to anon, authenticated;

do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'players'
  loop
    execute format('drop policy if exists %I on public.players', p.policyname);
  end loop;

  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'questions'
  loop
    execute format('drop policy if exists %I on public.questions', p.policyname);
  end loop;

  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'attempts'
  loop
    execute format('drop policy if exists %I on public.attempts', p.policyname);
  end loop;
end $$;

create policy "players_read" on public.players for select to public using (true);
create policy "players_insert" on public.players for insert to public with check (true);
create policy "players_update" on public.players for update to public using (true) with check (true);

create policy "questions_read" on public.questions for select to public using (true);
create policy "questions_insert" on public.questions for insert to public with check (true);

create policy "attempts_read" on public.attempts for select to public using (true);
create policy "attempts_insert" on public.attempts for insert to public with check (true);
