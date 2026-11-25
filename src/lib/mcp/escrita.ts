import type { DBColumn, DBRow } from '@/types/dynamic'
import { chaveTelefone, formatarTelefoneBr } from '@/lib/telefone'
import { COLUNA_GATILHO } from '@/lib/promover-lead'
import type { ContextoMcp } from './oauth'
import { type Fonte, type Retrato, carregarRetrato, corta, norm, soDigitos, titulo, valorCampo } from './dados'

/**
 * Ferramentas de ESCRITA do conector do Claude (sql/016).
 *
 * O que o escritório decidiu (25/11/2026), pensando na LGPD e no resguardo:
 * - Só grava quando um sócio LIGOU a edição para aquela conexão em
 *   Configurações → Claude. Sem isso, toda ferramenta daqui recusa.
 * - Pode: comentar e editar campos de registros, cadastrar registros, criar e
 *   comentar tarefas.
 * - NÃO pode, e não existe ferramenta para: apagar, arquivar, mexer em colunas
 *   ou bases, membros, permissões, nem gravar em campo "somente admins"
 *   (honorários, valor de contrato).
 * - Toda alteração vai para audit_logs com o sócio dono da conexão como autor e
 *   "via Claude" no contexto. Edição guarda antes/depois de cada campo — é o
 *   que permite conferir e desfazer à mão.
 * - Limite de gravações por hora por pessoa, contra laço ou pedido em massa.
 *
 * O Claude não guarda nada aqui: tudo que ele grava vai direto para o banco do
 * CRM, igual a um membro da equipe digitando na tela.
 */

type Args = Record<string, unknown>

const VIA = 'via Claude'
const LIMITE_POR_HORA = 60
const MAX_CAMPOS = 30
const MAX_TEXTO = 10_000

const grava = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

const AVISO_CONFIRMAR = 'Antes de chamar, confirme com o usuário o que vai ser gravado; grave só o que ele informou, nunca dado deduzido ou inventado.'

export const FERRAMENTAS_ESCRITA = [
  {
    name: 'comentar_registro',
    title: 'Comentar num registro',
    description: `Adiciona um comentário na ficha de um registro do CRM (cliente, lead, processo, pendência…), em nome do sócio conectado e marcado como feito pelo Claude. Use para registrar o que aconteceu (ex.: "cliente mandou os documentos pelo WhatsApp em 25/11"). ${AVISO_CONFIRMAR}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do registro (vem entre colchetes em buscar/ver_registro).' },
        texto: { type: 'string', description: 'O comentário.' },
      },
      required: ['id', 'texto'],
      additionalProperties: false,
    },
    annotations: { title: 'Comentar num registro', ...grava },
  },
  {
    name: 'editar_registro',
    title: 'Editar campos de um registro',
    description: `Altera campos de um registro existente. "campos" = { "Nome exato do campo": valor }, com o valor escrito como aparece na tela: texto; número ("1.500,00"); data "dd/mm/aaaa" (com hora "dd/mm/aaaa hh:mm" quando o campo tem hora); sim/não para caixa de seleção; o rótulo da opção para seleção (só opções que já existem — veja panorama_escritorio); nome da pessoa da equipe; para relação, o id ou o nome exato do registro ligado (lista para vários). "" apaga o valor do campo. Não altera campos automáticos, de arquivo, nem os "somente admins". O valor anterior fica guardado na Auditoria. Leia o registro com ver_registro antes. ${AVISO_CONFIRMAR}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id do registro.' },
        campos: { type: 'object', description: 'Campo -> novo valor.', additionalProperties: true },
      },
      required: ['id', 'campos'],
      additionalProperties: false,
    },
    annotations: { title: 'Editar campos de um registro', ...grava, destructiveHint: true },
  },
  {
    name: 'cadastrar_registro',
    title: 'Cadastrar um registro',
    description: `Cria um registro novo numa base (ex.: cliente em "Clientes", lead em "Leads", processo em "Processos Judiciais"). "campos" segue as mesmas regras de editar_registro. Antes de criar, procura duplicado pelo nome, CPF/CNPJ e telefone: se achar parecido, NÃO cria e devolve os parecidos — mostre ao usuário e só repita com cadastrar_mesmo_se_parecido=true se ele confirmar que é outra pessoa/caso. ${AVISO_CONFIRMAR}`,
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'Nome da base (veja panorama_escritorio).' },
        campos: { type: 'object', description: 'Campo -> valor.', additionalProperties: true },
        cadastrar_mesmo_se_parecido: { type: 'boolean', description: 'Só true depois de o usuário confirmar que não é duplicado. Padrão: false.' },
      },
      required: ['base', 'campos'],
      additionalProperties: false,
    },
    annotations: { title: 'Cadastrar um registro', ...grava },
  },
  {
    name: 'criar_tarefa',
    title: 'Criar tarefa no quadro',
    description: `Cria uma tarefa no Quadro de Tarefas do escritório. Responsáveis pelo nome (equipe em panorama_escritorio); etiquetas só as que já existem; vencimento "dd/mm/aaaa" ou "dd/mm/aaaa hh:mm" (horário de Brasília); clientes = ids de registros de Clientes/Leads para vincular. Sem coluna, entra na primeira coluna de trabalho (ex.: "A fazer"). ${AVISO_CONFIRMAR}`,
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        coluna: { type: 'string', description: 'Coluna do quadro (ex.: "A fazer").' },
        responsaveis: { type: 'array', items: { type: 'string' }, description: 'Nomes de pessoas da equipe.' },
        vence: { type: 'string', description: 'dd/mm/aaaa ou dd/mm/aaaa hh:mm.' },
        etiquetas: { type: 'array', items: { type: 'string' } },
        cliente_ids: { type: 'array', items: { type: 'string' }, description: 'ids de registros de Clientes ou Leads.' },
      },
      required: ['titulo'],
      additionalProperties: false,
    },
    annotations: { title: 'Criar tarefa no quadro', ...grava },
  },
  {
    name: 'comentar_tarefa',
    title: 'Comentar numa tarefa',
    description: `Adiciona um comentário numa tarefa do quadro, em nome do sócio conectado e marcado como feito pelo Claude. ${AVISO_CONFIRMAR}`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id da tarefa.' },
        texto: { type: 'string', description: 'O comentário.' },
      },
      required: ['id', 'texto'],
      additionalProperties: false,
    },
    annotations: { title: 'Comentar numa tarefa', ...grava },
  },
] as const

export const NOMES_ESCRITA: Set<string> = new Set(FERRAMENTAS_ESCRITA.map(f => f.name))

/** recusa que o Claude deve ler como erro (vai com isError: true) */
export class Recusa extends Error {}

/* ------------------------------------------------------------------ util */

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const lista = (v: unknown): string[] =>
  (Array.isArray(v) ? v : str(v).split(/[;,]/)).map(x => str(x).trim()).filter(Boolean)
const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
const assinatura = (texto: string) => `${texto.trim()}\n\n— registrado pelo Claude`

/** para gravar, o nome do campo tem que bater inteiro (sem acento/maiúscula) — "contém" pode cair no campo errado */
function colunaExata(f: Fonte, nome: string): DBColumn | null {
  const n = norm(nome)
  return f.columns.find(c => norm(c.name) === n) || null
}
function fonteExata(r: Retrato, nome: string): Fonte | null {
  const n = norm(nome)
  return r.fontes.find(f => f.id === nome) || r.fontes.find(f => norm(f.name) === n) || null
}

async function liberar(ctx: ContextoMcp) {
  if (!ctx.podeEditar) {
    throw new Recusa('Esta conexão do Claude está em modo SOMENTE LEITURA. Para gravar no CRM, um sócio precisa ligar "Pode editar" nesta conexão em Configurações → Claude. Avise o usuário; não tente contornar.')
  }
  const desde = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await ctx.admin.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.profileId).like('context', `%${VIA}%`).gte('created_at', desde)
  if ((count || 0) >= LIMITE_POR_HORA) {
    throw new Recusa(`Limite de ${LIMITE_POR_HORA} alterações por hora pelo Claude atingido. Peça ao usuário para aguardar ou fazer o restante direto no CRM.`)
  }
}

async function auditar(ctx: ContextoMcp, e: {
  action: string; table: string; recordId: string; label: string; context: string
  antes?: Record<string, unknown> | null; depois?: Record<string, unknown> | null
}) {
  const { error } = await ctx.admin.from('audit_logs').insert({
    workspace_id: ctx.workspaceId, user_id: ctx.profileId, action: e.action, table_name: e.table,
    record_id: e.recordId, old_data: e.antes ?? null, new_data: e.depois ?? null,
    record_label: corta(e.label || '(sem título)', 300), context: `${e.context} · ${VIA}`,
  })
  if (error) console.warn('[mcp] auditoria falhou:', error.message)
}

/**
 * Insert em db_rows/board_cards já gera "criou" pela trigger de auditoria (001),
 * mas sem autor: a service role não tem auth.uid(). Aqui o log ganha o sócio e
 * o "via Claude"; se a trigger não tiver gravado, grava agora.
 */
async function assinarCriacao(ctx: ContextoMcp, table: string, recordId: string, label: string, context: string, dados: unknown) {
  const { data } = await ctx.admin.from('audit_logs')
    .update({ user_id: ctx.profileId, context: `${context} · ${VIA}` })
    .eq('table_name', table).eq('record_id', recordId).eq('action', 'criou').is('user_id', null)
    .select('id')
  if (!data?.length) await auditar(ctx, { action: 'criou', table, recordId, label, context, depois: dados as Record<string, unknown> })
}

/* ------------------------------------------------- texto da tela -> célula */

const TIPOS_FIXOS = new Set(['created_at', 'updated_at', 'created_by', 'updated_by', 'rollup', 'formula', 'id', 'files', 'local'])

/** "15/03/1965", "15/03/1965 14:30", "1965-03-15", "1965-03-15T14:30" -> partes */
function lerData(v: string): { dia: string; hora: string | null } | null {
  const s = v.trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(?:às\s*)?(\d{1,2})[:h](\d{2}))?$/i)
  let ano: number, mes: number, d: number, h: string | null = null
  if (m) {
    d = +m[1]; mes = +m[2]; ano = +m[3]
    if (m[4]) h = `${m[4].padStart(2, '0')}:${m[5]}`
  } else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
    if (!m) return null
    ano = +m[1]; mes = +m[2]; d = +m[3]
    if (m[4]) h = `${m[4]}:${m[5]}`
  }
  const dt = new Date(Date.UTC(ano, mes - 1, d))
  if (ano < 1900 || ano > 2100 || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null
  if (h && (+h.slice(0, 2) > 23 || +h.slice(3) > 59)) return null
  return { dia: `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`, hora: h }
}

function lerNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = str(v).replace(/R\$|%|\s/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function lerSimNao(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  const n = norm(v)
  if (['sim', 's', 'true', 'x', 'marcado', 'verdadeiro', '1', 'yes'].includes(n)) return true
  if (['nao', 'n', 'false', 'desmarcado', 'falso', '0', 'no'].includes(n)) return false
  return null
}

function pessoaPorNome(r: Retrato, nome: string): { id: string } | { erro: string } {
  const n = norm(nome)
  const exatas = r.equipe.filter(p => norm(p.nome) === n || p.id === nome)
  if (exatas.length === 1) return { id: exatas[0].id }
  const parciais = r.equipe.filter(p => norm(p.nome).includes(n))
  if (parciais.length === 1) return { id: parciais[0].id }
  return { erro: parciais.length ? `"${nome}" bate com mais de uma pessoa: ${parciais.map(p => p.nome).join(', ')}.` : `Ninguém na equipe com o nome "${nome}". Equipe: ${r.equipe.map(p => p.nome).join(', ')}.` }
}

type Conversao = { valor: unknown } | { erro: string }

/** valor como a pessoa escreveria na tela -> o que a célula guarda */
function converter(col: DBColumn, bruto: unknown, r: Retrato): Conversao {
  if (TIPOS_FIXOS.has(col.type)) return { erro: `"${col.name}" é preenchido automaticamente ou é de arquivo — não dá para gravar por aqui.` }
  if (col.config?.adminOnly) return { erro: `"${col.name}" é campo "somente admins" (ex.: honorários) — o Claude só lê, não altera. Faça direto no CRM.` }
  if (vazio(bruto)) return { valor: null }

  const opcoes = col.config?.options || []
  const opcao = (rotulo: string) => opcoes.find(o => norm(o.label) === norm(rotulo) || o.id === rotulo)

  switch (col.type) {
    case 'number': {
      const n = lerNumero(bruto)
      return n === null ? { erro: `"${col.name}" espera número; recebi "${str(bruto)}".` } : { valor: n }
    }
    case 'checkbox': {
      const b = lerSimNao(bruto)
      if (b === null) return { erro: `"${col.name}" espera sim ou não; recebi "${str(bruto)}".` }
      if (b && col.name === COLUNA_GATILHO) {
        return { erro: `Marcar "${COLUNA_GATILHO}" transforma o lead em cliente (cria o cadastro em Clientes), e isso só acontece pela tela do CRM. Peça ao usuário para marcar lá.` }
      }
      return { valor: b }
    }
    case 'date': {
      const d = lerData(str(bruto))
      if (!d) return { erro: `"${col.name}" espera data dd/mm/aaaa${col.config?.withTime ? ' (com hora: dd/mm/aaaa hh:mm)' : ''}; recebi "${str(bruto)}".` }
      return { valor: col.config?.withTime ? `${d.dia}T${d.hora || '00:00'}` : d.dia }
    }
    case 'select': case 'status': {
      const o = opcao(str(bruto).trim())
      return o ? { valor: o.id } : { erro: `"${str(bruto)}" não é opção de "${col.name}". Opções: ${opcoes.map(x => x.label).join(' | ')}. (Opção nova só pela tela.)` }
    }
    case 'multi_select': {
      const ids: string[] = []
      for (const item of lista(bruto)) {
        const o = opcao(item)
        if (!o) return { erro: `"${item}" não é opção de "${col.name}". Opções: ${opcoes.map(x => x.label).join(' | ')}.` }
        if (!ids.includes(o.id)) ids.push(o.id)
      }
      return { valor: ids }
    }
    case 'person': {
      const p = pessoaPorNome(r, str(bruto).trim())
      return 'erro' in p ? p : { valor: p.id }
    }
    case 'people': {
      const ids: string[] = []
      for (const nome of lista(bruto)) {
        const p = pessoaPorNome(r, nome)
        if ('erro' in p) return p
        if (!ids.includes(p.id)) ids.push(p.id)
      }
      return { valor: ids }
    }
    case 'relation': {
      const alvo = r.fontes.find(f => f.id === col.config?.sourceTableId)
      if (!alvo) return { erro: `"${col.name}" não tem base de destino configurada.` }
      const ids: string[] = []
      for (const item of lista(bruto)) {
        const limpo = item.replace(/^\[?id\s*/i, '').replace(/\]$/, '').trim()
        let id = alvo.rows.find(x => x.id === limpo)?.id
        if (!id) {
          const achados = alvo.rows.filter(x => norm(titulo(x, alvo, r)) === norm(item))
          if (achados.length > 1) return { erro: `"${item}" bate com ${achados.length} registros em ${alvo.name}; passe o id (ids: ${achados.slice(0, 5).map(x => x.id).join(', ')}).` }
          id = achados[0]?.id
        }
        if (!id) return { erro: `Não achei "${item}" em ${alvo.name}. Use buscar para pegar o id.` }
        if (!ids.includes(id)) ids.push(id)
      }
      return { valor: ids }
    }
    case 'email': {
      const s = str(bruto).trim()
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { valor: s } : { erro: `"${s}" não parece um e-mail.` }
    }
    case 'phone':
      return { valor: formatarTelefoneBr(str(bruto)) }
    default: {
      const s = typeof bruto === 'object' ? JSON.stringify(bruto) : str(bruto)
      return { valor: corta(s.trim(), MAX_TEXTO) }
    }
  }
}

/** converte todos os campos pedidos; junta os erros para o Claude corrigir de uma vez */
function converterCampos(f: Fonte, campos: unknown, r: Retrato): { valores: Map<DBColumn, unknown> } {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) throw new Recusa('"campos" tem que ser um objeto { "Nome do campo": valor }.')
  const entradas = Object.entries(campos as Record<string, unknown>)
  if (!entradas.length) throw new Recusa('Nenhum campo informado.')
  if (entradas.length > MAX_CAMPOS) throw new Recusa(`No máximo ${MAX_CAMPOS} campos por vez.`)

  const valores = new Map<DBColumn, unknown>()
  const erros: string[] = []
  for (const [nome, bruto] of entradas) {
    const col = colunaExata(f, nome)
    if (!col) { erros.push(`Campo "${nome}" não existe em ${f.name}. Campos: ${f.columns.map(c => c.name).join(', ')}.`); continue }
    const c = converter(col, bruto, r)
    if ('erro' in c) erros.push(c.erro)
    else valores.set(col, c.valor)
  }
  if (erros.length) throw new Recusa(`Nada foi gravado. Corrija:\n- ${erros.join('\n- ')}`)
  return { valores }
}

/* ------------------------------------------------------------ ferramentas */

async function comentarRegistro(ctx: ContextoMcp, a: Args): Promise<string> {
  await liberar(ctx)
  const texto = str(a.texto).trim()
  if (!texto) throw new Recusa('Comentário vazio.')
  const r = await carregarRetrato(ctx)
  const achado = r.linhas.get(str(a.id).trim())
  if (!achado) throw new Recusa(`Registro ${str(a.id)} não encontrado. (Para tarefa, use comentar_tarefa.)`)
  const { fonte, row } = achado

  const { data, error } = await ctx.admin.from('db_row_comments')
    .insert({ row_id: row.id, user_id: ctx.profileId, text: assinatura(corta(texto, MAX_TEXTO)) }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'o banco não confirmou o comentário.')
  const rotulo = titulo(row, fonte, r)
  await auditar(ctx, { action: 'comentou', table: 'db_rows', recordId: row.id, label: rotulo, context: fonte.name, depois: { Comentário: texto } })
  return `Comentário gravado em ${fonte.name} › ${rotulo} [id ${row.id}], em nome de ${ctx.nome || 'sócio'}.`
}

async function editarRegistro(ctx: ContextoMcp, a: Args): Promise<string> {
  await liberar(ctx)
  const r = await carregarRetrato(ctx)
  const achado = r.linhas.get(str(a.id).trim())
  if (!achado) throw new Recusa(`Registro ${str(a.id)} não encontrado. (Tarefas do quadro não são editadas por aqui; use comentar_tarefa.)`)
  const { fonte, row } = achado
  const { valores } = converterCampos(fonte, a.campos, r)

  const data: Record<string, unknown> = { ...(row.data || {}) }
  const novo: DBRow = { ...row, data }
  for (const [col, v] of valores) {
    if (v === null) delete data[col.id]
    else data[col.id] = v
  }

  const antes: Record<string, string> = {}
  const depois: Record<string, string> = {}
  for (const col of valores.keys()) {
    const x = valorCampo(col, row, fonte, r)
    const y = valorCampo(col, novo, fonte, r)
    if (x !== y) { antes[col.name] = x || '(vazio)'; depois[col.name] = y || '(vazio)' }
  }
  if (!Object.keys(depois).length) return 'Nada mudou: os valores informados já são os que estão no CRM.'

  // só grava se ninguém mexeu no registro desde a leitura — senão sobrescreveria a edição de outra pessoa
  const agora = new Date().toISOString()
  const { data: ok, error } = await ctx.admin.from('db_rows')
    .update({ data, updated_by: ctx.profileId, updated_at: agora })
    .eq('id', row.id).eq('updated_at', row.updated_at).select('id')
  if (error) throw new Error(error.message)
  if (!ok?.length) throw new Recusa('O registro acabou de ser alterado por outra pessoa. Leia de novo com ver_registro e refaça a alteração.')

  const rotulo = titulo(novo, fonte, r)
  await auditar(ctx, { action: 'editou', table: 'db_rows', recordId: row.id, label: rotulo, context: fonte.name, antes, depois })
  const linhas = Object.keys(depois).map(k => `- ${k}: ${corta(antes[k], 200)} → ${corta(depois[k], 200)}`)
  return `Alterado em ${fonte.name} › ${rotulo} [id ${row.id}]:\n${linhas.join('\n')}\n(O valor anterior fica na Auditoria do CRM.)`
}

/** registros que parecem o mesmo: título igual, mesmo CPF/CNPJ ou mesmo telefone */
function parecidos(f: Fonte, novo: DBRow, r: Retrato): string[] {
  const cols = [...f.columns].sort((a, b) => a.position - b.position)
  const ehDoc = (c: DBColumn) => /cpf|cnpj/.test(norm(c.name))
  const ehFone = (c: DBColumn) => c.type === 'phone' || /telefone|celular|whatsapp/.test(norm(c.name))
  const tituloNovo = norm(titulo(novo, f, r))
  const out: string[] = []
  for (const row of f.rows) {
    const motivos: string[] = []
    if (tituloNovo && tituloNovo !== norm('(sem título)') && norm(titulo(row, f, r)) === tituloNovo) motivos.push('mesmo nome')
    for (const c of cols) {
      const a = novo.data?.[c.id], b = row.data?.[c.id]
      if (vazio(a) || vazio(b)) continue
      if (ehDoc(c) && soDigitos(a).length >= 11 && soDigitos(a) === soDigitos(b)) motivos.push(`mesmo ${c.name}`)
      else if (ehFone(c) && chaveTelefone(a) && chaveTelefone(a) === chaveTelefone(b)) motivos.push(`mesmo ${c.name}`)
    }
    if (motivos.length) out.push(`- ${titulo(row, f, r)} [id ${row.id}]${row.arquivado_em ? ' (arquivado)' : ''} — ${[...new Set(motivos)].join(', ')}`)
    if (out.length >= 10) break
  }
  return out
}

async function cadastrarRegistro(ctx: ContextoMcp, a: Args): Promise<string> {
  await liberar(ctx)
  const r = await carregarRetrato(ctx)
  const fonte = fonteExata(r, str(a.base).trim())
  if (!fonte) throw new Recusa(`Base "${str(a.base)}" não encontrada (o nome tem que ser o exato). Bases: ${r.fontes.map(f => f.name).join(', ')}.`)
  const { valores } = converterCampos(fonte, a.campos, r)

  const data: Record<string, unknown> = {}
  for (const [col, v] of valores) if (v !== null) data[col.id] = v
  if (!Object.keys(data).length) throw new Recusa('Todos os campos vieram vazios.')

  const rascunho = { id: '', table_id: fonte.id, data, position: 0 } as unknown as DBRow
  if (a.cadastrar_mesmo_se_parecido !== true) {
    const iguais = parecidos(fonte, rascunho, r)
    if (iguais.length) {
      return `NADA FOI CADASTRADO. Já existe(m) em ${fonte.name} registro(s) parecido(s):\n${iguais.join('\n')}\n\nMostre ao usuário. Se for o mesmo, use editar_registro/comentar_registro nele. Só cadastre de novo, com cadastrar_mesmo_se_parecido=true, se o usuário confirmar que é outro.`
    }
  }

  const posicao = fonte.rows.reduce((m, x) => Math.max(m, Number(x.position) || 0), 0) + 1
  const { data: criado, error } = await ctx.admin.from('db_rows')
    .insert({ table_id: fonte.id, data, position: posicao, created_by: ctx.profileId, updated_by: ctx.profileId })
    .select('id').single()
  if (error || !criado) throw new Error(error?.message || 'o banco não confirmou o cadastro.')

  const rotulo = titulo({ ...rascunho, id: criado.id }, fonte, r)
  await assinarCriacao(ctx, 'db_rows', criado.id, rotulo, fonte.name, { data })
  const campos = [...valores.keys()].filter(c => valores.get(c) !== null)
    .map(c => `- ${c.name}: ${corta(valorCampo(c, { ...rascunho, id: criado.id }, fonte, r), 200)}`)
  return `Cadastrado em ${fonte.name}: ${rotulo} [id ${criado.id}]\n${campos.join('\n')}`
}

const listaEncerra = (t?: string) => ['finalizado', 'finalizada', 'finalizados'].includes(norm(t))

async function criarTarefa(ctx: ContextoMcp, a: Args): Promise<string> {
  await liberar(ctx)
  const tituloTarefa = str(a.titulo).trim()
  if (!tituloTarefa) throw new Recusa('Informe o título da tarefa.')
  const r = await carregarRetrato(ctx)
  const erros: string[] = []

  const [{ data: colunas }, { data: rotulos }] = await Promise.all([
    ctx.admin.from('board_lists').select('id, title, position').eq('workspace_id', ctx.workspaceId).order('position'),
    ctx.admin.from('board_labels').select('id, name').eq('workspace_id', ctx.workspaceId),
  ])
  const listas = (colunas || []) as { id: string; title: string }[]
  let coluna: { id: string; title: string } | undefined
  if (str(a.coluna).trim()) {
    const n = norm(a.coluna)
    coluna = listas.find(l => norm(l.title) === n) || (listas.filter(l => norm(l.title).includes(n)).length === 1 ? listas.find(l => norm(l.title).includes(n)) : undefined)
    if (!coluna) erros.push(`Coluna "${str(a.coluna)}" não encontrada. Colunas: ${listas.map(l => l.title).join(', ')}.`)
  } else {
    coluna = listas.find(l => norm(l.title) === 'a fazer') || listas.find(l => !listaEncerra(l.title))
    if (!coluna) erros.push('O quadro não tem nenhuma coluna de trabalho.')
  }

  const membros: string[] = []
  for (const nome of lista_(a.responsaveis)) {
    const p = pessoaPorNome(r, nome)
    if ('erro' in p) erros.push(p.erro); else if (!membros.includes(p.id)) membros.push(p.id)
  }

  const etiquetas: string[] = []
  for (const nome of lista_(a.etiquetas)) {
    const l = (rotulos || []).find(x => norm(x.name) === norm(nome))
    if (!l) erros.push(`Etiqueta "${nome}" não existe. Etiquetas: ${(rotulos || []).map(x => x.name).join(', ')}. (Etiqueta nova só pela tela.)`)
    else if (!etiquetas.includes(l.id as string)) etiquetas.push(l.id as string)
  }

  let vence: string | null = null
  if (str(a.vence).trim()) {
    const d = lerData(str(a.vence))
    // o servidor roda em UTC; o escritório digita no horário de Brasília (sem horário de verão desde 2019)
    if (!d) erros.push(`Vencimento "${str(a.vence)}" inválido; use dd/mm/aaaa ou dd/mm/aaaa hh:mm.`)
    else vence = new Date(`${d.dia}T${d.hora || '00:00'}:00-03:00`).toISOString()
  }

  const clientes: { id: string; nome: string }[] = []
  for (const id of lista_(a.cliente_ids)) {
    const achado = r.linhas.get(id)
    const ok = achado && (['fonte-contatos', 'fonte-leads'].includes(achado.fonte.module_key || '') || ['clientes', 'leads', 'contatos'].includes(norm(achado.fonte.name)))
    if (!ok) erros.push(`${id} não é um registro de Clientes ou Leads.`)
    else clientes.push({ id, nome: titulo(achado.row, achado.fonte, r) })
  }
  if (erros.length || !coluna) throw new Recusa(`Nada foi criado. Corrija:\n- ${erros.join('\n- ')}`)

  const { count } = await ctx.admin.from('board_cards').select('id', { count: 'exact', head: true }).eq('list_id', coluna.id)
  const { data: card, error } = await ctx.admin.from('board_cards').insert({
    workspace_id: ctx.workspaceId, list_id: coluna.id, title: corta(tituloTarefa, 300),
    description: str(a.descricao).trim() ? corta(str(a.descricao).trim(), MAX_TEXTO) : null,
    due_date: vence, position: count || 0, created_by: ctx.profileId,
  }).select('id').single()
  if (error || !card) throw new Error(error?.message || 'o banco não confirmou a tarefa.')

  const passos = await Promise.all([
    membros.length ? ctx.admin.from('board_card_members').insert(membros.map(profile_id => ({ card_id: card.id, profile_id }))) : null,
    etiquetas.length ? ctx.admin.from('board_card_labels').insert(etiquetas.map(label_id => ({ card_id: card.id, label_id }))) : null,
    ctx.admin.from('board_activity').insert([
      { card_id: card.id, user_id: ctx.profileId, kind: 'event', text: `criou o cartão (${VIA})` },
      ...clientes.map(c => ({ card_id: card.id, user_id: ctx.profileId, kind: 'contact', text: JSON.stringify({ contactId: c.id, name: c.nome }) })),
    ]),
  ])
  const falhas = passos.filter(p => p?.error).map(p => p!.error!.message)

  await assinarCriacao(ctx, 'board_cards', card.id, tituloTarefa, 'Quadro de Tarefas', { title: tituloTarefa })
  const nomes = (ids: string[]) => ids.map(id => r.pessoas.get(id) || '?').join(', ')
  return [
    `Tarefa criada: **${tituloTarefa}** [id ${card.id}] na coluna "${coluna.title}".`,
    membros.length ? `Responsáveis: ${nomes(membros)}.` : 'Sem responsável.',
    vence ? `Vence: ${str(a.vence).trim()}.` : '',
    etiquetas.length ? `Etiquetas: ${lista_(a.etiquetas).join(', ')}.` : '',
    clientes.length ? `Clientes: ${clientes.map(c => c.nome).join(', ')}.` : '',
    falhas.length ? `Atenção, parte não gravou: ${falhas.join('; ')}.` : '',
  ].filter(Boolean).join('\n')
}
const lista_ = (v: unknown) => (vazio(v) ? [] : lista(v))

async function comentarTarefa(ctx: ContextoMcp, a: Args): Promise<string> {
  await liberar(ctx)
  const texto = str(a.texto).trim()
  if (!texto) throw new Recusa('Comentário vazio.')
  const { data: card } = await ctx.admin.from('board_cards').select('id, title')
    .eq('id', str(a.id).trim()).eq('workspace_id', ctx.workspaceId).maybeSingle()
  if (!card) throw new Recusa(`Tarefa ${str(a.id)} não encontrada. (Para registro de base, use comentar_registro.)`)
  const { error } = await ctx.admin.from('board_activity')
    .insert({ card_id: card.id, user_id: ctx.profileId, kind: 'comment', text: assinatura(corta(texto, MAX_TEXTO)) })
  if (error) throw new Error(error.message)
  await auditar(ctx, { action: 'comentou', table: 'board_cards', recordId: card.id, label: card.title, context: 'Quadro de Tarefas', depois: { Comentário: texto } })
  return `Comentário gravado na tarefa "${card.title}" [id ${card.id}], em nome de ${ctx.nome || 'sócio'}.`
}

export async function executarEscrita(nome: string, args: Args, ctx: ContextoMcp): Promise<string> {
  switch (nome) {
    case 'comentar_registro': return comentarRegistro(ctx, args)
    case 'editar_registro': return editarRegistro(ctx, args)
    case 'cadastrar_registro': return cadastrarRegistro(ctx, args)
    case 'criar_tarefa': return criarTarefa(ctx, args)
    case 'comentar_tarefa': return comentarTarefa(ctx, args)
    default: throw new Error(`Ferramenta desconhecida: ${nome}`)
  }
}
