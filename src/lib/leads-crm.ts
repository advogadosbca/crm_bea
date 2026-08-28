import type { SupabaseClient } from '@supabase/supabase-js'
import { chaveTelefone, formatarTelefoneBr } from './telefone'

/**
 * Peças comuns das rotas de lead do WhatsApp (consulta, criar, atendimento).
 *
 * Ficam aqui porque as três precisam resolver as mesmas coisas: qual é a fonte
 * Leads, qual é a coluna "Telefone", qual é o id da opção "Em Atendimento". As
 * colunas são achadas pelo NOME em tempo de execução — se fossem UUID fixo,
 * recriar uma coluna pela tela quebraria as rotas em silêncio.
 */

export const EM_ATENDIMENTO = 'Em Atendimento'
export const STATUS_INICIAL = 'Primeiro Contato'

export type Coluna = { id: string; name: string; type: string; config: { options?: { id: string; label: string }[] } }
export type Linha = { id: string; data: Record<string, unknown> }

/** rótulo -> id da opção; seleção guarda o id, o rótulo apareceria como texto solto */
export const idDaOpcao = (c: Coluna | undefined, label: string): string | null =>
  (c?.config?.options || []).find(o => o.label.trim().toLowerCase() === label.toLowerCase())?.id ?? null

/** true quando a célula de seleção aponta para a opção informada (aceita id ou rótulo) */
export function temOpcao(col: Coluna | undefined, valor: unknown, label: string): boolean {
  if (!col || valor === null || valor === undefined || valor === '') return false
  const alvos = Array.isArray(valor) ? valor.map(String) : [String(valor)]
  const opt = (col.config?.options || []).find(o => o.label.trim().toLowerCase() === label.toLowerCase())
  return alvos.some(v => v === opt?.id || v.trim().toLowerCase() === label.toLowerCase())
}

/**
 * Nome que vai para o cadastro.
 *
 * O WhatsApp manda o `senderName` (o nome escolhido no aparelho), mas quem não
 * tem um definido chega com o próprio número — e o funil ficaria com
 * "553798705013" no campo Nome, destoando do resto da lista. Sem nome
 * utilizável, grava o telefone formatado, que ao menos é legível.
 */
export function nomeParaCadastro(nome: string, telefone: string): string {
  const limpo = nome.trim()
  const soDigitos = limpo.replace(/\D/g, '')
  const pareceNumero = limpo.length > 0 && soDigitos.length >= 8 && soDigitos.length === limpo.replace(/[\s()+-]/g, '').length
  return !limpo || pareceNumero ? formatarTelefoneBr(telefone) : limpo
}

export interface ContextoLeads {
  leadsId: string
  clientesId: string
  colLead: (nome: string) => Coluna | undefined
  colCli: (nome: string) => Coluna | undefined
}

/** resolve as duas fontes e suas colunas; null quando o workspace não tem as fontes */
export async function contextoLeads(admin: SupabaseClient, workspaceId: string): Promise<ContextoLeads | null> {
  const { data: tabelas } = await admin.from('db_tables').select('id, module_key')
    .eq('workspace_id', workspaceId).in('module_key', ['fonte-leads', 'fonte-contatos'])
  const tLeads = (tabelas || []).find(t => t.module_key === 'fonte-leads')
  const tClientes = (tabelas || []).find(t => t.module_key === 'fonte-contatos')
  if (!tLeads || !tClientes) return null

  const { data: colunas } = await admin.from('db_columns').select('id, table_id, name, type, config')
    .in('table_id', [tLeads.id, tClientes.id])
  const todas = (colunas || []) as (Coluna & { table_id: string })[]
  const busca = (tableId: string) => (nome: string) =>
    todas.find(c => c.table_id === tableId && c.name.trim().toLowerCase() === nome.trim().toLowerCase())

  return { leadsId: tLeads.id, clientesId: tClientes.id, colLead: busca(tLeads.id), colCli: busca(tClientes.id) }
}

/**
 * Acha a linha cujo telefone é o mesmo, comparando por `chaveTelefone`.
 *
 * Varre em memória de propósito: o telefone mora dentro do JSONB `data` e vem
 * escrito de todo jeito na base ("(37) 9 9104-6607", "37 99944-0452 (Gilmar)"),
 * então filtro por igualdade no PostgREST daria falso negativo quase sempre.
 * São centenas de linhas, não milhões.
 */
export async function acharPorTelefone(
  admin: SupabaseClient, tableId: string, colTelefone: Coluna | undefined, telefone: string,
): Promise<Linha | null> {
  const chave = chaveTelefone(telefone)
  if (!chave || !colTelefone) return null
  const { data } = await admin.from('db_rows').select('id, data')
    .eq('table_id', tableId).order('created_at', { ascending: true }).limit(100000)
  return ((data || []) as Linha[]).find(r => chaveTelefone(r.data[colTelefone.id]) === chave) || null
}

/** rótulo legível de uma célula de seleção (a linha guarda o id da opção) */
export function rotuloDaOpcao(col: Coluna | undefined, valor: unknown): string | null {
  if (!col) return null
  const o = (col.config?.options || []).find(x => x.id === valor || x.label === valor)
  return o?.label || (typeof valor === 'string' && valor ? valor : null)
}
