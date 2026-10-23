-- CMP 大獎賽：雲端資料表（在 Supabase → SQL Editor 貼上整段，按 Run）

create table if not exists public.cmpgp_players (
  event      text        not null,
  id         text        not null,
  name       text,
  payload    jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (event, id)
);

create table if not exists public.cmpgp_control (
  event      text        primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- 每次寫入自動更新時間（主持端用它只抓新資料）
create or replace function public.cmpgp_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists cmpgp_players_touch on public.cmpgp_players;
create trigger cmpgp_players_touch before insert or update on public.cmpgp_players
  for each row execute function public.cmpgp_touch();

drop trigger if exists cmpgp_control_touch on public.cmpgp_control;
create trigger cmpgp_control_touch before insert or update on public.cmpgp_control
  for each row execute function public.cmpgp_touch();

create index if not exists cmpgp_players_event_time on public.cmpgp_players (event, updated_at);

-- 權限：網頁（匿名）只能讀寫這兩張表，且限制大小，不能刪除
alter table public.cmpgp_players enable row level security;
alter table public.cmpgp_control enable row level security;

drop policy if exists p_read  on public.cmpgp_players;
drop policy if exists p_ins   on public.cmpgp_players;
drop policy if exists p_upd   on public.cmpgp_players;
create policy p_read on public.cmpgp_players for select to anon using (true);
create policy p_ins  on public.cmpgp_players for insert to anon
  with check (length(event) <= 32 and length(id) <= 40 and pg_column_size(payload) < 300000);
create policy p_upd  on public.cmpgp_players for update to anon using (true)
  with check (length(event) <= 32 and length(id) <= 40 and pg_column_size(payload) < 300000);

drop policy if exists c_read on public.cmpgp_control;
drop policy if exists c_ins  on public.cmpgp_control;
drop policy if exists c_upd  on public.cmpgp_control;
create policy c_read on public.cmpgp_control for select to anon using (true);
create policy c_ins  on public.cmpgp_control for insert to anon with check (length(event) <= 32 and pg_column_size(data) < 4000);
create policy c_upd  on public.cmpgp_control for update to anon using (true) with check (pg_column_size(data) < 4000);

grant select, insert, update on public.cmpgp_players, public.cmpgp_control to anon;
