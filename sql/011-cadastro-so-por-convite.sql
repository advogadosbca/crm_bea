-- ============================================================================
--  Cadastro só por convite — conta nova não entra sozinha no escritório
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec supabase-db psql -U postgres` ou colar no SQL Editor. Idempotente.
--
--  O BURACO
--  O trigger de auth.users punha TODA conta nova no primeiro workspace do banco
--  (o do escritório) e aceitava o `role` que viesse em raw_user_meta_data — que
--  no signUp público é o próprio usuário quem escreve. Com o cadastro aberto no
--  GoTrue, qualquer pessoa com a anon key (pública, está no JS da página) se
--  cadastrava com { role: 'admin' } e virava admin do escritório.
--
--  AGORA
--  O perfil nasce sem workspace e como colaborador. Quem dá escritório e papel
--  é a rota de Membros (/api/membros), que já fazia esse update logo depois de
--  criar ou convidar — então o convite continua funcionando igual. Conta criada
--  por qualquer outro caminho fica sem workspace e a RLS não mostra nada a ela.
--
--  Junto com isto: GOTRUE_DISABLE_SIGNUP=true no .env do supabase-crm (convite
--  e criação pelo admin continuam, são endpoints de service_role).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, workspace_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'colaborador',   -- nunca do metadata: o metadata é escrito por quem se cadastra
    null             -- workspace só pela rota de Membros
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

select prosrc like '%''colaborador''%' as trigger_corrigido
from pg_proc where proname = 'handle_new_user';
