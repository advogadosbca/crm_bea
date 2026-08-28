import { authApiKey, unauthorized } from '@/lib/api-auth'
import { textoDe } from '@/lib/processos-sync'
import { chaveTelefone } from '@/lib/telefone'

/**
 * POST /api/v1/processos/consulta — processos de uma pessoa.
 *
 * É a tool que a Sofia usa quando o cliente pergunta do processo dele. Devolve
 * pronto para leitura: número, tribunal, área e a última atualização escrita
 * pelo escritório — nada de UUID de coluna ou id de linha do lado do n8n.
 *
 * DUAS BUSCAS, EM CASCATA E NÃO EM UNIÃO
 *  1. CPF, quando informado. É o identificador certo: pertence à pessoa, não ao
 *     aparelho.
 *  2. Telefone, só se o CPF não achou nada (ou se não veio CPF). O número já
 *     chega do webhook, então não custa nada ao cliente.
 *
 * A cascata é de propósito. Somando os dois, um CPF que não bate voltaria com os
 * processos do dono do celular — e celular de família é comum. Assim, quando o
 * CPF acha, é dele que a resposta sai; `buscaPor` diz qual caminho respondeu,
 * para a Sofia saber que caiu no telefone e tratar com cuidado.
 *
 * POR QUE O TELEFONE EXISTE COMO SAÍDA: de 423 processos, 349 têm CPF na própria
 * linha, mas só 21 dos 365 clientes têm CPF cadastrado. Por telefone, 301 dos
 * 321 clientes com número acham ao menos um processo.
 *
 * { cpf?, telefone? } -> { total, ativos, buscaPor, cpfNaoLocalizado, processos }
 */

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

type Linha = { id: string; data: Record<string, unknown>; arquivado_em?: string | null }
type Opcao = { id: string; label: string }
type Coluna = { id: string; table_id: string; name: string; type: string; config?: { sourceTableId?: string; options?: Opcao[] } }

export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const cpf = soDigitos(body.cpf)
  const telefone = String(body.telefone || '').trim()
  const chaveTel = chaveTelefone(telefone)
  const cpfValido = cpf.length === 11 || cpf.length === 14

  if (!cpfValido && !chaveTel) {
    return Response.json({ error: 'Informe cpf (11 ou 14 dígitos) e/ou telefone.' }, { status: 400 })
  }

  const { data: tabelas } = await admin.from('db_tables').select('id, module_key')
    .eq('workspace_id', workspaceId).in('module_key', ['processos', 'fonte-contatos'])
  const tProc = (tabelas || []).find(t => t.module_key === 'processos')
  const tCli = (tabelas || []).find(t => t.module_key === 'fonte-contatos')
  if (!tProc) return Response.json({ error: 'Fonte "Processos Judiciais" não encontrada.' }, { status: 404 })

  const { data: cols } = await admin.from('db_columns').select('id, table_id, name, type, config')
    .in('table_id', [tProc.id, tCli?.id].filter(Boolean) as string[])
  const todas = (cols || []) as Coluna[]
  const col = (tableId: string | undefined, ...nomes: string[]) =>
    nomes.map(n => todas.find(c => c.table_id === tableId && c.name.trim().toLowerCase() === n.toLowerCase())).find(Boolean)

  const cNumero = col(tProc.id, 'Processo')
  const cCpfProc = col(tProc.id, 'CPF/CNPJ', 'CPF / CNPJ')
  const cTribunal = col(tProc.id, 'Tribunal')
  const cArea = col(tProc.id, 'Área')
  const cAtualizacao = col(tProc.id, 'Atualização')
  const cDataMov = col(tProc.id, 'Data da movimentação')
  const cTramitacao = col(tProc.id, 'Tramitação')
  const cRelCliente = todas.find(c => c.table_id === tProc.id && c.type === 'relation' && c.config?.sourceTableId)

  // ---------- clientes de cada identificador, separados ----------
  const clientesDoCpf = new Set<string>()
  const clientesDoTelefone = new Set<string>()
  const nomePorCliente = new Map<string, string>()
  if (tCli) {
    const cCpfCli = col(tCli.id, 'CPF / CNPJ', 'CPF/CNPJ')
    const cNomeCli = col(tCli.id, 'Nome')
    const cTelCli = col(tCli.id, 'Telefone')
    const { data: clientes } = await admin.from('db_rows').select('id, data').eq('table_id', tCli.id).limit(100000)
    for (const c of (clientes || []) as Linha[]) {
      if (cNomeCli) nomePorCliente.set(c.id, String(c.data[cNomeCli.id] ?? ''))
      if (cpfValido && cCpfCli && soDigitos(c.data[cCpfCli.id]) === cpf) clientesDoCpf.add(c.id)
      if (chaveTel && cTelCli && chaveTelefone(c.data[cTelCli.id]) === chaveTel) clientesDoTelefone.add(c.id)
    }
  }

  const { data: linhas } = await admin.from('db_rows').select('id, data, arquivado_em')
    .eq('table_id', tProc.id).order('position').limit(100000)
  const todasLinhas = (linhas || []) as Linha[]

  const clientesDaLinha = (r: Linha) =>
    cRelCliente && Array.isArray(r.data[cRelCliente.id]) ? (r.data[cRelCliente.id] as string[]) : []

  /** 1ª busca: CPF na própria linha do processo ou no cliente relacionado */
  const porCpf = () => !cpfValido ? [] : todasLinhas.filter(r =>
    (!!cCpfProc && soDigitos(r.data[cCpfProc.id]) === cpf) ||
    clientesDaLinha(r).some(id => clientesDoCpf.has(id)))

  /** 2ª busca: cliente daquele telefone */
  const porTelefone = () => !chaveTel ? [] : todasLinhas.filter(r =>
    clientesDaLinha(r).some(id => clientesDoTelefone.has(id)))

  let achadas = porCpf()
  let buscaPor: 'cpf' | 'telefone' | 'nenhum' = achadas.length ? 'cpf' : 'nenhum'
  if (!achadas.length) {
    achadas = porTelefone()
    if (achadas.length) buscaPor = 'telefone'
  }

  const processos = achadas.map(r => ({
    numero: cNumero ? textoDe(r.data[cNumero.id]) : '',
    cliente: clientesDaLinha(r).map(id => nomePorCliente.get(id)).filter(Boolean).join(', '),
    tribunal: rotulo(cTribunal, r.data[cTribunal?.id ?? '']),
    area: rotulo(cArea, r.data[cArea?.id ?? '']),
    tramitacao: cTramitacao ? textoDe(r.data[cTramitacao.id]) : '',
    ultimaAtualizacao: cAtualizacao ? textoDe(r.data[cAtualizacao.id]) : '',
    dataMovimentacao: cDataMov ? textoDe(r.data[cDataMov.id]) : '',
    arquivado: !!r.arquivado_em,
  })).filter(p => !!p.numero)

  return Response.json({
    total: processos.length,
    ativos: processos.filter(p => !p.arquivado).length,
    buscaPor,
    // avisa a Sofia que o CPF informado não bateu com nada: ou foi digitado
    // errado, ou o cadastro está incompleto. Se veio processo mesmo assim, veio
    // pelo dono do telefone, que pode não ser a mesma pessoa.
    cpfNaoLocalizado: cpfValido && buscaPor !== 'cpf',
    processos,
  })

  /** rótulo legível de uma célula de seleção (a linha guarda o id da opção) */
  function rotulo(c: Coluna | undefined, valor: unknown): string {
    if (!c) return ''
    const o = (c.config?.options || []).find(x => x.id === valor || x.label === valor)
    return o?.label || textoDe(valor)
  }
}
