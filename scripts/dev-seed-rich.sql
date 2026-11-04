-- threwlines — richer local development data
-- Run AFTER local-schema.sql and local-seed.sql. Safe to re-run.
--
-- Exists so the billing and licensing screens have something to render:
-- every invoice status, every licence effective status, payments, expenses
-- and a contract. Local development only — never run against real data.
-- ============================================================

begin;

-- Licensed products -------------------------------------------------
insert into licensed_products (code, name, description, default_max_activations, default_offline_grace_days, default_validation_hours, active, created_by)
select v.code, v.name, v.description, v.maxact, v.grace, v.hours, true, p.id
from (values
  ('orbit-pro', 'Orbit Pro', 'Desktop scheduling suite for clinics.', 5, 14, 24),
  ('ledgerkit', 'LedgerKit', 'Point-of-sale and receipts for small retail.', 3, 7, 12)
) as v(code, name, description, maxact, grace, hours)
cross join (select id from profiles where email = 'admin@threwlines.local') p
on conflict (code) do nothing;

-- Contracts ---------------------------------------------------------
insert into client_contracts (contact_id, contract_number, title, start_date, end_date, billing_day, due_days, currency, status, notes, created_by)
select c.id, 'CTR-2026-004', 'Orbit Pro — annual support retainer',
       date '2026-01-15', date '2026-12-31', 15, 14, 'USD', 'active',
       'Renews annually unless cancelled 30 days before term end.', p.id
from contacts c
cross join (select id from profiles where email = 'admin@threwlines.local') p
where c.name = 'Layal Haddad'
  and not exists (select 1 from client_contracts where contract_number = 'CTR-2026-004');

-- Invoices, one per status ------------------------------------------
-- due_date >= invoice_date and discount <= subtotal are enforced by CHECK.
insert into invoices (invoice_number, contact_id, status, invoice_date, due_date, currency, subtotal, discount, total_amount, notes, terms, created_by, finalized_at)
select v.number, c.id, v.status::invoice_status, v.inv_date, v.due_date, 'USD',
       v.subtotal, v.discount, v.subtotal - v.discount, v.notes,
       'Payment due within 14 days of the invoice date.', p.id,
       case when v.status = 'draft' then null else v.inv_date::timestamptz + time '10:30' end
from (values
  ('INV-2026-0041', 'Maya Fares',   'paid',           date '2026-09-02', date '2026-09-16', 1850.00,   0.00, 'Settled in full by OMT on 11 September.'),
  ('INV-2026-0042', 'Layal Haddad', 'partially_paid', date '2026-09-18', date '2026-10-02', 3240.50, 240.50, 'Deposit received; balance due on delivery.'),
  ('INV-2026-0043', 'Karim Nassar', 'overdue',        date '2026-08-11', date '2026-08-25',  980.00,   0.00, 'Second reminder sent 29 August.'),
  ('INV-2026-0044', 'Layal Haddad', 'sent',           date '2026-10-20', date '2026-11-03', 1420.75,   0.00, 'Awaiting purchase order reference.'),
  ('INV-2026-0045', 'Maya Fares',   'draft',          date '2026-11-01', date '2026-11-15',  610.00,  10.00, 'Scope still being confirmed.'),
  ('INV-2026-0046', 'Karim Nassar', 'cancelled',      date '2026-07-07', date '2026-07-21',  450.00,   0.00, 'Cancelled: project put on hold by the client.')
) as v(number, contact_name, status, inv_date, due_date, subtotal, discount, notes)
join contacts c on c.name = v.contact_name
cross join (select id from profiles where email = 'admin@threwlines.local') p
where not exists (select 1 from invoices i where i.invoice_number = v.number);

-- Invoice line items -------------------------------------------------
-- line_total is a generated column; the database computes it.
insert into invoice_items (invoice_id, description, quantity, unit_price, sort_order)
select i.id, v.description, v.qty, v.unit_price, v.sort_order
from (values
  ('INV-2026-0041', 'Brand identity refresh',             1, 1200.00, 1),
  ('INV-2026-0041', 'Social templates, set of ten',       1,  650.00, 2),
  ('INV-2026-0042', 'Orbit Pro licence, annual',          3,  780.00, 1),
  ('INV-2026-0042', 'Onboarding and staff training',      1,  900.00, 2),
  ('INV-2026-0043', 'Monthly retainer, August',           1,  980.00, 1),
  ('INV-2026-0044', 'LedgerKit rollout, two branches',    2,  610.00, 1),
  ('INV-2026-0044', 'Data import from previous system',   1,  200.75, 2),
  ('INV-2026-0045', 'Discovery workshop',                 1,  610.00, 1),
  ('INV-2026-0046', 'Landing page build',                 1,  450.00, 1)
) as v(number, description, qty, unit_price, sort_order)
join invoices i on i.invoice_number = v.number
where not exists (select 1 from invoice_items x where x.invoice_id = i.id and x.sort_order = v.sort_order);

-- Receipts against invoices ------------------------------------------
insert into invoice_payments (invoice_id, amount, payment_method, paid_on, transaction_reference, notes, received_by)
select i.id, v.amount, v.method::invoice_payment_method, v.paid_on, v.reference, v.notes, p.id
from (values
  ('INV-2026-0041', 1850.00, 'omt',   date '2026-09-11', 'OMT-884213', 'Paid in full.'),
  ('INV-2026-0042', 1500.00, 'whish', date '2026-09-22', 'WSH-55120',  'Deposit, 50 percent.')
) as v(number, amount, method, paid_on, reference, notes)
join invoices i on i.invoice_number = v.number
cross join (select id from profiles where email = 'admin@threwlines.local') p
where not exists (select 1 from invoice_payments x where x.invoice_id = i.id and x.transaction_reference = v.reference);

-- Contact-level ledger -------------------------------------------------
insert into payments (contact_id, service_id, amount, status, paid_on)
select c.id, s.id, v.amount, v.status::payment_status, v.paid_on
from (values
  ('Maya Fares',   'paid',    1850.00, date '2026-09-11'),
  ('Layal Haddad', 'pending', 1740.50, null),
  ('Karim Nassar', 'pending',  980.00, null)
) as v(contact_name, status, amount, paid_on)
join contacts c on c.name = v.contact_name
join lateral (select id from services order by name limit 1) s on true
where not exists (select 1 from payments x where x.contact_id = c.id and x.amount = v.amount);

-- Expenses --------------------------------------------------------------
insert into expenses (amount, category_id, description, spent_on, paid_by, created_by)
select v.amount, cat.id, v.description, v.spent_on, p.id, p.id
from (values
  (120.00, 'Adobe Creative Cloud, November',   date '2026-11-01'),
  ( 45.90, 'Domain renewals, three domains',   date '2026-10-28'),
  (310.00, 'Client lunch and travel, Tripoli', date '2026-10-19'),
  ( 89.99, 'Figma team seat',                  date '2026-10-02'),
  (240.00, 'Hosting and backups, quarterly',   date '2026-09-30')
) as v(amount, description, spent_on)
join lateral (select id from expense_categories order by name limit 1) cat on true
cross join (select id from profiles where email = 'admin@threwlines.local') p
where not exists (select 1 from expenses x where x.description = v.description);

-- Licences, covering every effective status ------------------------------
-- status = 'revoked' must coincide with revoked_at, and expires_at > starts_at.
-- scheduled and expired are derived by the license_registry view from the dates.
insert into licenses (contact_id, product_id, key_digest, key_prefix, key_last_four, license_type, status,
                      starts_at, expires_at, max_activations, offline_grace_days, validation_hours,
                      entitlements, internal_notes, token_version, issued_by, revoked_by, revoked_at)
select c.id, pr.id,
       decode(md5(v.prefix || v.last_four), 'hex'),
       v.prefix, v.last_four, v.ltype::license_type, v.status::license_status,
       v.starts_at, v.expires_at, v.maxact, v.grace, v.hours,
       v.entitlements::jsonb, v.notes, 1, p.id,
       case when v.status = 'revoked' then p.id end,
       case when v.status = 'revoked' then v.starts_at + interval '120 days' end
from (values
  ('Maya Fares',   'orbit-pro', 'ORBP-7K2M', '4F1A', 'subscription', 'active',    now() - interval '200 days', now() + interval '165 days', 5, 14, 24, '{"seats": 5, "modules": ["scheduling", "reports"]}', 'Renewed early at the client''s request.'),
  ('Layal Haddad', 'orbit-pro', 'ORBP-9QX4', 'B820', 'subscription', 'suspended', now() - interval '300 days', now() + interval '65 days',  3, 14, 24, '{"seats": 3, "modules": ["scheduling"]}',             'Suspended pending payment of INV-2026-0042.'),
  ('Karim Nassar', 'ledgerkit', 'LDGK-3T8P', 'C047', 'subscription', 'revoked',   now() - interval '400 days', now() + interval '30 days',  3,  7, 12, '{"seats": 1}',                                        'Revoked after the terminal was resold.'),
  ('Layal Haddad', 'ledgerkit', 'LDGK-6M1W', 'E3D9', 'subscription', 'active',    now() + interval '21 days',  now() + interval '386 days', 2,  7, 12, '{"seats": 2}',                                        'Starts with the second branch opening.'),
  ('Maya Fares',   'ledgerkit', 'LDGK-2V5H', 'A77B', 'trial',        'active',    now() - interval '120 days', now() - interval '30 days',  1,  0, 12, '{"seats": 1, "trial": true}',                         'Trial lapsed; follow up about converting.')
) as v(contact_name, product_code, prefix, last_four, ltype, status, starts_at, expires_at, maxact, grace, hours, entitlements, notes)
join contacts c on c.name = v.contact_name
join licensed_products pr on pr.code = v.product_code
cross join (select id from profiles where email = 'admin@threwlines.local') p
where not exists (select 1 from licenses x where x.key_prefix = v.prefix);

commit;
