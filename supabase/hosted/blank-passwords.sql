-- Students have no passwords, so Auth keeps none. Run this in the hosted project's SQL editor. It is safe to run again.
-- The function lives in the private app schema, because the postgres role cannot create objects in auth.
create schema if not exists app;

create or replace function app.blank_auth_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

create or replace trigger blank_auth_password
  before insert or update on auth.users
  for each row
  when (new.encrypted_password <> '')
  execute function app.blank_auth_password();

update auth.users set encrypted_password = '' where encrypted_password <> '';
