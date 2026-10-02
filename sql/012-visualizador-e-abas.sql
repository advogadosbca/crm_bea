-- ============================================================================
--  Papel "visualizador" + acesso por aba definido pelo admin
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec -i supabase-db psql -U postgres` ou colar no SQL Editor.
--  Idempotente.
--
--  O QUE MUDA
--  1. profiles.role aceita 'visualizador': enxerga o sistema, não grava nada.
--     Quem barra é o banco — uma policy RESTRICTIVE de insert/update/delete em
--     toda tabela com RLS. A tela só esconde os botões; sem isto, um console
--     aberto no navegador gravaria do mesmo jeito.
--  2. profiles.abas (jsonb): exceções por aba que o admin liga/desliga na tela
--     de Membros, ex.: {"financeiro": true, "marketing": false}. Aba ausente
--     segue o padrão do papel (ver src/lib/abas.ts).
--  3. O BURACO: a policy de profiles libera UPDATE em todas as colunas para
--     qualquer membro do workspace. Um colaborador conseguia, pelo console,
--     `update profiles set role = 'admin'` em si mesmo (ou apagar o perfil de
--     um colega). Agora só admin mexe em papel/abas/ativo/workspace, e quem
--     não é admin só altera o próprio perfil (nome, foto, OAB).
-- ============================================================================

-- 1. papel novo -------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['super_admin', 'admin', 'colaborador', 'visualizador']));

-- 2. exceções de acesso por aba -------------------------------------------
alter table public.profiles add column if not exists abas jsonb not null default '{}'::jsonb;

create or replace function public.is_visualizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'visualizador' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- 3. trava dos campos sensíveis do perfil ----------------------------------
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (rotas /api) e SQL direto não têm auth.uid(): passam
  if auth.uid() is null then
    return new;
  end if;

  -- super_admin só se cria pelo banco, nunca pelo navegador
  if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
    raise exception 'Papel super_admin não pode ser atribuído pelo sistema' using errcode = '42501';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.id <> auth.uid() then
    raise exception 'Só administradores alteram o perfil de outro membro' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.abas is distinct from old.abas
     or new.is_active is distinct from old.is_active
     or new.workspace_id is distinct from old.workspace_id
     or new.email is distinct from old.email then
    raise exception 'Só administradores alteram papel, acesso ou workspace' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_proteger on public.profiles;
create trigger profiles_proteger
  before update on public.profiles
  for each row execute function public.proteger_perfil();

-- criar/apagar perfil é coisa da rota de Membros (service_role) e do trigger
-- de auth.users (security definer) — nenhum dos dois passa pela RLS
drop policy if exists profiles_so_admin_insere on public.profiles;
create policy profiles_so_admin_insere on public.profiles
  as restrictive for insert with check (public.is_admin());
drop policy if exists profiles_so_admin_exclui on public.profiles;
create policy profiles_so_admin_exclui on public.profiles
  as restrictive for delete using (public.is_admin());

-- 4. visualizador não grava em nada ----------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists visualizador_nao_insere on public.%I', t.relname);
    execute format('drop policy if exists visualizador_nao_altera on public.%I', t.relname);
    execute format('drop policy if exists visualizador_nao_exclui on public.%I', t.relname);

    execute format(
      'create policy visualizador_nao_insere on public.%I as restrictive for insert with check (not public.is_visualizador())',
      t.relname);
    -- o próprio perfil continua editável (nome, foto) — a trava acima segura o resto
    if t.relname = 'profiles' then
      execute 'create policy visualizador_nao_altera on public.profiles as restrictive for update
               using (not public.is_visualizador() or id = auth.uid())
               with check (not public.is_visualizador() or id = auth.uid())';
    else
      execute format(
        'create policy visualizador_nao_altera on public.%I as restrictive for update using (not public.is_visualizador()) with check (not public.is_visualizador())',
        t.relname);
    end if;
    execute format(
      'create policy visualizador_nao_exclui on public.%I as restrictive for delete using (not public.is_visualizador())',
      t.relname);
  end loop;
end;
$$;

-- conferência: toda tabela com RLS precisa ter as 3 policies
select c.relname as tabela_sem_trava
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and (select count(*) from pg_policies p
       where p.schemaname = 'public' and p.tablename = c.relname
         and p.policyname like 'visualizador_nao_%') <> 3;
