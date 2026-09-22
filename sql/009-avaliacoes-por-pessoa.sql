-- ============================================================================
--  Avaliações — uma por tarefa+pessoa, não mais uma por tarefa
-- ============================================================================
--  COMO RODAR: aplicar no Postgres do Supabase self-hosted (VPS) via
--  `docker exec supabase-db psql -U postgres` ou colar no SQL Editor. Idempotente.
--
--  Tarefa com dois colaboradores precisava ser avaliada como um todo — escolher
--  um deles tirava a tarefa da fila de pendentes e o outro nunca era avaliado.
--  Agora a unicidade é por (card_id, avaliado_id): cada colaborador de uma
--  tarefa compartilhada vira uma linha própria em "Pendentes", e avaliar um não
--  consome o outro.
-- ============================================================================

drop index if exists public.avaliacoes_entrega_card_unico_idx;

create unique index if not exists avaliacoes_entrega_card_pessoa_idx
  on public.avaliacoes_entrega (card_id, avaliado_id);

select count(*) as linhas_avaliacoes_entrega from public.avaliacoes_entrega;
