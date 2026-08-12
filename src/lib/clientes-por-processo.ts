import type { SupabaseClient } from '@supabase/supabase-js'
import { cnjsDaCelula, textoDe } from './processos-sync'

/**
 * Resolve o cliente de cada processo: CNJ -> { nome, telefone }.
 *
 * O caminho é fonte "Processos Judiciais" -> coluna `Cliente` (relation) ->
 * fonte "Clientes" -> colunas `Nome` e `Telefone`. Nada disso é gravado em
 * `comunicacoes`: o dado é resolvido na hora. Congelar nome e telefone junto da
 * comunicação deixaria a tela mostrando telefone velho depois que alguém
 * corrigisse o cadastro — e telefone velho é mensagem indo para o número errado.
 *
 * Aceita tanto o client com sessão do usuário (respeitando RLS) quanto o
 * admin — a página usa o primeiro, a rota de aprovação usa o segundo.
 */
export interface ClienteDoProcesso {
  processoRowId: string
  clienteRowId: string | null
  nome: string
  telefone: string
}

export type MapaClientes = Record<string, ClienteDoProcesso>

export async function clientesPorProcesso(
  sb: SupabaseClient, workspaceId: string, cnjsDesejados?: string[],
): Promise<MapaClientes> {
  const mapa: MapaClientes = {}

  const { data: tabela } = await sb.from('db_tables').select('id')
    .eq('workspace_id', workspaceId).eq('module_key', 'processos').maybeSingle()
  if (!tabela) return mapa

  const { data: cols } = await sb.from('db_columns')
    .select('id, name, type, config').eq('table_id', tabela.id)
  const colNumero = (cols || []).find(c => c.name === 'Processo')
  const colCliente = (cols || []).find(c => c.name === 'Cliente')
  if (!colNumero) return mapa

  const { data: linhas } = await sb.from('db_rows')
    .select('id, data').eq('table_id', tabela.id).limit(100000)

  const querido = cnjsDesejados?.length ? new Set(cnjsDesejados) : null

  // 1ª passada: liga CNJ -> linha do processo e junta os ids de cliente a buscar
  const idsCliente = new Set<string>()
  const pendente: { cnj: string; processoRowId: string; clienteRowId: string | null }[] = []

  for (const l of linhas || []) {
    const dados = l.data as Record<string, unknown>
    const cnjs = cnjsDaCelula(dados[colNumero.id])
    if (!cnjs.length) continue

    const ref = colCliente ? dados[colCliente.id] : null
    const ids = Array.isArray(ref) ? ref.map(String) : ref ? [String(ref)] : []
    const clienteRowId = ids[0] || null

    for (const cnj of cnjs) {
      if (querido && !querido.has(cnj)) continue
      pendente.push({ cnj, processoRowId: l.id as string, clienteRowId })
      if (clienteRowId) idsCliente.add(clienteRowId)
    }
  }
  if (!pendente.length) return mapa

  // 2ª passada: busca só os clientes realmente referenciados. Puxar a fonte
  // inteira aqui seria desperdício — a caixa costuma ter dezenas de processos,
  // não centenas de clientes.
  const dadosCliente = new Map<string, { nome: string; telefone: string }>()
  if (idsCliente.size && colCliente) {
    const fonteId = (colCliente.config as { sourceTableId?: string })?.sourceTableId
    if (fonteId) {
      const { data: colsCli } = await sb.from('db_columns')
        .select('id, name').eq('table_id', fonteId)
      const colNome = (colsCli || []).find(c => c.name === 'Nome')
      const colTel = (colsCli || []).find(c => c.name === 'Telefone')

      const { data: linhasCli } = await sb.from('db_rows')
        .select('id, data').in('id', [...idsCliente])

      for (const c of linhasCli || []) {
        const d = c.data as Record<string, unknown>
        dadosCliente.set(c.id as string, {
          nome: colNome ? textoDe(d[colNome.id]).trim() : '',
          telefone: colTel ? textoDe(d[colTel.id]).trim() : '',
        })
      }
    }
  }

  for (const p of pendente) {
    const c = p.clienteRowId ? dadosCliente.get(p.clienteRowId) : undefined
    mapa[p.cnj] = {
      processoRowId: p.processoRowId,
      clienteRowId: p.clienteRowId,
      nome: c?.nome || '',
      telefone: c?.telefone || '',
    }
  }
  return mapa
}

/** Só os dígitos, com o 55 do Brasil na frente — formato que o WhatsApp espera. */
export function telefoneE164(bruto: string): string {
  const d = textoDe(bruto).replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}
