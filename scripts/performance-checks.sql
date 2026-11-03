-- Read-only EXPLAIN probes for the common paged-list queries.
-- Run against the local Postgres from psql (or any client) once
-- scripts/local-schema.sql has been applied.

explain (costs, verbose)
select id, name, stage, last_touched_at
from public.contacts
order by last_touched_at desc, id desc
limit 25;

explain (costs, verbose)
select id, name, stage, last_touched_at
from public.contacts
where stage = 'negotiating'
order by last_touched_at asc, id asc
limit 40;

explain (costs, verbose)
select id, description, spent_on
from public.expenses
order by spent_on desc, id desc
limit 25;

explain (costs, verbose)
select id, title, due_date
from public.tasks
where status = 'open'
order by due_date asc nulls last, id asc
limit 25;

explain (costs, verbose)
select id, contact_id, created_at
from public.activities
where contact_id = '00000000-0000-0000-0000-000000000000'
order by created_at desc, id desc
limit 20;

explain (costs, verbose)
select id, contact_id, created_at
from public.payments
where contact_id = '00000000-0000-0000-0000-000000000000'
order by created_at desc, id desc
limit 20;

-- Small tables may still choose a sequential scan. Recheck after realistic
-- data volume is loaded; PostgreSQL will choose the cheapest valid plan.
