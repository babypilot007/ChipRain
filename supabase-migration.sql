-- Run this once in Supabase SQL Editor for your EXISTING project.
-- Adds the admin-defined maximum stack/buy-in field to existing player rows.
alter table public.poker_players
add column if not exists max_stack integer not null default 1000
check (max_stack >= 0);

-- Realtime must include both tables for live stack/pot changes.
do $$ begin
  alter publication supabase_realtime add table public.poker_rooms;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.poker_players;
exception when duplicate_object then null; when others then null; end $$;
