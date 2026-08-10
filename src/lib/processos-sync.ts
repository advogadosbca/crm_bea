import type { SupabaseClient } from '@supabase/supabase-js'

/** Colunas da fonte "Processos Judiciais" usadas pela sincronização com o DataJud. */
export type ColsProcessos = {
  tableId: string
  numero: string
  movimento?: string
  dataMovimento?: string
  consultadoEm?: string
}

export const textoDe = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** Resolve os ids das colunas pelo nome, para o n8n nunca precisar conhecer UUID. */
export async function colunasProcessos(admin: SupabaseClient, workspaceId: string): Promise<ColsProcessos | null> {
  const { data: tabela } = await admin.from('db_tables').select('id')
    .eq('workspace_id', workspaceId).eq('module_key', 'processos').maybeSingle()
  if (!tabela) return null

  const { data: cols } = await admin.from('db_columns').select('id, name').eq('table_id', tabela.id)
  const id = (nome: string) => (cols || []).find(c => c.name === nome)?.id as string | undefined

  const numero = id('Processo')
  if (!numero) return null

  return {
    tableId: tabela.id,
    numero,
    movimento: id('Atualização JusBR'),
    dataMovimento: id('Data da movimentação'),
    consultadoEm: id('Consultado em'),
  }
}

/**
 * Monta o texto legível de uma movimentação do DataJud.
 * O `nome` sozinho costuma ser vago ("Documento"); o sentido está no complemento
 * ("convertido em diligência"), então os dois são juntados.
 */
export function descreverMovimento(nome: unknown, complementos: unknown): string {
  const base = textoDe(nome).trim()
  const extras = Array.isArray(complementos)
    ? complementos.map(c => textoDe((c as Record<string, unknown>)?.nome).trim()).filter(Boolean)
    : []
  return extras.length ? `${base} — ${extras.join(', ')}` : base
}

/** só a parte da data (YYYY-MM-DD), que é o formato das colunas de data do sistema */
export const soData = (iso: unknown): string => textoDe(iso).split('T')[0]

/** dígitos do número CNJ, para comparar formatos diferentes do mesmo processo */
export const soDigitos = (v: unknown): string => textoDe(v).replace(/\D/g, '')
