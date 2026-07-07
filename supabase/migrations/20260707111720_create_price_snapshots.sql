-- Create price_snapshots as a shared-reference cache table (public market data,
-- keyed by symbol, no user_id) -- a deliberate departure from the holdings
-- per-account RLS template. Prices are public, so every authenticated user
-- reads and upserts the same rows; anon is denied via the grant, not a policy.

create table public.price_snapshots (
  symbol text primary key,
  price numeric(20, 8) not null,
  currency text not null,
  as_of timestamptz not null,
  source text not null default 'yahoo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.price_snapshots enable row level security;

grant select, insert, update on public.price_snapshots to authenticated;

create policy "price_snapshots_select_all" on public.price_snapshots
  for select to authenticated using (true);
create policy "price_snapshots_insert_any" on public.price_snapshots
  for insert to authenticated with check (true);
create policy "price_snapshots_update_any" on public.price_snapshots
  for update to authenticated using (true) with check (true);

create trigger handle_price_snapshots_updated_at
  before update on public.price_snapshots
  for each row execute function extensions.moddatetime(updated_at);
