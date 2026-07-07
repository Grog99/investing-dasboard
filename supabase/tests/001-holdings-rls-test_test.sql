-- Holdings cross-account RLS isolation suite. This is the template later domain tables
-- (watchlist, notes) copy: prove RLS is enabled, an owner has full CRUD on their own rows,
-- a second authenticated user is fully blind to and cannot mutate those rows, and anon
-- sees nothing.

begin;
select plan(10);

select tests.rls_enabled('public', 'holdings');

select tests.create_supabase_user('user_a');
select tests.create_supabase_user('user_b');

-- Owner: full CRUD on own row
select tests.authenticate_as('user_a');

insert into public.holdings (user_id, ticker, quantity, buy_price)
  values (tests.get_supabase_uid('user_a'), 'CDR', 10, 100);

select results_eq(
  'select count(*)::int from public.holdings',
  ARRAY[1],
  'owner sees own holding'
);

update public.holdings set quantity = 20 where ticker = 'CDR';

select results_eq(
  'select quantity from public.holdings where ticker = ''CDR''',
  ARRAY[20::numeric(20, 8)],
  'owner can update own holding'
);

-- User B: fully blind, cannot mutate A's row
select tests.authenticate_as('user_b');

select is_empty(
  'select * from public.holdings',
  'user B is blind to user A rows'
);

update public.holdings set quantity = 999 where ticker = 'CDR';
delete from public.holdings where ticker = 'CDR';

select tests.authenticate_as('user_a');

select results_eq(
  'select quantity from public.holdings where ticker = ''CDR''',
  ARRAY[20::numeric(20, 8)],
  'user B update of A row affects zero rows'
);

select results_eq(
  'select count(*)::int from public.holdings',
  ARRAY[1],
  'user B delete of A row affects zero rows'
);

-- User B: can insert and see only their own row
select tests.authenticate_as('user_b');

insert into public.holdings (user_id, ticker, quantity, buy_price)
  values (tests.get_supabase_uid('user_b'), 'PKN', 5, 50);

select results_eq(
  'select count(*)::int from public.holdings',
  ARRAY[1],
  'user B sees only own holding after insert'
);

-- Owner: still sees only their own row, unaffected by B's insert
select tests.authenticate_as('user_a');

select results_eq(
  'select ticker from public.holdings',
  ARRAY['CDR'],
  'owner unaffected by user B holding'
);

-- Anon: sees and can mutate nothing
select tests.clear_authentication();

select is_empty(
  'select * from public.holdings',
  'anon sees nothing'
);

-- Note: throws_ok's 3-arg form treats a 5-char 2nd arg as errcode and the 3rd as the
-- expected errmsg (not a description) per pgTAP semantics, so pass errcode alone here.
select throws_ok(
  $$ insert into public.holdings (user_id, ticker, quantity, buy_price)
     values ('00000000-0000-0000-0000-000000000000', 'ANON', 1, 1) $$,
  '42501'
);

select * from finish();
rollback;
