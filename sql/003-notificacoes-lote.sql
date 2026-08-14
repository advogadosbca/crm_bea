-- ============================================================================
--  Notificações — ações em lote (excluir)
-- ============================================================================
--  COMO RODAR: `node migrate-notificacoes.mjs` (pg-meta + service_role de
--  .env.prod), ou colar no SQL Editor. É idempotente.
--
--  POR QUE "EXCLUIR" É UM STATUS, E NÃO UM DELETE
--  A ingestão do DJEN não manda "o que há de novo": ela manda TODAS as
--  publicações do processo a cada rodada (conferido em 13/08/2026 — um processo
--  da base devolveu 18 publicações, incluindo as de meses atrás). Quem impede a
--  duplicação são os índices únicos por `external_id`/`hash_origem`, que só
--  funcionam porque a linha continua existindo.
--
--  Ou seja: um DELETE de verdade seria desfeito na sincronização da manhã
--  seguinte — o item voltaria para a caixa como se fosse novo. A exclusão
--  precisa deixar rastro na tabela, e é isso que o status 'excluida' faz.
--  Ela some de todas as abas da tela; a linha fica para o dedupe.
-- ============================================================================

alter table public.comunicacoes drop constraint if exists comunicacoes_status_ck;
alter table public.comunicacoes add constraint comunicacoes_status_ck
  check (status in ('nova','aprovada','dispensada','excluida'));

alter table public.comunicacoes add column if not exists excluida_em  timestamptz;
alter table public.comunicacoes add column if not exists excluida_por uuid
  references public.profiles(id) on delete set null;

-- A tela lista por status o tempo todo (caixa, tratadas, contador da sidebar).
-- Com quase mil linhas por workspace o índice já paga.
create index if not exists comunicacoes_ws_status_idx
  on public.comunicacoes (workspace_id, status, detectado_em desc);
