-- ============================================
-- Supabase Database Schema for AI Chat Desktop
-- ============================================

-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- ============================================
-- 用户配置表
-- ============================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  credits integer default 100 not null,  -- 初始免费点数
  is_pro boolean default false not null,
  subscription_end_date timestamptz,
  paypal_payer_id text,
  paypal_subscription_id text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS 策略
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================
-- 每日用量表
-- ============================================
create table if not exists public.daily_usage (
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  message_count integer default 0 not null,
  created_at timestamptz default now() not null,
  primary key (user_id, date)
);

-- RLS 策略
alter table public.daily_usage enable row level security;

create policy "Users can view own usage"
  on public.daily_usage for select
  using (auth.uid() = user_id);

create policy "Service role can manage usage"
  on public.daily_usage for all
  using (true);

-- ============================================
-- 用量日志表（详细记录）
-- ============================================
create table if not exists public.usage_logs (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade not null,
  tokens_used integer not null,
  model text not null,
  created_at timestamptz default now() not null
);

-- RLS 策略
alter table public.usage_logs enable row level security;

create policy "Users can view own logs"
  on public.usage_logs for select
  using (auth.uid() = user_id);

-- ============================================
-- 触发器：新用户注册时自动创建 profile
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    100  -- 初始免费点数
  );
  return new;
end;
$$ language plpgsql security definer;

-- 创建触发器
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 函数：检查并扣除点数
-- ============================================
create or replace function public.use_credit(user_uuid uuid)
returns boolean as $$
declare
  current_credits integer;
begin
  select credits into current_credits
  from public.profiles
  where id = user_uuid;
  
  if current_credits > 0 then
    update public.profiles
    set credits = credits - 1, updated_at = now()
    where id = user_uuid;
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql security definer;

-- ============================================
-- 函数：增加点数（用于购买或奖励）
-- ============================================
create or replace function public.add_credits(user_uuid uuid, amount integer)
returns void as $$
begin
  update public.profiles
  set credits = credits + amount, updated_at = now()
  where id = user_uuid;
end;
$$ language plpgsql security definer;

-- ============================================
-- 函数：升级到 Pro（由 PayPal Webhook 调用）
-- ============================================
create or replace function public.upgrade_to_pro(
  user_uuid uuid,
  customer_id text,
  subscription_id text,
  end_date timestamptz
)
returns void as $$
begin
  update public.profiles
  set 
    is_pro = true,
    paypal_payer_id = customer_id,
    paypal_subscription_id = subscription_id,
    subscription_end_date = end_date,
    updated_at = now()
  where id = user_uuid;
end;
$$ language plpgsql security definer;

-- ============================================
-- 函数：取消 Pro 订阅
-- ============================================
create or replace function public.cancel_pro(user_uuid uuid)
returns void as $$
begin
  update public.profiles
  set 
    is_pro = false,
    subscription_end_date = null,
    updated_at = now()
  where id = user_uuid;
end;
$$ language plpgsql security definer;

-- ============================================
-- 索引优化
-- ============================================
create index if not exists idx_daily_usage_user_date on public.daily_usage(user_id, date);
create index if not exists idx_usage_logs_user_id on public.usage_logs(user_id);
create index if not exists idx_usage_logs_created_at on public.usage_logs(created_at);
create index if not exists idx_profiles_paypal_subscription_id
  on public.profiles(paypal_subscription_id)
  where paypal_subscription_id is not null;
