-- ============================================================================
--  Quadro de Tarefas — tarefa encerrada sai de vista depois de 45 dias
-- ============================================================================
--  COMO RODAR: `node migrate-quadro-encerradas.mjs` (pg-meta + service_role de
--  .env.prod), ou colar no SQL Editor. É idempotente.
--
--  O QUE É "ENCERRADA"
--  Cartão concluído (`completed`) OU parado numa coluna de encerramento
--  ("Finalizado"). Qualquer uma das duas conta — foi o pedido do escritório, e
--  na prática as duas andam juntas: hoje os 26 cartões de "Finalizado" estão
--  todos marcados como fechados.
--
--  POR QUE UM CARIMBO NA LINHA, E NÃO UMA CONTA EM CIMA DO HISTÓRICO
--  Dava para deduzir a data de encerramento lendo `board_activity` a cada
--  carregamento do /geral (o histórico registra tanto o fechamento quanto o
--  "moveu para ..."). Só que isso seria um JOIN pesado numa página que já puxa
--  o quadro inteiro, e — pior — a regra passaria a depender do texto livre do
--  histórico: renomear a coluna quebraria a conta em silêncio.
--
--  POR QUE TRIGGER, E NÃO UM `update` NO CLIENTE
--  O carimbo precisa valer para toda escrita: o arrastar do quadro, o botão de
--  concluir, a aprovação de comunicação e qualquer script de manutenção. Com a
--  regra no banco não existe caminho que esqueça de carimbar — e o zerar ao
--  reabrir vem de graça, que é o que faz os 45 dias contarem do último
--  encerramento e não do primeiro.
--
--  NÃO APAGA NADA. `encerrado_em` só diz desde quando a tarefa está encerrada;
--  quem esconde é a tela, e o botão "mostrar encerradas" traz tudo de volta.
-- ============================================================================

alter table public.board_cards add column if not exists encerrado_em timestamptz;

comment on column public.board_cards.encerrado_em is
  'Desde quando a tarefa está encerrada (concluída ou em coluna de encerramento). '
  'Mantida pelo trigger board_cards_encerramento; nula enquanto a tarefa estiver viva.';

-- Coluna de encerramento é reconhecida pelo NOME, porque é assim que o
-- escritório organiza o quadro (ele cria e renomeia colunas pela tela, sem
-- avisar o banco). Só "Finalizado" entra: "Arquivo" é gaveta manual e sair de
-- vista sozinho ali não foi pedido.
create or replace function public.board_lista_encerra(p_titulo text)
returns boolean language sql immutable as $$
  select lower(btrim(coalesce(p_titulo, ''))) in ('finalizado', 'finalizada', 'finalizados')
$$;

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
    -- reabriu ou voltou para uma coluna de trabalho: a contagem morre aqui
    new.encerrado_em := null;
  end if;

  return new;
end $$;

drop trigger if exists board_cards_encerramento on public.board_cards;
create trigger board_cards_encerramento
  before insert or update on public.board_cards
  for each row execute function public.tg_board_cards_encerramento();

-- ----------------------------------------------------------------------------
--  Backfill do que já está encerrado
-- ----------------------------------------------------------------------------
--  O histórico guarda os dois marcos: `kind='status'` (created_at = quando
--  fechou, porque a linha é apagada e reinserida a cada mudança de estado) e
--  `kind='event'` com "moveu para ..." (created_at do último movimento, que é o
--  que colocou o cartão na coluna onde ele está).
--
--  Fica o MAIS RECENTE dos dois de propósito. Os dois marcos costumam vir com
--  dias de diferença e não dá para reconstruir reaberturas antigas; na dúvida,
--  o cartão fica visível por mais tempo — sumir cedo demais do quadro de um
--  escritório de advocacia é o erro caro aqui.
with marco as (
  select c.id,
         greatest(
           (select max(b.created_at) from public.board_activity b
             where b.card_id = c.id and b.kind = 'status'),
           (select max(b.created_at) from public.board_activity b
             where b.card_id = c.id and b.kind = 'event' and b.text ilike 'moveu para%')
         ) as quando,
         c.created_at
    from public.board_cards c
    join public.board_lists l on l.id = c.list_id
   where c.encerrado_em is null
     and (c.completed or public.board_lista_encerra(l.title))
)
update public.board_cards c
   set encerrado_em = coalesce(m.quando, m.created_at, now())
  from marco m
 where m.id = c.id;

select count(*) filter (where encerrado_em is not null)              as encerradas,
       count(*) filter (where encerrado_em < now() - interval '45 days') as ja_fora_do_quadro
  from public.board_cards;
