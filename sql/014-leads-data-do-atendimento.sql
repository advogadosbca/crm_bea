-- ============================================================================
--  Leads: coluna "Data do atendimento" (data + hora)
-- ============================================================================
--  COMO RODAR: `docker exec -i supabase-db psql -U postgres` na VPS. Idempotente.
--
--  A sub-aba Atendimentos da Geral (painel de controle de leads) mede o funil
--  pela data em que o atendimento foi marcado: é ela que separa quem já devia
--  ter vindo (e está sem baixa) de quem ainda vai vir. "Data Contato" é outra
--  coisa — quando o lead chegou — e continua como está.
--
--  Só ACRESCENTA a coluna, na posição 9 (vaga entre Situação e Contrato
--  Assinado: nenhuma coluna muda de lugar). Nenhuma linha é alterada. Quem lê
--  a fonte Leads acha as colunas pelo nome (API da Sofia, promover lead,
--  Quadro de Tarefas), então nada depende de posição.
-- ============================================================================

insert into public.db_columns (table_id, name, type, config, position)
select t.id, 'Data do atendimento', 'date', '{"withTime": true}'::jsonb, 9
  from public.db_tables t
 where t.module_key = 'fonte-leads'
   and not exists (
     select 1 from public.db_columns c
      where c.table_id = t.id and lower(trim(c.name)) = 'data do atendimento'
   );
