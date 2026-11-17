-- ============================================================================
--  Conector do Claude (MCP) — login OAuth e conexões
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec -i supabase-db psql -U postgres < 015-conector-claude.sql`.
--  Idempotente. Só CRIA tabelas novas; não toca em nenhuma existente.
--
--  O QUE É
--  O escritório usa o Claude ("Cláudio") e quer que ele leia o CRM — clientes,
--  processos, prazos, tarefas — para ajudar nas peças e no pós-venda. O Claude
--  conecta por um conector MCP (src/app/api/mcp) que SÓ LÊ. Para isso o Claude
--  precisa de um login: OAuth 2.1 com registro dinâmico de cliente (é o que o
--  claude.ai aceita; chave fixa no endereço ele proíbe).
--
--  As três tabelas são o estado desse login:
--    mcp_oauth_clients  — cada registro dinâmico que o Claude faz (RFC 7591)
--    mcp_oauth_codes    — código de autorização, vale 5 min e um uso só
--    mcp_oauth_tokens   — a conexão: tokens de acesso (1 h) e de renovação
--                         (30 dias, trocado a cada uso). Revogar = cortar o
--                         Claude daquela pessoa na hora.
--
--  SEGURANÇA
--  Nenhum token é guardado em claro: só o SHA-256. RLS ligada e nenhuma policy
--  permissiva — só a service_role (servidor do CRM) lê e grava. As 3 policies
--  `visualizador_nao_*` entram por padrão do sistema (ver 012).
-- ============================================================================

create table if not exists public.mcp_oauth_clients (
  client_id     text primary key,
  client_name   text not null default '',
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  scope          text not null default '',
  resource       text,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.mcp_oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  client_name        text not null default '',
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  scope              text not null default '',
  access_hash        text not null unique,
  access_expires_at  timestamptz not null,
  refresh_hash       text not null unique,
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);

create index if not exists mcp_oauth_tokens_ws_idx on public.mcp_oauth_tokens (workspace_id, revoked_at);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes   enable row level security;
alter table public.mcp_oauth_tokens  enable row level security;

-- padrão do sistema (012): toda tabela pública tem as 3 travas do visualizador
do $$
declare t text;
begin
  foreach t in array array['mcp_oauth_clients', 'mcp_oauth_codes', 'mcp_oauth_tokens'] loop
    execute format('drop policy if exists visualizador_nao_insere on public.%I', t);
    execute format('drop policy if exists visualizador_nao_altera on public.%I', t);
    execute format('drop policy if exists visualizador_nao_exclui on public.%I', t);
    execute format('create policy visualizador_nao_insere on public.%I as restrictive for insert with check (not public.is_visualizador())', t);
    execute format('create policy visualizador_nao_altera on public.%I as restrictive for update using (not public.is_visualizador()) with check (not public.is_visualizador())', t);
    execute format('create policy visualizador_nao_exclui on public.%I as restrictive for delete using (not public.is_visualizador())', t);
  end loop;
end $$;

select 'mcp_oauth_clients' as tabela, count(*) from public.mcp_oauth_clients
union all select 'mcp_oauth_codes', count(*) from public.mcp_oauth_codes
union all select 'mcp_oauth_tokens', count(*) from public.mcp_oauth_tokens;
