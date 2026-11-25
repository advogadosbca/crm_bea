-- ============================================================================
--  Conector do Claude (MCP) — edição liberada por conexão
-- ============================================================================
--  COMO RODAR: `docker exec -i supabase-db psql -U postgres < 016-conector-claude-edicao.sql`
--  no VPS. Idempotente. Só ACRESCENTA colunas em mcp_oauth_tokens (015).
--
--  O PEDIDO (escritório, 25/11/2026): além de ler, o Claude passa a fazer
--  manutenção no CRM — cadastrar cliente, atualizar campo, registrar o que
--  aconteceu no WhatsApp como comentário, abrir tarefa — com limites por causa
--  da LGPD e do resguardo do escritório.
--
--  AS REGRAS (implementadas em src/lib/mcp/escrita.ts):
--  - Edição é LIGADA POR CONEXÃO, por um sócio, em Configurações → Claude.
--    Toda conexão nasce e continua só leitura até alguém ligar; desligar vale
--    na hora (o conector relê esta coluna a cada chamada).
--  - Pode: comentar e editar campos de registros, cadastrar registros, criar e
--    comentar tarefas. NÃO pode: apagar, arquivar, mexer em colunas/bases,
--    membros, permissões, nem gravar em campo "somente admins".
--  - Toda alteração fica em audit_logs com o sócio dono da conexão como autor e
--    "via Claude" no contexto; edição guarda o valor anterior de cada campo.
-- ============================================================================

alter table public.mcp_oauth_tokens add column if not exists pode_editar boolean not null default false;
alter table public.mcp_oauth_tokens add column if not exists edicao_alterada_por uuid references public.profiles(id) on delete set null;
alter table public.mcp_oauth_tokens add column if not exists edicao_alterada_em timestamptz;

comment on column public.mcp_oauth_tokens.pode_editar is
  'Se esta conexão do Claude pode gravar no CRM (comentar, editar campos, cadastrar, criar tarefa). '
  'Falso = somente leitura. Ligado/desligado por um sócio em Configurações → Claude.';

-- o limite de gravações por hora conta os registros "via Claude" do autor
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

select count(*) filter (where pode_editar) as conexoes_com_edicao, count(*) as conexoes
  from public.mcp_oauth_tokens where revoked_at is null;
