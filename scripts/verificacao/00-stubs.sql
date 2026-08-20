-- Reproduz localmente o que o Supabase fornece, para as migrations rodarem
-- sem alteracao nenhuma. Nao faz parte do projeto: existe so para verificar.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- No Supabase, auth.uid() le o "sub" do JWT. Aqui le a mesma variavel de
-- sessao, o que permite trocar de usuario com set_config nos testes.
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
