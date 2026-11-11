create extension if not exists pgcrypto;
create table if not exists public.poker_rooms (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 host_token text not null, pot integer not null default 0 check(pot>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.poker_players (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.poker_rooms(id) on delete cascade,
 nickname text not null, counts integer[] not null default array[0,0,0,0,0],
 player_token text not null, created_at timestamptz not null default now(),
 constraint valid_counts check(array_length(counts,1)=5 and counts[1]>=0 and counts[2]>=0 and counts[3]>=0 and counts[4]>=0 and counts[5]>=0)
);
alter table public.poker_rooms enable row level security;
alter table public.poker_players enable row level security;
-- Casual-game MVP policies: room codes are not a security boundary.
create policy "room read" on public.poker_rooms for select using(true);
create policy "room create" on public.poker_rooms for insert with check(true);
create policy "room update" on public.poker_rooms for update using(true) with check(true);
create policy "player read" on public.poker_players for select using(true);
create policy "player join" on public.poker_players for insert with check(true);
create policy "player update" on public.poker_players for update using(true) with check(true);
create policy "player delete" on public.poker_players for delete using(true);
do $$ begin alter publication supabase_realtime add table public.poker_rooms; exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poker_players; exception when duplicate_object then null; when others then null; end $$;