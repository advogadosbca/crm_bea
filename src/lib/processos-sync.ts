import type { SupabaseClient } from '@supabase/supabase-js'

/** Colunas da fonte "Processos Judiciais" usadas pela sincronização com o DataJud. */
export type ColsProcessos = {
  tableId: string
  numero: string
  movimento?: string
  dataMovimento?: string
  consultadoEm?: string
  publicacao?: string
  dataPublicacao?: string
}

/** As duas fontes gratuitas escrevem em pares de colunas diferentes. */
export type Fonte = 'datajud' | 'djen'

export const CAMPOS_DA_FONTE: Record<Fonte, { texto: keyof ColsProcessos; data: keyof ColsProcessos }> = {
  datajud: { texto: 'movimento', data: 'dataMovimento' },
  djen: { texto: 'publicacao', data: 'dataPublicacao' },
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
    publicacao: id('Publicação (DJEN)'),
    dataPublicacao: id('Data da publicação'),
  }
}

/**
 * Texto do DJEN: tira HTML (7 de 24 publicações vinham com tags), normaliza
 * espaço e corta. A mediana é 211 caracteres, mas há publicação de 6.400 —
 * inteira não cabe numa célula de tabela, e o link para o documento fica junto.
 */
export function limparPublicacao(texto: unknown, limite = 600): string {
  const limpo = textoDe(texto)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo.length > limite ? limpo.slice(0, limite - 1).trimEnd() + '…' : limpo
}

/**
 * Monta o texto legível de uma movimentação do DataJud.
 * O `nome` sozinho costuma ser vago ("Documento"); o sentido está no complemento
 * ("convertido em diligência"), então os dois são juntados.
 */
export function descreverMovimento(nome: unknown, complementos: unknown, instancia?: unknown): string {
  const base = textoDe(nome).trim()
  const extras = Array.isArray(complementos)
    ? complementos.map(c => textoDe((c as Record<string, unknown>)?.nome).trim()).filter(Boolean)
    : []
  const texto = extras.length ? `${base} — ${extras.join(', ')}` : base

  // O mesmo processo pode ter andamento em 1ª e 2ª instância; sem dizer de onde
  // veio, "Outras Decisões" não informa nada.
  const inst = textoDe(instancia).trim()
  return inst ? `[${inst}] ${texto}` : texto
}

/** só a parte da data (YYYY-MM-DD), que é o formato das colunas de data do sistema */
export const soData = (iso: unknown): string => textoDe(iso).split('T')[0]

/** dígitos do número CNJ, para comparar formatos diferentes do mesmo processo */
export const soDigitos = (v: unknown): string => textoDe(v).replace(/\D/g, '')

// NNNNNNN-DD.AAAA.J.TR.OOOO, com ou sem pontuação
const RE_CNJ = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g

/**
 * Extrai os números CNJ de uma célula. O campo é texto livre e na prática vem
 * com anotação junto ("5000977-95.2025.8.13.0452 (TJMG - 1.0000.25.074486-9/001)")
 * ou com mais de um processo separado por "//". Exigir a célula inteira limpa
 * deixaria esses de fora.
 */
export function cnjsDaCelula(v: unknown): string[] {
  const achados = textoDe(v).match(RE_CNJ) || []
  return [...new Set(achados.map(soDigitos).filter(d => d.length === 20))]
}

/** o primeiro CNJ da célula, que é o processo principal daquela linha */
export const cnjPrincipal = (v: unknown): string => cnjsDaCelula(v)[0] || ''
