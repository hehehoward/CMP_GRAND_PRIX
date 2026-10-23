-- CMP 大獎賽：主持人資料庫管理（在 SQL Editor 貼上整段，先把最後一行的 PIN 改成你自己的，再按 Run）
-- 網頁本身仍然不能刪除資料；只有帶正確 PIN 呼叫這個函式才能刪除或修改。

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cmpgp_admin (k text primary key, pin_hash text not null);
alter table public.cmpgp_admin enable row level security;   -- 沒有任何 policy：網頁讀不到 PIN
revoke all on public.cmpgp_admin from anon, authenticated;

create or replace function public.cmpgp_admin(p_pin text, p_action text, p_event text default null,
                                              p_id text default null, p_name text default null, p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  if not exists (select 1 from public.cmpgp_admin where k = 'pin' and pin_hash = extensions.crypt(p_pin, pin_hash)) then
    perform pg_sleep(1);                                       -- 拖慢亂猜
    raise exception 'bad pin';
  end if;
  if p_action = 'check' then
    return jsonb_build_object('ok', true);
  elsif p_action = 'events' then
    select coalesce(jsonb_agg(jsonb_build_object('event', event, 'n', n, 'last', last) order by last desc), '[]'::jsonb) into r
      from (select event, count(*) n, max(updated_at) last from public.cmpgp_players group by event) t;
    return r;
  elsif p_action = 'delete_player' then
    delete from public.cmpgp_players where event = p_event and id = p_id;
  elsif p_action = 'delete_event' then
    delete from public.cmpgp_players where event = p_event;
    delete from public.cmpgp_control where event = p_event;
  elsif p_action = 'put' then                                  -- 改名 / 清除決賽設定：主持端送來整筆新資料
    update public.cmpgp_players set name = left(coalesce(p_name, name), 40), payload = p_payload
      where event = p_event and id = p_id;
  else
    raise exception 'unknown action';
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.cmpgp_admin(text, text, text, text, text, jsonb) from public;
grant execute on function public.cmpgp_admin(text, text, text, text, text, jsonb) to anon;

-- ↓↓ 把 'change-me-123' 改成你的 PIN（至少 6 碼）。之後要換 PIN，改這行再執行一次即可。
insert into public.cmpgp_admin (k, pin_hash) values ('pin', extensions.crypt('change-me-123', extensions.gen_salt('bf')))
  on conflict (k) do update set pin_hash = excluded.pin_hash;
