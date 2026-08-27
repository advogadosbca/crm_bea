-- ============================================================================
--  Arquivar — processo judicial finalizado e tarefa encerrada saem de vista
--             sem sair do banco
-- ============================================================================
--  COMO RODAR: `node migrate-arquivamento.mjs` (pg-meta + service_role de
--  .env.prod), ou colar no SQL Editor. É idempotente.
--
--  O PEDIDO (escritório, 26/08/2026): "possibilidade de arquivar processos
--  judiciais finalizados e tarefas encerradas" — eles não querem que isso ocupe
--  espaço na fonte de dados, MAS precisam alcançar o registro anos depois,
--  quando o cliente volta a procurar.
--
--  POR QUE UM CARIMBO DE DATA, E NÃO UM `boolean` NEM UMA COLUNA "Status"
--  - `arquivado_em` responde "desde quando", que é o que interessa numa gaveta
--    consultada anos depois; um boolean só responde "sim/não".
--  - Coluna de status seria por fonte de dados (cada `db_table` tem as suas), e
--    arquivar precisa valer para QUALQUER fonte — Processos, Alvarás, Audiências
--    e as que o escritório criar amanhã. Fica na linha, não no esquema de cada
--    tabela.
--
--  NÃO APAGA NADA. Arquivar é esconder da visualização padrão; a linha continua
--  no banco, continua respondendo às relações (o processo arquivado segue
--  aparecendo na ficha do cliente) e volta à vista pelo botão "Arquivados".
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Registros das fontes de dados (Processos Judiciais e demais módulos)
-- ----------------------------------------------------------------------------
alter table public.db_rows add column if not exists arquivado_em timestamptz;

comment on column public.db_rows.arquivado_em is
  'Desde quando o registro está arquivado (fora da visualização padrão da fonte). '
  'Nulo = ativo. Arquivar não apaga: a linha continua no banco e nas relações.';

-- A gaveta é consultada por fonte ("os processos arquivados"), então o índice
-- parcial serve tanto para contar quanto para listar sem varrer a tabela toda.
create index if not exists db_rows_arquivados_idx
  on public.db_rows (table_id, arquivado_em)
  where arquivado_em is not null;

-- ----------------------------------------------------------------------------
--  2. Tarefas do Quadro
-- ----------------------------------------------------------------------------
--  Já existe uma saída automática: encerrada há mais de 45 dias some sozinha
--  (ver 005). O que faltava era a saída MANUAL — hoje são 57 cartões parados em
--  "Finalizado", todos encerrados há menos de 45 dias, ocupando a coluna inteira
--  e sem nenhuma forma de tirá-los dali antes do prazo.
alter table public.board_cards add column if not exists arquivado_em timestamptz;

comment on column public.board_cards.arquivado_em is
  'Quando a tarefa foi arquivada à mão (sai do quadro na hora, sem esperar os 45 '
  'dias de encerrada). Nula enquanto a tarefa não estiver arquivada; o trigger '
  'board_cards_encerramento zera junto com encerrado_em quando a tarefa volta a '
  'ser trabalho vivo.';

-- Invariante: só tarefa ENCERRADA fica arquivada. Quem reabre um cartão ou o
-- arrasta de volta para uma coluna de trabalho tira ele da gaveta no mesmo
-- movimento — e isso vale para todo caminho de escrita (tela, script, webhook),
-- que é a razão de a regra morar no trigger e não no cliente.
create or replace function public.tg_board_cards_encerramento()
returns trigger language plpgsql as $$
declare encerrada boolean;
begin
  select new.completed or public.board_lista_encerra(l.title)
    into encerrada
    from public.board_lists l
   where l.id = new.list_id;

  -- lista apagada no meio do caminho: sobra o que o próprio cartão diz
  encerrada := coalesce(encerrada, new.completed, false);

  if encerrada then
    -- Já encerrada mantém o carimbo original: arrastar uma tarefa CONCLUÍDA de
    -- "Finalizado" para "Arquivo", renomear o cartão ou trocar o responsável não
    -- devolve 45 dias de sobrevida. (Uma NÃO concluída largada em "Finalizado"
    -- é outra história: tirando ela de lá volta a ser trabalho vivo, e o ramo
    -- de baixo zera o carimbo.)
    new.encerrado_em := coalesce(new.encerrado_em, now());
  else
    -- reabriu ou voltou para uma coluna de trabalho: a contagem morre aqui,
    -- e a tarefa sai da gaveta junto — trabalho vivo não fica arquivado
    new.encerrado_em := null;
    new.arquivado_em := null;
  end if;

  return new;
end $$;

drop trigger if exists board_cards_encerramento on public.board_cards;
create trigger board_cards_encerramento
  before insert or update on public.board_cards
  for each row execute function public.tg_board_cards_encerramento();

select (select count(*) from public.db_rows     where arquivado_em is not null) as linhas_arquivadas,
       (select count(*) from public.board_cards where arquivado_em is not null) as tarefas_arquivadas;
