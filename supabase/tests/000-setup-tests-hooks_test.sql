-- Pre-test setup hook: installs pgTAP + supabase_test_helpers into the local/CI test
-- database only. This file is NOT a migration and never ships to production; it exists
-- solely so pgTAP suites under supabase/tests/ can self-provision users and assert RLS.
-- Per the Supabase Advanced pgTAP Testing guide:
-- https://supabase.com/docs/guides/local-development/testing/pgtap-extended

create extension if not exists pgtap with schema extensions;

create extension if not exists http with schema extensions;
create extension if not exists pg_tle;
drop extension if exists "supabase-dbdev";
select pgtle.uninstall_extension_if_exists('supabase-dbdev');
select
    pgtle.install_extension(
        'supabase-dbdev',
        resp.contents ->> 'version',
        'PostgreSQL package manager',
        resp.contents ->> 'sql'
    )
from extensions.http(
    (
        'GET',
        'https://api.database.dev/rest/v1/'
        || 'package_versions?select=sql,version'
        || '&package_name=eq.supabase-dbdev'
        || '&order=version.desc'
        || '&limit=1',
        array[
            -- Public anon key for database.dev's own package registry (not a project
            -- secret), copied verbatim from the Supabase Advanced pgTAP Testing guide.
            ('apiKey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyYndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzIsImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJrzM0AQKsu_5k134s')::extensions.http_header
        ],
        null,
        null
    )
) x,
lateral (
    select
        ((row_to_json(x) -> 'content') #>> '{}')::json -> 0
) resp(contents);
create extension "supabase-dbdev";
select dbdev.install('supabase-dbdev');
drop extension if exists "supabase-dbdev";
create extension "supabase-dbdev";

-- Install test helpers
select dbdev.install('basejump-supabase_test_helpers');
create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

-- Verify setup with a no-op test
begin;
select plan(1);
select ok(true, 'Pre-test hook completed successfully');
select * from finish();
rollback;
