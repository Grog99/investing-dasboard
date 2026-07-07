-- Create holdings table with per-account RLS isolation pattern.
-- This is the first domain table; the RLS block, audit trigger, and grant
-- shape here are the template every later domain table copies.

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  quantity numeric(20, 8) not null check (quantity > 0),
  buy_price numeric(20, 8) not null check (buy_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index holdings_user_id_idx on public.holdings (user_id);

alter table public.holdings enable row level security;

grant select, insert, update, delete on public.holdings to authenticated;

create policy "holdings_select_own" on public.holdings
  for select to authenticated using (auth.uid() = user_id);
create policy "holdings_insert_own" on public.holdings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "holdings_update_own" on public.holdings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "holdings_delete_own" on public.holdings
  for delete to authenticated using (auth.uid() = user_id);

create extension if not exists moddatetime schema extensions;

create trigger handle_holdings_updated_at
  before update on public.holdings
  for each row execute function extensions.moddatetime(updated_at);
