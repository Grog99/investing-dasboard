-- Price-snapshots shared-reference RLS suite. Inverse of the holdings isolation test:
-- prices are public data, so RLS must let every authenticated user read and upsert the
-- same rows -- a second user seeing the first user's snapshot is the intended shape, not
-- a leak. Anon is denied at the privilege stage (no grant to anon in the migration).

begin;
select plan(7);

select tests.rls_enabled('public', 'price_snapshots');

select tests.create_supabase_user('user_a');
select tests.create_supabase_user('user_b');

-- User A: upsert + select a snapshot
select tests.authenticate_as('user_a');

insert into public.price_snapshots (symbol, price, currency, as_of)
  values ('AAPL', 150, 'USD', now());

select results_eq(
  'select price from public.price_snapshots where symbol = ''AAPL''',
  ARRAY[150::numeric(20, 8)],
  'user A sees the snapshot they inserted'
);

-- User B: sees the SAME row (shared-reference intent, not isolated)
select tests.authenticate_as('user_b');

select results_eq(
  'select price from public.price_snapshots where symbol = ''AAPL''',
  ARRAY[150::numeric(20, 8)],
  'user B reads the same snapshot user A inserted'
);

-- User B: can upsert (update) the shared row
insert into public.price_snapshots (symbol, price, currency, as_of)
  values ('AAPL', 155, 'USD', now())
  on conflict (symbol) do update set price = excluded.price, as_of = excluded.as_of;

select results_eq(
  'select price from public.price_snapshots where symbol = ''AAPL''',
  ARRAY[155::numeric(20, 8)],
  'user B can upsert the shared snapshot'
);

-- Authenticated: delete is denied (migration grants only select/insert/update, no delete)
select throws_ok(
  $$ delete from public.price_snapshots where symbol = 'AAPL' $$,
  '42501'
);

-- Anon: denied at the privilege stage (no grant to anon)
select tests.clear_authentication();

select throws_ok(
  $$ select * from public.price_snapshots $$,
  '42501'
);

select throws_ok(
  $$ insert into public.price_snapshots (symbol, price, currency, as_of)
     values ('MSFT', 300, 'USD', now()) $$,
  '42501'
);

select * from finish();
rollback;
