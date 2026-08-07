-- ============================================================================
--  Auditoria (o que foi adicionado / excluído) + exclusão restrita a admins
-- ============================================================================
--  COMO RODAR: cole este arquivo inteiro no SQL Editor do Supabase self-hosted
--  (api-crm.bernardeseazevedo.com.br) e execute. É idempotente — pode rodar de
--  novo quantas vezes quiser. No fim há uma consulta de verificação.
--
--  Por que no banco e não só no app: vale para QUALQUER caminho (interface,
--  script .mjs, chamada direta na API REST). Regra só no front-end é contornável.
--
--  DECISÃO IMPORTANTE — a trava de exclusão é uma TRIGGER BEFORE DELETE, não
--  apenas RLS. Motivos:
--    1. Nem toda tabela nova (db_*, board_*) tem RLS ligada. Ligar RLS numa
--       tabela sem política permissiva TRANCA TODO MUNDO FORA. Este script
--       nunca liga RLS onde ela está desligada.
--    2. RLS nega DELETE em silêncio (apaga 0 linhas, sem erro). A trigger dá
--       uma mensagem clara para o usuário.
--  Onde a RLS já está ligada, também é criada uma política RESTRICTIVE de
--  DELETE como segunda camada. RESTRICTIVE só TIRA permissão (faz AND com as
--  políticas existentes), então não altera o acesso atual de ninguém.
--
--  Quem continua podendo excluir: admin, super_admin e o service_role (scripts
--  de manutenção e rotas de API do servidor, onde auth.uid() é nulo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Funções auxiliares (SECURITY DEFINER para não recursar na RLS de profiles)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_role() RETURNS TEXT
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_workspace_id() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'super_admin') FROM public.profiles WHERE id = auth.uid()),
    FALSE
  )
$$;

-- ----------------------------------------------------------------------------
-- 2. audit_logs: rótulo legível + contexto (nome da fonte/tabela de origem)
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_label TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS context TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_ws_created_idx
  ON public.audit_logs (workspace_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Trava de exclusão (BEFORE DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_exclusao_nao_admin() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() nulo = service_role / script de manutenção: continua liberado.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem excluir registros.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Registro de auditoria (AFTER INSERT OR DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_auditoria() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec JSONB;
  ws  UUID;
  uid UUID;
  lbl TEXT;
  ctx TEXT;
  tid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;

  -- workspace: direto na linha, ou herdado da fonte de dados (tabelas db_*)
  ws  := NULLIF(rec->>'workspace_id', '')::UUID;
  tid := NULLIF(rec->>'table_id', '')::UUID;
  IF ws IS NULL AND tid IS NOT NULL THEN
    SELECT t.workspace_id, t.name INTO ws, ctx FROM public.db_tables t WHERE t.id = tid;

    -- sem tabela-pai = exclusão em cascata de uma fonte inteira. O log da fonte
    -- já cobre o evento; não repete milhares de linhas filhas.
    IF ctx IS NULL AND TG_OP = 'DELETE' THEN RETURN NULL; END IF;
  END IF;

  -- rótulo legível do registro
  IF TG_TABLE_NAME = 'db_rows' THEN
    SELECT NULLIF(rec->'data'->>(c.id::TEXT), '') INTO lbl
      FROM public.db_columns c
     WHERE c.table_id = tid
       AND c.type IN ('text', 'select', 'status', 'email', 'phone', 'url')
       AND NULLIF(rec->'data'->>(c.id::TEXT), '') IS NOT NULL
     ORDER BY c.position
     LIMIT 1;
  ELSE
    lbl := COALESCE(
      NULLIF(rec->>'name', ''), NULLIF(rec->>'title', ''), NULLIF(rec->>'titulo', ''),
      NULLIF(rec->>'label', ''), NULLIF(rec->>'numero', ''), NULLIF(rec->>'descricao', '')
    );
  END IF;

  IF ctx IS NULL THEN ctx := TG_TABLE_NAME; END IF;

  -- user_id só se o perfil existir (há FK); service_role fica sem autor
  uid := auth.uid();
  IF uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid) THEN
    uid := NULL;
  END IF;

  INSERT INTO public.audit_logs (workspace_id, user_id, action, table_name, record_id,
                                 old_data, new_data, record_label, context)
  VALUES (
    ws, uid,
    CASE TG_OP WHEN 'INSERT' THEN 'criou' ELSE 'excluiu' END,
    TG_TABLE_NAME,
    NULLIF(rec->>'id', '')::UUID,
    CASE WHEN TG_OP = 'DELETE' THEN rec ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' THEN rec ELSE NULL END,
    LEFT(COALESCE(lbl, '(sem título)'), 300),
    ctx
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- auditoria nunca pode derrubar a operação real do usuário
  RAISE WARNING 'auditoria falhou em % (%): %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Aplica nas tabelas de conteúdo
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t        TEXT;
  rls_on   BOOLEAN;
  permissivas INT;
  alvos TEXT[] := ARRAY[
    'db_tables', 'db_columns', 'db_rows', 'db_views',
    'contacts', 'processos', 'audiencias', 'alvaras', 'acoes_coletivas', 'transacoes',
    'board_cards', 'board_lists', 'kanban_columns'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
      RAISE NOTICE 'tabela % não existe — pulando', t;
      CONTINUE;
    END IF;

    -- 5a. trava de exclusão (vale com ou sem RLS, e dá mensagem de erro clara)
    EXECUTE format('DROP TRIGGER IF EXISTS trg_bloqueia_exclusao ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_bloqueia_exclusao BEFORE DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.bloquear_exclusao_nao_admin()', t);

    -- 5b. auditoria
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_auditoria AFTER INSERT OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria()', t);

    -- 5c. segunda camada em RLS — SOMENTE onde a RLS já está ligada e já existe
    --     política permissiva. Ligar RLS aqui trancaria o sistema inteiro.
    SELECT c.relrowsecurity INTO rls_on
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t;

    SELECT count(*) INTO permissivas
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = t AND p.permissive = 'PERMISSIVE';

    IF rls_on AND permissivas > 0 THEN
      EXECUTE format('DROP POLICY IF EXISTS somente_admin_exclui ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY somente_admin_exclui ON public.%I
           AS RESTRICTIVE FOR DELETE USING (public.is_admin())', t);
    ELSE
      RAISE NOTICE '% sem RLS/política permissiva — protegida só pela trigger', t;
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. audit_logs: leitura só de admin; ninguém edita o log pelo cliente
-- ----------------------------------------------------------------------------
-- Aqui ligar RLS é seguro: a tabela nunca foi usada pelo app e ganha política
-- permissiva de leitura logo abaixo.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_le ON public.audit_logs;
CREATE POLICY audit_logs_admin_le ON public.audit_logs FOR SELECT
  USING (workspace_id = public.my_workspace_id() AND public.is_admin());

-- RESTRICTIVE: fecha o log mesmo que exista outra política permissiva antiga
-- com nome que este script desconhece.
DROP POLICY IF EXISTS audit_logs_so_admin ON public.audit_logs;
CREATE POLICY audit_logs_so_admin ON public.audit_logs
  AS RESTRICTIVE FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS audit_logs_sem_insert ON public.audit_logs;
CREATE POLICY audit_logs_sem_insert ON public.audit_logs
  AS RESTRICTIVE FOR INSERT WITH CHECK (FALSE);

DROP POLICY IF EXISTS audit_logs_sem_update ON public.audit_logs;
CREATE POLICY audit_logs_sem_update ON public.audit_logs
  AS RESTRICTIVE FOR UPDATE USING (FALSE);

DROP POLICY IF EXISTS audit_logs_sem_delete ON public.audit_logs;
CREATE POLICY audit_logs_sem_delete ON public.audit_logs
  AS RESTRICTIVE FOR DELETE USING (FALSE);
-- A trigger escreve mesmo assim: é SECURITY DEFINER e roda como dona da tabela.

-- ============================================================================
--  VERIFICAÇÃO — rode junto e confira o resultado
-- ============================================================================
-- Deve listar 13 linhas, cada uma com as duas triggers (bloqueio + auditoria).
SELECT c.relname                                   AS tabela,
       bool_or(t.tgname = 'trg_bloqueia_exclusao') AS trava_exclusao,
       bool_or(t.tgname = 'trg_auditoria')         AS auditoria,
       c.relrowsecurity                            AS rls_ligada,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname
           AND p.policyname = 'somente_admin_exclui')  AS politica_delete
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_trigger  t ON t.tgrelid = c.oid AND NOT t.tgisinternal
 WHERE n.nspname = 'public'
   AND c.relname IN ('db_tables','db_columns','db_rows','db_views','contacts','processos',
                     'audiencias','alvaras','acoes_coletivas','transacoes','board_cards',
                     'board_lists','kanban_columns')
 GROUP BY c.relname, c.relrowsecurity
 ORDER BY c.relname;
