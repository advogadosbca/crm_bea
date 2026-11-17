import {
  type Cartao, type Contexto, type Fonte, type Retrato,
  acharColuna, acharFonte, camposPreenchidos, carregarQuadro, carregarRetrato, corta, dataBR, diaISO,
  hojeISO, linhaCartao, norm, quemApontaPara, soDigitos, titulo, valorCampo,
} from './dados'

/**
 * Ferramentas do conector do Claude. TODAS SÓ LEEM — nenhuma grava, altera ou
 * apaga. Cada uma devolve texto pronto para o Claude ler (markdown simples),
 * com os ids entre colchetes para ele poder abrir o registro depois.
 *
 * Para adicionar uma ferramenta: entra na lista FERRAMENTAS com nome, descrição
 * (é o que o Claude lê para decidir quando usar — escrever pensando nele) e
 * inputSchema; e um `case` em `executar`. Nada de escrita aqui.
 */

type Args = Record<string, unknown>

const LIMITE_TEXTO = 90_000

const somenteLeitura = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

export const FERRAMENTAS = [
  {
    name: 'panorama_escritorio',
    title: 'Panorama do escritório',
    description: 'Comece por aqui. Mostra como o escritório Bernardes & Azevedo está organizado no CRM: a equipe, todas as bases de dados (Clientes, Leads, Processos Judiciais, Pendências, Audiências, Financeiro etc.) com quantos registros têm e quais campos guardam, e as colunas do quadro de tarefas com quantas tarefas abertas há em cada uma. Use antes das outras ferramentas para saber os nomes exatos das bases e dos campos.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Panorama do escritório', ...somenteLeitura },
  },
  {
    name: 'buscar',
    title: 'Buscar no CRM',
    description: 'Busca um texto em todas as bases e nas tarefas: nome de cliente, CPF/CNPJ, telefone, número de processo (CNJ), assunto etc. Ignora acentos e maiúsculas; números são comparados só pelos dígitos (então "0001234-56.2024" acha "00012345620248130000"). Devolve onde achou, com o id para abrir em ver_registro ou ver_tarefa.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'O que procurar.' },
        base: { type: 'string', description: 'Opcional: limitar a uma base (ex.: "Clientes", "Processos Judiciais"). Use "tarefas" para buscar só no quadro.' },
        incluir_arquivados: { type: 'boolean', description: 'Incluir registros arquivados (processos encerrados etc.). Padrão: false.' },
        limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Máximo de resultados. Padrão: 25.' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
    annotations: { title: 'Buscar no CRM', ...somenteLeitura },
  },
  {
    name: 'listar_registros',
    title: 'Listar registros de uma base',
    description: 'Lista os registros de uma base do CRM (ex.: "Processos Judiciais", "Clientes", "Pendências Processuais", "Audiências"), com filtros por campo. Filtro = { "Nome do campo": "texto contido no valor" }; use "" para pegar os registros com o campo VAZIO (ex.: processos sem "Atualização"). Pagina os resultados; o total vem no topo.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Nome da base (veja panorama_escritorio).' },
        filtros: { type: 'object', additionalProperties: { type: 'string' }, description: 'Campo -> texto que o valor deve conter ("" = campo vazio).' },
        campos: { type: 'array', items: { type: 'string' }, description: 'Opcional: mostrar só estes campos (deixa a resposta menor).' },
        ordenar_por: { type: 'string', description: 'Opcional: campo para ordenar.' },
        ordem: { type: 'string', enum: ['asc', 'desc'], description: 'Padrão: asc.' },
        incluir_arquivados: { type: 'boolean', description: 'Padrão: false (só ativos).' },
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Registros por página. Padrão: 30.' },
        pagina: { type: 'integer', minimum: 1, description: 'Padrão: 1.' },
      },
      required: ['base'],
      additionalProperties: false,
    },
    annotations: { title: 'Listar registros de uma base', ...somenteLeitura },
  },
  {
    name: 'ver_registro',
    title: 'Ver um registro completo',
    description: 'Abre um registro pelo id (cliente, processo, pendência, audiência…) com todos os campos preenchidos, os comentários da equipe, os registros de outras bases ligados a ele (ex.: abrindo um cliente aparecem os processos, pendências e audiências dele) e as tarefas do quadro vinculadas. É a ficha completa — use para entender um caso antes de redigir uma peça ou um retorno ao cliente.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id do registro (vem entre colchetes nas outras ferramentas).' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { title: 'Ver um registro completo', ...somenteLeitura },
  },
  {
    name: 'listar_tarefas',
    title: 'Listar tarefas do quadro',
    description: 'Lista as tarefas do Quadro de Tarefas do escritório (o trabalho do dia a dia: peças, diligências, pós-venda). Filtra por situação, responsável, coluna do quadro, etiqueta, cliente, texto e vencimento. Ordena pelo vencimento mais próximo.',
    inputSchema: {
      type: 'object',
      properties: {
        situacao: { type: 'string', enum: ['abertas', 'encerradas', 'todas'], description: 'Padrão: abertas. Encerradas = concluídas, canceladas ou na coluna Finalizado.' },
        responsavel: { type: 'string', description: 'Nome (ou parte) de quem é responsável. "ninguem" = sem responsável.' },
        coluna: { type: 'string', description: 'Coluna do quadro (ex.: "A fazer", "Fazendo", "Aguardando").' },
        etiqueta: { type: 'string', description: 'Etiqueta (ex.: "alta prioridade", "Pós-venda").' },
        cliente_id: { type: 'string', description: 'Só tarefas vinculadas a este cliente.' },
        texto: { type: 'string', description: 'Texto no título ou na descrição.' },
        vence_ate: { type: 'string', description: 'Data AAAA-MM-DD: só tarefas que vencem até esse dia (inclui as vencidas).' },
        limite: { type: 'integer', minimum: 1, maximum: 300, description: 'Padrão: 60.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Listar tarefas do quadro', ...somenteLeitura },
  },
  {
    name: 'ver_tarefa',
    title: 'Ver uma tarefa completa',
    description: 'Abre uma tarefa do quadro pelo id: descrição, checklists (com o que já foi feito), comentários e histórico, anexos, responsáveis e clientes vinculados.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id da tarefa.' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { title: 'Ver uma tarefa completa', ...somenteLeitura },
  },
  {
    name: 'agenda_prazos',
    title: 'Agenda de prazos e audiências',
    description: 'Prazos, audiências e vencimentos num período, em ordem de data: datas das bases de Pendências e Audiências, campos de prazo/vencimento de qualquer base e o vencimento das tarefas abertas. Padrão: de hoje até 30 dias. Inclui os vencidos em aberto quando incluir_vencidos=true. As datas de prazo do CRM são sugestões conferidas pelo advogado — não recalcule prazo processual por conta própria.',
    inputSchema: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'AAAA-MM-DD. Padrão: hoje.' },
        ate: { type: 'string', description: 'AAAA-MM-DD. Padrão: hoje + 30 dias.' },
        incluir_vencidos: { type: 'boolean', description: 'Também listar o que venceu antes de "de" (últimos 60 dias). Padrão: false.' },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Agenda de prazos e audiências', ...somenteLeitura },
  },
] as const

export const NOMES_FERRAMENTAS: Set<string> = new Set(FERRAMENTAS.map(f => f.name))

/* ------------------------------------------------------------------ util */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const int = (v: unknown, padrao: number, min: number, max: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
const bool = (v: unknown) => v === true || v === 'true'

function limitar(texto: string): string {
  if (texto.length <= LIMITE_TEXTO) return texto
  return `${texto.slice(0, LIMITE_TEXTO)}\n\n…(resposta cortada por tamanho — use filtros, "campos" ou uma página menor)`
}

const fontesSemDados = (r: Retrato) => r.fontes.filter(f => f.columns.length)

/* ------------------------------------------------------------ ferramentas */

async function panorama(ctx: Contexto & { nome: string }): Promise<string> {
  const r = await carregarRetrato(ctx)
  const q = await carregarQuadro(ctx, r.pessoas)
  const out: string[] = []
  out.push(`# ${r.workspaceNome} — panorama do CRM`)
  out.push(`Consulta feita por: ${ctx.nome || 'sócio'} (acesso somente leitura). Hoje: ${dataBR(hojeISO())}.`)

  out.push(`\n## Equipe (${r.equipe.length})`)
  const papel: Record<string, string> = { super_admin: 'sócio/admin', admin: 'sócio/admin', colaborador: 'colaborador', visualizador: 'visualizador' }
  for (const p of r.equipe) out.push(`- ${p.nome} — ${papel[p.papel] || p.papel}`)

  out.push(`\n## Bases de dados (${r.fontes.length})`)
  for (const f of fontesSemDados(r)) {
    const ativos = f.rows.filter(x => !x.arquivado_em).length
    const arq = f.rows.length - ativos
    const campos = [...f.columns].sort((a, b) => a.position - b.position).map(c => {
      if (c.type === 'relation') {
        const alvo = r.fontes.find(x => x.id === c.config?.sourceTableId)
        return `${c.name} (→ ${alvo?.name || '?'})`
      }
      if (['select', 'status', 'multi_select'].includes(c.type) && c.config?.options?.length) {
        const ops = c.config.options.map(o => o.label)
        return `${c.name} (${corta(ops.join(' | '), 160)})`
      }
      return c.type === 'date' ? `${c.name} (data)` : c.name
    })
    out.push(`\n### ${f.name}\n${ativos} ativos${arq ? `, ${arq} arquivados` : ''}. Campos: ${campos.join('; ')}`)
  }

  out.push(`\n## Quadro de Tarefas`)
  const abertas = q.cartoes.filter(c => !c.encerrada && !c.arquivada)
  out.push(`${abertas.length} tarefas abertas no total.`)
  for (const l of q.listas) {
    const n = abertas.filter(c => c.lista === l.titulo).length
    out.push(`- ${l.titulo}: ${n} aberta(s)`)
  }
  const hoje = hojeISO()
  const vencidas = abertas.filter(c => c.vence && (diaISO(c.vence) || '') < hoje).length
  if (vencidas) out.push(`Atenção: ${vencidas} tarefa(s) aberta(s) com vencimento já passado.`)

  out.push(`\n## Como consultar`)
  out.push('- buscar: achar cliente/processo/tarefa por nome, CPF, telefone ou número CNJ.')
  out.push('- ver_registro: ficha completa (campos, comentários, registros ligados e tarefas).')
  out.push('- listar_registros: listar uma base com filtros (ex.: processos sem "Atualização").')
  out.push('- listar_tarefas / ver_tarefa: quadro de tarefas. agenda_prazos: prazos e audiências do período.')
  return out.join('\n')
}

async function buscar(ctx: Contexto, a: Args): Promise<string> {
  const texto = str(a.texto).trim()
  if (texto.length < 2) return 'Informe pelo menos 2 caracteres em "texto".'
  const limite = int(a.limite, 25, 1, 100)
  const comArq = bool(a.incluir_arquivados)
  const n = norm(texto)
  const dig = soDigitos(texto)
  const porDigito = dig.length >= 5 && dig.length >= texto.replace(/[\s.\-/()]/g, '').length * 0.7

  const r = await carregarRetrato(ctx)
  const baseNome = str(a.base).trim()
  const soTarefas = norm(baseNome) === 'tarefas'
  const fonteFiltro = baseNome && !soTarefas ? acharFonte(r, baseNome) : null
  if (baseNome && !soTarefas && !fonteFiltro) return `Base "${baseNome}" não encontrada. Bases: ${r.fontes.map(f => f.name).join(', ')}.`

  const achados: string[] = []
  let total = 0
  const confere = (valor: string) => (porDigito ? soDigitos(valor).includes(dig) : norm(valor).includes(n))

  if (!soTarefas) {
    for (const f of fonteFiltro ? [fonteFiltro] : r.fontes) {
      for (const row of f.rows) {
        if (row.arquivado_em && !comArq) continue
        const campos = camposPreenchidos(row, f, r)
        const hit = campos.find(([, v]) => confere(v))
        if (!hit) continue
        total++
        if (achados.length < limite) {
          const trecho = corta(hit[1].replace(/\s+/g, ' '), 140)
          achados.push(`- [${f.name}] **${titulo(row, f, r)}** [id ${row.id}]${row.arquivado_em ? ' (arquivado)' : ''} — ${hit[0]}: ${trecho}`)
        }
      }
    }
  }

  if (!fonteFiltro) {
    const q = await carregarQuadro(ctx, r.pessoas)
    for (const c of q.cartoes) {
      if (c.arquivada && !comArq) continue
      const alvo = [c.titulo, c.descricao, ...c.clientes.map(x => x.nome)].join(' \n ')
      if (!confere(alvo)) continue
      total++
      if (achados.length < limite) achados.push(`- [Tarefa · ${c.lista} · ${c.situacao}] **${c.titulo}** [id ${c.id}]`)
    }
  }

  if (!total) return `Nada encontrado para "${texto}".${comArq ? '' : ' (Arquivados não entraram — use incluir_arquivados=true.)'}`
  return `${total} resultado(s) para "${texto}"${total > achados.length ? ` — mostrando ${achados.length}` : ''}:\n${achados.join('\n')}`
}

async function listarRegistros(ctx: Contexto, a: Args): Promise<string> {
  const r = await carregarRetrato(ctx)
  const f = acharFonte(r, str(a.base))
  if (!f) return `Base "${str(a.base)}" não encontrada. Bases: ${r.fontes.map(x => x.name).join(', ')}.`

  const filtros = (a.filtros && typeof a.filtros === 'object' ? a.filtros : {}) as Record<string, unknown>
  const condicoes: { col: NonNullable<ReturnType<typeof acharColuna>>; valor: string }[] = []
  for (const [campo, valor] of Object.entries(filtros)) {
    const col = acharColuna(f, campo)
    if (!col) return `Campo "${campo}" não existe em ${f.name}. Campos: ${f.columns.map(c => c.name).join(', ')}.`
    condicoes.push({ col, valor: str(valor) })
  }

  let linhas = f.rows.filter(row => bool(a.incluir_arquivados) || !row.arquivado_em)
  linhas = linhas.filter(row => condicoes.every(({ col, valor }) => {
    const v = valorCampo(col, row, f, r)
    return valor === '' ? !v.trim() : norm(v).includes(norm(valor))
  }))

  const ord = str(a.ordenar_por) ? acharColuna(f, str(a.ordenar_por)) : null
  if (str(a.ordenar_por) && !ord) return `Campo de ordenação "${str(a.ordenar_por)}" não existe em ${f.name}.`
  if (ord) {
    const chave = (row: typeof linhas[number]) => {
      const bruto = row.data?.[ord.id]
      if (ord.type === 'number') return Number(bruto) || 0
      if (ord.type === 'date') return diaISO(bruto) || ''
      if (ord.type === 'created_at') return row.created_at
      if (ord.type === 'updated_at') return row.updated_at
      return norm(valorCampo(ord, row, f, r))
    }
    const dir = str(a.ordem) === 'desc' ? -1 : 1
    linhas = [...linhas].sort((x, y) => {
      const kx = chave(x), ky = chave(y)
      if (kx === ky) return 0
      if (kx === '' || kx === 0) return 1      // vazios sempre no fim
      if (ky === '' || ky === 0) return -1
      return kx > ky ? dir : -dir
    })
  }

  const limite = int(a.limite, 30, 1, 200)
  const pagina = int(a.pagina, 1, 1, 10_000)
  const total = linhas.length
  const fatia = linhas.slice((pagina - 1) * limite, pagina * limite)

  const pedidos = Array.isArray(a.campos) ? (a.campos as unknown[]).map(str) : []
  const colsMostrar = pedidos.length ? pedidos.map(p => acharColuna(f, p)).filter((c): c is NonNullable<typeof c> => !!c) : undefined

  const paginas = Math.max(1, Math.ceil(total / limite))
  const out = [`# ${f.name}: ${total} registro(s)${condicoes.length ? ' com os filtros' : ''} — página ${pagina} de ${paginas}`]
  for (const row of fatia) {
    const campos = camposPreenchidos(row, f, r, colsMostrar)
    out.push(`\n## ${titulo(row, f, r)} [id ${row.id}]${row.arquivado_em ? ' (arquivado)' : ''}`)
    for (const [k, v] of campos) out.push(`- ${k}: ${corta(v, 600)}`)
  }
  if (pagina < paginas) out.push(`\n(Há mais: peça pagina=${pagina + 1}.)`)
  return out.join('\n')
}

async function verRegistro(ctx: Contexto, a: Args): Promise<string> {
  const id = str(a.id).trim()
  const r = await carregarRetrato(ctx)
  const achado = r.linhas.get(id)
  if (!achado) {
    // talvez seja uma tarefa
    const { data: card } = await ctx.admin.from('board_cards').select('id').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle()
    if (card) return verTarefa(ctx, { id })
    return `Registro ${id} não encontrado.`
  }
  const { fonte, row } = achado
  const out = [`# ${titulo(row, fonte, r)}`, `Base: ${fonte.name} · id ${row.id}${row.arquivado_em ? ` · ARQUIVADO em ${dataBR(row.arquivado_em)}` : ''}`,
    `Criado em ${dataBR(row.created_at, true)}${row.created_by ? ` por ${r.pessoas.get(row.created_by) || '?'}` : ''} · última edição ${dataBR(row.updated_at, true)}${row.updated_by ? ` por ${r.pessoas.get(row.updated_by) || '?'}` : ''}`]

  out.push('\n## Campos')
  const campos = camposPreenchidos(row, fonte, r)
  for (const [k, v] of campos) out.push(`- ${k}: ${v}`)
  const vazios = fonte.columns.filter(c => !campos.some(([k]) => k === c.name)).map(c => c.name)
  if (vazios.length) out.push(`- (vazios: ${vazios.join(', ')})`)

  const { data: comentarios } = await ctx.admin.from('db_row_comments')
    .select('user_id, text, created_at').eq('row_id', row.id).order('created_at', { ascending: true })
  if (comentarios?.length) {
    out.push(`\n## Comentários da equipe (${comentarios.length})`)
    for (const c of comentarios) out.push(`- ${dataBR(c.created_at, true)} · ${r.pessoas.get(c.user_id) || '?'}: ${c.text}`)
  }

  const ligados = quemApontaPara(row.id, r)
  if (ligados.length) {
    out.push(`\n## Registros ligados a este (${ligados.length})`)
    const porFonte = new Map<string, typeof ligados>()
    for (const l of ligados) { const arr = porFonte.get(l.fonte.name) || []; arr.push(l); porFonte.set(l.fonte.name, arr) }
    for (const [nomeFonte, itens] of porFonte) {
      out.push(`\n### ${nomeFonte} (${itens.length})`)
      for (const { fonte: f, coluna, row: lr } of itens.slice(0, 40)) {
        // resumo: até 8 campos curtos, fora a própria relação que aponta para cá
        const resumo = camposPreenchidos(lr, f, r).filter(([k]) => k !== coluna.name).slice(0, 8)
          .map(([k, v]) => `${k}: ${corta(v.replace(/\s+/g, ' '), 220)}`).join(' · ')
        out.push(`- [id ${lr.id}]${lr.arquivado_em ? ' (arquivado)' : ''} ${resumo}`)
      }
      if (itens.length > 40) out.push(`- …e mais ${itens.length - 40}. Use listar_registros na base ${nomeFonte}.`)
    }
  }

  // tarefas vinculadas a este registro (botão "Cliente" do cartão)
  const { data: vinc } = await ctx.admin.from('board_activity').select('card_id, text, board_cards!inner(workspace_id)')
    .eq('kind', 'contact').eq('board_cards.workspace_id', ctx.workspaceId).like('text', `%"contactId":"${row.id}"%`)
  const idsCartoes = [...new Set((vinc || []).map(v => v.card_id as string))]
  if (idsCartoes.length) {
    const q = await carregarQuadro(ctx, r.pessoas)
    const cartoes = q.cartoes.filter(c => idsCartoes.includes(c.id))
    out.push(`\n## Tarefas do quadro vinculadas (${cartoes.length})`)
    for (const c of cartoes) out.push(linhaCartao(c))
  }
  return out.join('\n')
}

async function listarTarefas(ctx: Contexto, a: Args): Promise<string> {
  const r = await carregarRetrato(ctx)
  const q = await carregarQuadro(ctx, r.pessoas)
  const situacao = str(a.situacao) || 'abertas'
  let cs: Cartao[] = q.cartoes
  if (situacao === 'abertas') cs = cs.filter(c => !c.encerrada && !c.arquivada)
  else if (situacao === 'encerradas') cs = cs.filter(c => c.encerrada || c.arquivada)

  const resp = norm(a.responsavel)
  if (resp) cs = ['ninguem', 'nenhum', 'sem responsavel'].includes(resp)
    ? cs.filter(c => !c.responsaveis.length)
    : cs.filter(c => c.responsaveis.some(p => norm(p).includes(resp)))
  if (norm(a.coluna)) cs = cs.filter(c => norm(c.lista).includes(norm(a.coluna)))
  if (norm(a.etiqueta)) cs = cs.filter(c => c.etiquetas.some(e => norm(e).includes(norm(a.etiqueta))))
  if (str(a.cliente_id)) cs = cs.filter(c => c.clientes.some(x => x.id === str(a.cliente_id)))
  if (norm(a.texto)) cs = cs.filter(c => norm(`${c.titulo} ${c.descricao}`).includes(norm(a.texto)))
  const ate = str(a.vence_ate)
  if (ate) cs = cs.filter(c => c.vence && (diaISO(c.vence) || '9999') <= ate)

  cs = [...cs].sort((x, y) => (x.vence || '9999').localeCompare(y.vence || '9999'))
  const limite = int(a.limite, 60, 1, 300)
  const hoje = hojeISO()
  const out = [`# Tarefas (${situacao}): ${cs.length}${cs.length > limite ? ` — mostrando ${limite}` : ''}`]
  for (const c of cs.slice(0, limite)) {
    const vencida = !c.encerrada && c.vence && (diaISO(c.vence) || '') < hoje ? ' ⚠ VENCIDA' : ''
    out.push(linhaCartao(c) + vencida)
  }
  return out.join('\n')
}

async function verTarefa(ctx: Contexto, a: Args): Promise<string> {
  const id = str(a.id).trim()
  const { data: card } = await ctx.admin.from('board_cards')
    .select('id').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle()
  if (!card) return `Tarefa ${id} não encontrada.`

  const { data: perfis } = await ctx.admin.from('profiles').select('id, full_name').eq('workspace_id', ctx.workspaceId)
  const pessoas = new Map((perfis || []).map(p => [p.id as string, (p.full_name as string) || '?']))
  const q = await carregarQuadro(ctx, pessoas)
  const c = q.cartoes.find(x => x.id === id)
  if (!c) return `Tarefa ${id} não encontrada.`

  const { data: ativ } = await ctx.admin.from('board_activity')
    .select('user_id, kind, text, created_at').eq('card_id', id).order('created_at', { ascending: true })

  const out = [`# ${c.titulo}`, linhaCartao(c).slice(2), `Criada em ${dataBR(c.criadaEm, true)}${c.encerradaEm ? ` · encerrada em ${dataBR(c.encerradaEm, true)}` : ''}`]
  if (c.descricao.trim()) out.push(`\n## Descrição\n${c.descricao.trim()}`)

  const json = (t: string) => { try { return JSON.parse(t) } catch { return null } }
  const checklists = (ativ || []).filter(x => x.kind === 'checklist').map(x => json(x.text)).filter(Boolean)
  for (const cl of checklists) {
    const itens = Array.isArray(cl.items) ? cl.items : []
    out.push(`\n## Checklist: ${cl.title || 'Checklist'} (${itens.filter((i: { done?: boolean }) => i.done).length}/${itens.length})`)
    for (const i of itens) out.push(`- [${i.done ? 'x' : ' '}] ${i.text}`)
  }

  const anexos = (ativ || []).filter(x => x.kind === 'attachment').map(x => json(x.text)?.name).filter(Boolean)
  if (anexos.length) out.push(`\n## Anexos\n${anexos.map((n: string) => `- ${n}`).join('\n')}`)

  const historico = (ativ || []).filter(x => x.kind === 'comment' || x.kind === 'event')
  if (historico.length) {
    out.push(`\n## Comentários e histórico`)
    for (const h of historico) {
      const quem = h.user_id ? pessoas.get(h.user_id) || '?' : 'sistema'
      out.push(`- ${dataBR(h.created_at, true)} · ${quem}${h.kind === 'comment' ? ' comentou' : ''}: ${h.text}`)
    }
  }
  return out.join('\n')
}

/** base de prazos/audiências: todas as datas dela contam */
const ehBaseDeAgenda = (f: Fonte) => /pendencia|audiencia|prazo|agenda/.test(norm(f.name))
/** em outras bases, só campo de data com cara de prazo */
const ehCampoDePrazo = (nome: string) => /prazo|vencimento|fatal|limite|audiencia|pericia/.test(norm(nome))

async function agendaPrazos(ctx: Contexto, a: Args): Promise<string> {
  const valida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  const hoje = hojeISO()
  const de = valida(str(a.de)) ? str(a.de) : hoje
  const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const ate = valida(str(a.ate)) ? str(a.ate) : somaDias(de, 30)
  const inicio = bool(a.incluir_vencidos) ? somaDias(de, -60) : de

  const r = await carregarRetrato(ctx)
  const itens: { dia: string; texto: string }[] = []
  const camposUsados = new Set<string>()

  for (const f of r.fontes) {
    const agenda = ehBaseDeAgenda(f)
    const cols = f.columns.filter(c => c.type === 'date' && (agenda || ehCampoDePrazo(c.name)))
    if (!cols.length) continue
    for (const row of f.rows) {
      if (row.arquivado_em) continue
      for (const c of cols) {
        const dia = diaISO(row.data?.[c.id])
        if (!dia || dia < inicio || dia > ate) continue
        camposUsados.add(`${f.name} → ${c.name}`)
        const resumo = camposPreenchidos(row, f, r).filter(([k]) => k !== c.name).slice(0, 6)
          .map(([k, v]) => `${k}: ${corta(v.replace(/\s+/g, ' '), 160)}`).join(' · ')
        const quando = dataBR(row.data?.[c.id], !!c.config?.withTime)
        itens.push({ dia, texto: `- **${quando}** · [${f.name} · ${c.name}] ${titulo(row, f, r)} [id ${row.id}]${dia < hoje ? ' ⚠ já passou' : ''}\n  ${resumo}` })
      }
    }
  }

  const q = await carregarQuadro(ctx, r.pessoas)
  for (const c of q.cartoes) {
    if (c.encerrada || c.arquivada || !c.vence) continue
    const dia = diaISO(c.vence)
    if (!dia || dia < inicio || dia > ate) continue
    itens.push({ dia, texto: `${linhaCartao(c).replace(/^- /, `- **${dataBR(c.vence)}** · [Tarefa] `)}${dia < hoje ? ' ⚠ VENCIDA' : ''}` })
  }

  itens.sort((x, y) => x.dia.localeCompare(y.dia))
  const out = [`# Agenda de ${dataBR(inicio)} a ${dataBR(ate)}: ${itens.length} item(ns)`]
  if (camposUsados.size) out.push(`Datas consideradas: ${[...camposUsados].join('; ')}; e o vencimento das tarefas abertas.`)
  for (const i of itens) out.push(i.texto)
  if (!itens.length) out.push('Nada no período.')
  return out.join('\n')
}

/* -------------------------------------------------------------- despacho */

export async function executar(nome: string, args: Args, ctx: Contexto & { nome: string }): Promise<string> {
  let texto: string
  switch (nome) {
    case 'panorama_escritorio': texto = await panorama(ctx); break
    case 'buscar': texto = await buscar(ctx, args); break
    case 'listar_registros': texto = await listarRegistros(ctx, args); break
    case 'ver_registro': texto = await verRegistro(ctx, args); break
    case 'listar_tarefas': texto = await listarTarefas(ctx, args); break
    case 'ver_tarefa': texto = await verTarefa(ctx, args); break
    case 'agenda_prazos': texto = await agendaPrazos(ctx, args); break
    default: throw new Error(`Ferramenta desconhecida: ${nome}`)
  }
  return limitar(texto)
}
