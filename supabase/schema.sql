-- ============================================================================
-- Cook 厨房笔记 · Supabase PostgreSQL 建表脚本
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴执行（可重复执行）
--
-- 说明：
--   1) 前端走的是 Supabase Data API（标准 PostgREST），直接操作 public schema 的表
--   2) 没有加外键约束：种子数据写入顺序不受控，加了会在 init 阶段报外键冲突
--   3) RLS 全开给 anon/authenticated（与原来 CloudBase 的「全开」策略一致），
--      个人/家庭自用可接受；公开部署请改成按 uid 行级隔离
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 用户
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id             text primary key,
  nick           text,
  display_name   text,
  salt           text,
  password_hash  text,
  avatar         text,
  disabled       boolean not null default false,
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2. 菜品（主表 + 3 张关联表）
-- ---------------------------------------------------------------------------
create table if not exists public.dishes (
  id             text primary key,
  name           text not null,
  emoji          text,
  category       text,
  difficulty     integer,
  cook_time_min  integer,
  servings       integer,
  cover_image    text,
  cover_color    text,
  favorite       integer not null default 0,
  created_at     timestamptz default now(),
  tips           text
);

create table if not exists public.dish_tags (
  dish_id  text not null,
  tag      text not null,
  primary key (dish_id, tag)
);

create table if not exists public.dish_ingredients (
  id             bigint generated always as identity primary key,
  dish_id        text not null,
  ingredient_id  text not null,
  amount         numeric,
  unit           text
);
create index if not exists idx_dish_ingredients_dish on public.dish_ingredients(dish_id);

create table if not exists public.dish_steps (
  dish_id     text not null,
  step_order  integer not null,
  step_text   text,
  primary key (dish_id, step_order)
);

-- ---------------------------------------------------------------------------
-- 3. 食材库
-- ---------------------------------------------------------------------------
create table if not exists public.ingredients (
  id             text primary key,
  name           text not null,
  category       text,
  price_per_unit numeric,
  unit           text,
  spec           text,
  note           text,
  unit_grams     numeric,
  unit_ml        numeric
);

-- ---------------------------------------------------------------------------
-- 4. 按用户隔离的数据（id = uid）
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_lists (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

create table if not exists public.weekly_menus (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 5. 家庭（多人共享）
-- ---------------------------------------------------------------------------
create table if not exists public.families (
  id         text primary key,
  admin_uid  text not null,
  created_at timestamptz default now()
);

create table if not exists public.family_members (
  id          text primary key,
  family_id   text not null,
  uid         text not null,
  name        text,
  role        text not null default 'member',
  permission  text not null default 'view',
  joined_at   timestamptz default now()
);
create index if not exists idx_family_members_uid on public.family_members(uid);
create index if not exists idx_family_members_family on public.family_members(family_id);

create table if not exists public.family_invites (
  id          uuid primary key,
  family_id   text not null,
  from_uid    text not null,
  from_name   text,
  to_uid      text not null,
  to_name     text,
  status      text not null default 'pending',
  type        text not null default 'invite',
  created_at  timestamptz default now()
);

create table if not exists public.family_menu_audit (
  id          uuid primary key,
  family_id   text not null,
  actor_uid   text,
  actor_name  text,
  action      text,
  day         text,
  detail      text,
  created_at  timestamptz default now()
);
create index if not exists idx_family_menu_audit_family on public.family_menu_audit(family_id);

-- ---------------------------------------------------------------------------
-- 6. 日志
-- ---------------------------------------------------------------------------
create table if not exists public.login_logs (
  id        text primary key,
  uid       text,
  nick      text,
  login_at  timestamptz default now(),
  ip        text,
  region    text,
  device    text,
  os        text,
  browser   text,
  ua        text,
  screen    text,
  language  text
);
create index if not exists idx_login_logs_login_at on public.login_logs(login_at desc);

create table if not exists public.op_logs (
  id          text primary key,
  actor_uid   text,
  actor_name  text,
  action      text,
  target      text,
  detail      text,
  created_at  timestamptz default now()
);
create index if not exists idx_op_logs_created_at on public.op_logs(created_at desc);

-- ============================================================================
-- RLS：启用并给 anon / authenticated 全开（与个人项目此前的策略一致）
-- ============================================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'users','dishes','dish_tags','dish_ingredients','dish_steps','ingredients',
      'shopping_lists','weekly_menus','families','family_members',
      'family_invites','family_menu_audit','login_logs','op_logs'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy p_anon_all on public.%I for all to anon using (true) with check (true)', t
    );
    execute format(
      'create policy p_auth_all on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
exception
  when duplicate_object then null;  -- policy 已存在，忽略
end $$;

-- ============================================================================
-- 权限（Supabase 默认已给大部分，这里显式补一次，防止新建表漏权限）
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

-- ============================================================================
-- 建完之后：App 首次打开会自动把内置的 57 道菜 + 83 种食材写进来
-- （dishes / ingredients 为空时会走各自的 seed 逻辑）
-- ============================================================================
