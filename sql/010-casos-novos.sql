-- ============================================================================
--  Casos novos — relatos de clientes novos que esperam o advogado aprovar
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec supabase-db psql -U postgres` ou colar no SQL Editor. Idempotente.
--
--  O FLUXO
--  A Sofia (n8n) conversa com quem chega pelo WhatsApp, entende o caso e manda
--  para cá: telefone, nome, área e o relato detalhado. O caso aparece em
--  Notificações → Casos novos; o advogado lê e aprova ou recusa. A decisão
--  dispara o webhook do n8n (aviso à cliente de que há retorno), e a Sofia,
--  na próxima resposta, consulta o status aqui para seguir com a coleta de
--  dados do agendamento.
--
--  Tabela própria, e não uma linha em `comunicacoes`: aquela é presa a CNJ,
--  publicação do DJEN e classificação da IA — nada disso existe num caso que
--  ainda nem virou processo.
-- ============================================================================

create table if not exists public.casos_novos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- quem é. `telefone_chave` (DDD + últimos 8 dígitos, ver src/lib/telefone.ts)
  -- é o que a consulta da Sofia compara: o WhatsApp manda "5537991096894" e a
  -- equipe escreve "37 9 9109-6894", e os dois têm que achar o mesmo caso.
  telefone       text not null,
  telefone_chave text not null,
  nome           text not null default '',

  -- o caso, como a Sofia entendeu
  area   text not null default '',
  relato text not null,

  -- vínculo com o lead do Funil Pré-Atendimento (db_rows.id). Sem FK pelo
  -- mesmo motivo de comunicacoes.processo_row_id: db_rows é genérica.
  lead_row_id uuid,
  origem      text not null default 'sofia',

  -- ciclo de vida
  status       text not null default 'pendente',   -- pendente | aprovado | recusado
  lida_em      timestamptz,
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_em  timestamptz,
  -- recado do advogado junto com a decisão. Volta para a Sofia na consulta —
  -- é por aqui que o advogado pede "traga a carteira de trabalho" sem abrir
  -- o WhatsApp.
  observacao   text,

  -- aviso à cliente. A decisão vale mesmo se o webhook falhar (a Sofia lê o
  -- status daqui, não do webhook); o erro fica gravado e a tela oferece
  -- reenviar.
  webhook_enviado_em timestamptz,
  webhook_erro       text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint casos_novos_status_ck check (status in ('pendente','aprovado','recusado'))
);

-- um caso pendente por pessoa: a Sofia pode reenviar o relato (a cliente
-- contou mais coisa), e isso deve atualizar o caso na caixa, não abrir outro
create unique index if not exists casos_novos_um_pendente
  on public.casos_novos (workspace_id, telefone_chave)
  where status = 'pendente';

create index if not exists casos_novos_caixa
  on public.casos_novos (workspace_id, status, created_at desc);

create index if not exists casos_novos_telefone
  on public.casos_novos (workspace_id, telefone_chave, created_at desc);

drop trigger if exists casos_novos_touch on public.casos_novos;
create trigger casos_novos_touch before update on public.casos_novos
  for each row execute function public.tg_comunicacoes_touch();

-- RLS: membros do workspace LEEM; escrita só pela service_role (rotas do
-- servidor), como em comunicacoes — decidir passa por /api/casos/acao, que
-- grava auditoria e dispara o webhook.
alter table public.casos_novos enable row level security;

drop policy if exists casos_novos_select on public.casos_novos;
create policy casos_novos_select on public.casos_novos
  for select using (workspace_id = public.my_workspace_id());

-- webhook do n8n que avisa a cliente da decisão. Separado do
-- webhook_cliente_url porque o payload e o fluxo do outro lado são outros.
alter table public.workspace_secrets add column if not exists webhook_caso_url text;

select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'casos_novos')        as tabela_casos_novos,
  (select count(*) from information_schema.columns
     where table_name = 'workspace_secrets' and column_name = 'webhook_caso_url') as coluna_webhook_caso;
