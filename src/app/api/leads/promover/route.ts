import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { chaveTelefone } from '@/lib/telefone'

/**
 * Promove um lead a cliente: cria (ou vincula) o registro na fonte Clientes e
 * grava o vínculo na coluna de relação "Contato" do lead.
 *
 * Disparado quando a checkbox "Contrato Assinado" é marcada. A regra mora aqui,
 * no servidor, e não numa trigger de banco, porque o próximo passo previsto
 * (abrir checklist no Quadro de Tarefas conforme a área do cliente) mexe em
 * board_cards/board_activity com JSON — inviável de manter em PL/pgSQL.
 *
 * É idempotente: se o lead já aponta para um cliente, não faz nada. Isso cobre
 * desmarcar e remarcar a caixa.
 */

const GATILHO = 'Contrato Assinado'

// Leads -> Clientes, por nome de coluna (os ids são resolvidos em tempo de execução)
const MAPA: { de: string; para: string }[] = [
  { de: 'Nome', para: 'Nome' },
  { de: 'Telefone', para: 'Telefone' },
  { de: 'Origem', para: 'Origem' },
  { de: 'Responsável', para: 'Responsável' },
  { de: 'Observação', para: 'Observação' },
  { de: 'Total Transações', para: 'Transações' },
  { de: 'Data da Assinatura', para: 'Data do Contrato' },
]

// as duas tabelas não têm as mesmas opções de Origem
const ORIGEM: Record<string, string> = {
  'Instagram': 'Marketing', 'Facebook': 'Marketing', 'Site': 'Marketing',
  'Prospecção': 'Outro',
  'Indicação': 'Indicação', 'Já é cliente': 'Já é cliente',
}

type Opcao = { id: string; label: string }
type Coluna = { id: string; name: string; type: string; config: Record<string, unknown> }
type Linha = { id: string; table_id: string; data: Record<string, unknown> }

const SELECAO = ['select', 'status', 'multi_select']
const opcoes = (c: Coluna): Opcao[] => (c.config?.options as Opcao[] | undefined) || []

/** valor de seleção é guardado como id da opção — devolve o rótulo legível */
const rotuloDe = (c: Coluna, v: unknown): string => {
  const o = opcoes(c).find(x => x.id === v || x.label === v)
  return o?.label ?? String(v ?? '')
}
/** caminho inverso: rótulo -> id da opção na coluna de destino */
const idDaOpcao = (c: Coluna, label: string): string | null =>
  opcoes(c).find(x => x.label === label)?.id ?? null


export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { rowId } = await req.json()
  if (!rowId) return NextResponse.json({ error: 'rowId ausente' }, { status: 400 })

  // 1. lead + confirmação de que é mesmo a fonte de leads
  const { data: lead } = await supabase.from('db_rows').select('id, table_id, data').eq('id', rowId).single<Linha>()
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const { data: tabelas } = await supabase.from('db_tables').select('id, module_key')
    .in('module_key', ['fonte-leads', 'fonte-contatos'])
  const tLeads = (tabelas || []).find(t => t.module_key === 'fonte-leads')
  const tClientes = (tabelas || []).find(t => t.module_key === 'fonte-contatos')
  if (!tLeads || !tClientes) return NextResponse.json({ error: 'Fontes não provisionadas' }, { status: 500 })
  if (lead.table_id !== tLeads.id) return NextResponse.json({ status: 'ignorado' })

  const { data: colunas } = await supabase.from('db_columns').select('id, name, type, config, table_id')
    .in('table_id', [tLeads.id, tClientes.id])
  const todas = (colunas || []) as (Coluna & { table_id: string })[]
  const colsLead = todas.filter(c => c.table_id === tLeads.id)
  const colsCli = todas.filter(c => c.table_id === tClientes.id)

  const acharLead = (nome: string) => colsLead.find(c => c.name === nome)
  const acharCli = (nome: string) => colsCli.find(c => c.name === nome)

  // 2. o gatilho precisa estar marcado
  const gatilho = acharLead(GATILHO)
  if (!gatilho || lead.data[gatilho.id] !== true) return NextResponse.json({ status: 'ignorado' })

  // 3. já promovido? a relação "Contato" é a marca de que virou cliente
  const relacao = colsLead.find(c => c.type === 'relation' && c.config?.sourceTableId === tClientes.id)
  if (!relacao) return NextResponse.json({ error: 'Lead sem coluna de relação com Clientes' }, { status: 500 })
  const atual = lead.data[relacao.id]
  const jaTem = Array.isArray(atual) ? atual.length > 0 : !!atual
  if (jaTem) return NextResponse.json({ status: 'ja_vinculado' })

  // 4. mesmo telefone de um cliente que já existe? vincula em vez de duplicar
  const colTelLead = acharLead('Telefone')
  const colTelCli = acharCli('Telefone')
  const colNomeCli = acharCli('Nome')
  const chave = colTelLead ? chaveTelefone(lead.data[colTelLead.id]) : null

  let clienteId: string | null = null
  let nomeCliente = ''
  let status: 'vinculado' | 'criado' = 'criado'
  let ambiguo = false

  if (chave && colTelCli) {
    // ordenado por criação: a base tem telefones repetidos entre clientes, então
    // a escolha precisa ser estável e o usuário precisa ser avisado do empate
    const { data: clientes } = await supabase.from('db_rows').select('id, data, created_at')
      .eq('table_id', tClientes.id).order('created_at', { ascending: true })
    const achados = (clientes || []).filter(c => chaveTelefone((c.data as Record<string, unknown>)[colTelCli.id]) === chave)
    if (achados.length) {
      clienteId = achados[0].id
      nomeCliente = colNomeCli ? String((achados[0].data as Record<string, unknown>)[colNomeCli.id] ?? '') : ''
      status = 'vinculado'
      ambiguo = achados.length > 1
    }
  }

  // 5. não achou: cria o cliente com os campos mapeados
  if (!clienteId) {
    const novo: Record<string, unknown> = {}
    for (const { de, para } of MAPA) {
      const cd = acharLead(de), cp = acharCli(para)
      if (!cd || !cp) continue
      const v = lead.data[cd.id]
      if (v === undefined || v === null || v === '') continue

      const origemEhSelecao = SELECAO.includes(cd.type)
      const destinoEhSelecao = SELECAO.includes(cp.type)

      if (destinoEhSelecao) {
        // precisa gravar o id da opção equivalente no destino
        let label = origemEhSelecao ? rotuloDe(cd, v) : String(v)
        if (para === 'Origem') {
          const traduzido = ORIGEM[label]
          if (!traduzido) continue // origem sem correspondente: deixa em branco
          label = traduzido
        }
        const idDestino = idDaOpcao(cp, label)
        if (!idDestino) continue
        novo[cp.id] = idDestino
      } else if (origemEhSelecao) {
        // seleção -> texto: grava o rótulo, senão apareceria o UUID da opção
        novo[cp.id] = rotuloDe(cd, v)
      } else {
        novo[cp.id] = v
      }
    }

    const { data: max } = await supabase.from('db_rows').select('position')
      .eq('table_id', tClientes.id).order('position', { ascending: false }).limit(1).maybeSingle()

    const { data: criado, error } = await supabase.from('db_rows').insert({
      table_id: tClientes.id, data: novo, position: (max?.position ?? -1) + 1,
      created_by: user.id, updated_by: user.id,
    }).select('id').single()
    if (error || !criado) return NextResponse.json({ error: error?.message || 'Falha ao criar cliente' }, { status: 400 })

    clienteId = criado.id
    nomeCliente = colNomeCli ? String(novo[colNomeCli.id] ?? '') : ''
  }

  // 6. grava o vínculo no lead
  const dataAtualizada = { ...lead.data, [relacao.id]: [clienteId] }
  const { error: errLink } = await supabase.from('db_rows')
    .update({ data: dataAtualizada, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', lead.id)
  if (errLink) return NextResponse.json({ error: errLink.message }, { status: 400 })

  return NextResponse.json({ status, clienteId, nome: nomeCliente, ambiguo })
}
