-- ============================================================
-- idevelopit-vault - local development seed
-- Run AFTER local-schema.sql. Safe to re-run.
-- Default login: admin@idevelopit.local / vault-dev-2026
-- (bcrypt hash below). Change the password before any real use.
-- ============================================================

insert into profiles (id, email, password_hash, name, app_role)
values (
  gen_random_uuid(),
  'admin@idevelopit.local',
  '$2b$10$d061Io86MQ6QnKiTqF/h/upeLiIrva2/kiuGvicvy2.a18ZRY6mXe',
  'Admin',
  'superadmin'
)
on conflict (email) do nothing;

insert into services (name, default_price)
select v.name, v.price
from (values
  ('Website build', 1800),
  ('Branding package', 900),
  ('Social media management', 450),
  ('SEO audit', 300)
) as v(name, price)
where not exists (select 1 from services s where s.name = v.name);

insert into expense_categories (name) values
  ('tools'),('ads'),('supplies'),('subscriptions'),('travel'),('other')
on conflict (name) do nothing;

do $$
declare owner uuid;
begin
  select id into owner from profiles where email = 'admin@idevelopit.local';

  if not exists (select 1 from contacts) then
    insert into contacts (name, instagram, whatsapp, email, stage, assigned_to, notes, created_by) values
      ('Layal Haddad','layal.studio','+9613111222','','negotiating',owner,'Runs a boutique, wants full rebrand.',owner),
      ('Karim Nassar','','+9617555888','karim@nassar.co','contacted',owner,'',owner),
      ('Maya Fares','maya.f','','','new',owner,'Referral from Karim.',owner);
  end if;

  if not exists (select 1 from tasks) then
    insert into tasks (title, created_by, assigned_to, due_date, priority, status) values
      ('Chase warm leads', owner, owner, current_date + 1, 'high', 'open');
  end if;
end$$;
