-- Rebrand ThrewLines -> Nosterys Vault: the one data change the rebrand needs.
-- Idempotent; safe to run more than once. Apply after scripts/local-schema.sql.
-- ============================================================

begin;

-- 1. Template background style.
--    The value is interpolated into a CSS class name, and the stylesheet now
--    defines .invoice-background-signature-wave. Templates are migrated so new
--    invoices are written with the current spelling.
update public.document_templates
set config = jsonb_set(config, '{backgroundStyle}', '"signature-wave"')
where config->>'backgroundStyle' = 'threwlines-wave';

-- 2. invoices.template_snapshot is deliberately NOT migrated.
--    It is frozen at finalisation and is the record of what was actually sent
--    to a customer; rewriting it would edit history. lib/template-background.ts
--    accepts both spellings on read, so those invoices keep rendering exactly
--    as they did. Nothing to do here - this comment is the decision.

commit;

-- 3. Report. The company name shown on invoices is yours to set, not the
--    rebrand's to overwrite, so change it in Settings -> Company if it still
--    reads ThrewLines. Printed below so you do not have to go looking.
select 'company_name' as setting, company_name as value from public.app_settings where id = 1;

select
  coalesce(config->>'backgroundStyle', '(unset)') as background_style,
  count(*) as templates
from public.document_templates
group by 1
order by 2 desc;

select
  count(*) filter (where template_snapshot->>'backgroundStyle' = 'threwlines-wave') as frozen_pre_rename,
  count(*) filter (where template_snapshot->>'backgroundStyle' = 'signature-wave') as frozen_current
from public.invoices
where template_snapshot is not null;
