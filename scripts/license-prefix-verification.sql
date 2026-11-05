-- Read-only checks for the TL- → NV- licence key prefix change.
-- Run after re-applying scripts/local-schema.sql. Reports only; changes nothing.
-- ============================================================

-- 1. The issuing function mints NV- keys.
select
  case when prosrc like '%''NV-''%' then 'PASS' else 'FAIL' end as status,
  'issue_license mints NV- keys' as check
from pg_proc
where proname = 'issue_license';

-- 2. The activation lookup is prefix-agnostic: it hashes the whole key, so a
--    TL- key issued before the rename still resolves. If this ever stops
--    hashing upper(trim(...)), lib/license-key.ts normalisation breaks with it.
select
  case when prosrc like '%upper(trim(p_license_key))%' then 'PASS' else 'FAIL' end as status,
  'license_api_activate hashes upper(trim(key)), prefix included' as check
from pg_proc
where proname = 'license_api_activate';

-- 3. Existing licences, by the prefix they were issued under. Both are valid;
--    this is here so you can see the TL- population drain as licences are
--    re-issued, not because TL- is a problem.
select
  coalesce(substring(key_prefix from '^[A-Z]+'), '(none)') as prefix,
  count(*) as licences,
  count(*) filter (where status = 'active') as active
from public.licenses
group by 1
order by 2 desc;
