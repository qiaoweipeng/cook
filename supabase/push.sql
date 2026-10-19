-- ============================================================================
-- Web Push：订阅表
-- 在 Supabase 控制台 → SQL Editor 里整段执行
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null,
  family_id   text,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now()
);

create index if not exists idx_push_subs_uid on public.push_subscriptions(uid);
create index if not exists idx_push_subs_family on public.push_subscriptions(family_id);

-- 同一台设备重复订阅时走 upsert（on conflict endpoint），不堆重复记录
create unique index if not exists uq_push_subs_endpoint
  on public.push_subscriptions(endpoint);

-- RLS：跟项目里其他表保持一致（anon / authenticated 全开）
do $$
begin
  alter table public.push_subscriptions enable row level security;
  create policy p_anon_all on public.push_subscriptions
    for all to anon using (true) with check (true);
  create policy p_auth_all on public.push_subscriptions
    for all to authenticated using (true) with check (true);
exception
  when duplicate_object then null;
end $$;

grant all on public.push_subscriptions to anon, authenticated;
