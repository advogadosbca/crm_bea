-- ============================================================================
--  Aprovação de comunicação -> cartão no Quadro de Tarefas
-- ============================================================================
--  COMO RODAR: `node migrate-tarefa-quadro.mjs` (pg-meta + service_role de
--  .env.prod), ou colar no SQL Editor. É idempotente.
--
--  POR QUE A COLUNA
--  Aprovar já criava a linha em Pendências Processuais (`pendencia_row_id`) e,
--  quando era audiência, a linha em Audiências (`audiencia_row_id`). Agora cria
--  também um cartão no Quadro de Tarefas do /geral, com o teor da publicação na
--  descrição — é lá que a equipe trabalha o dia a dia, e obrigar a abrir a
--  Central de Novidades para ler o que o juiz mandou é atrito puro.
--
--  A coluna é a mesma trava de idempotência das outras duas: com ela gravada, a
--  rota de aprovação não cria um segundo cartão se alguém aprovar de novo.
--
--  `on delete set null` porque apagar o cartão no quadro é ação normal do
--  advogado (tarefa cancelada, cartão duplicado) e não pode derrubar nem travar
--  a comunicação que o originou.
-- ============================================================================

alter table public.comunicacoes add column if not exists tarefa_card_id uuid
  references public.board_cards(id) on delete set null;

select count(*) as comunicacoes_com_cartao
  from public.comunicacoes where tarefa_card_id is not null;
