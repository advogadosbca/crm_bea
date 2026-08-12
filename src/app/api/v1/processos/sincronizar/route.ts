import { authApiKey, unauthorized } from '@/lib/api-auth'
import {
  CAMPOS_DA_FONTE, cnjsDaCelula, colunasProcessos, descreverMovimento,
  limparPublicacao, soData, soDigitos, textoDe, type Fonte,
} from '@/lib/processos-sync'
import { ingerirPublicacoes, sincronizarResponsaveis, type ItemDjen } from '@/lib/comunicacoes'

/**
 * POST /api/v1/processos/sincronizar
 *
 * Recebe o andamento de um processo (do n8n) e atualiza a fonte "Processos
 * Judiciais". Duas fontes, cada uma no seu par de colunas:
 *   datajud -> "Atualização JusBR"     + "Data da movimentação"
 *   djen    -> "Atualização Comunica"  + "Data da publicação"
 *
 * No caso do DJEN existem dois formatos de corpo:
 *
 *   { fonte:'djen', rowId, numero, publicacoes: [ ...itens crus da API... ] }
 *     Preferido. Grava TODAS as publicações na tabela `comunicacoes` (append-only,
 *     idempotente pelo id/hash do DJEN) e usa a mais recente como prévia na célula.
 *     Lista vazia é resposta legítima: significa "consultei e não há nada", e
 *     mesmo assim carimba "Consultado em" — sem isso é impossível distinguir
 *     "conferido hoje, nada encontrado" de "nunca foi conferido".
 *
 *   { fonte:'djen', rowId, numero, publicacao: { texto, data, tipo, orgao } }
 *     Formato antigo, de uma publicação só. Continua funcionando para não
 *     quebrar fluxo já em produção, mas não alimenta a central de novidades.
 *
 * Resposta: { status: 'atualizado' | 'sem_mudanca' | 'sem_publicacao' | 'nao_encontrado', ... }
 */
export async function POST(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const body = await req.json().catch(() => ({}))
  const digitos = soDigitos(body.numero)
  if (digitos.length !== 20) {
    return Response.json({ error: 'numero inválido: esperado número CNJ com 20 dígitos' }, { status: 400 })
  }

  // 'fonte' ausente = datajud (compatível com quem já chama). Valor desconhecido
  // é erro explícito: cair no padrão em silêncio esconderia typo no fluxo e
  // gravaria publicação em cima da movimentação.
  if (body.fonte !== undefined && body.fonte !== 'datajud' && body.fonte !== 'djen') {
    return Response.json({ error: `fonte inválida: "${body.fonte}". Use "datajud" ou "djen".` }, { status: 400 })
  }
  const fonte: Fonte = body.fonte === 'djen' ? 'djen' : 'datajud'
  const lista: ItemDjen[] | null =
    fonte === 'djen' && Array.isArray(body.publicacoes) ? body.publicacoes as ItemDjen[] : null

  const cols = await colunasProcessos(admin, workspaceId)
  if (!cols) return Response.json({ error: 'Fonte "Processos Judiciais" não encontrada.' }, { status: 404 })

  // ---------- achar a linha do processo ----------
  // Caminho rápido: o GET /processos já devolve o rowId, então a busca é por
  // chave primária. Sem isso seria preciso baixar as ~390 linhas a cada chamada.
  let alvo: { id: string; data: Record<string, unknown> } | null = null

  if (typeof body.rowId === 'string' && body.rowId) {
    const { data } = await admin.from('db_rows').select('id, data, table_id').eq('id', body.rowId).maybeSingle()
    if (data && data.table_id === cols.tableId
        && cnjsDaCelula((data.data as Record<string, unknown>)[cols.numero]).includes(digitos)) {
      alvo = { id: data.id, data: data.data as Record<string, unknown> }
    }
  }

  // Sem rowId (ou rowId que não confere): procura pelo número. A comparação é
  // sobre os CNJ extraídos da célula, não sobre todos os dígitos dela, porque o
  // campo é texto livre e costuma ter anotação junto.
  if (!alvo) {
    const { data: rows } = await admin.from('db_rows').select('id, data').eq('table_id', cols.tableId)
    const achado = (rows || []).find(r => cnjsDaCelula((r.data as Record<string, unknown>)[cols.numero]).includes(digitos))
    if (achado) alvo = { id: achado.id, data: achado.data as Record<string, unknown> }
  }

  if (!alvo) return Response.json({ status: 'nao_encontrado', numero: body.numero })

  const atual = alvo.data
  const hoje = new Date().toISOString().split('T')[0]
  const carimbarConsulta = async () => {
    if (cols.consultadoEm) {
      await admin.from('db_rows').update({ data: { ...atual, [cols.consultadoEm]: hoje } }).eq('id', alvo!.id)
    }
  }

  // ---------- ingestão na central de novidades ----------
  let ingestao = null
  if (lista) {
    ingestao = await ingerirPublicacoes({
      admin, workspaceId, cols, rowId: alvo.id, cnj: digitos, linha: atual, itens: lista,
    })
    // a rodada diária é também quando a troca de responsável no CRM alcança as
    // novidades que ainda estão na caixa
    await sincronizarResponsaveis({ admin, workspaceId, cnj: digitos, linha: atual, cols })
    if (!lista.length) {
      // consultado, nada publicado — resposta legítima, não é falha
      await carimbarConsulta()
      return Response.json({ status: 'sem_publicacao', fonte, rowId: alvo.id, consultadoEm: hoje })
    }
  }

  // ---------- texto/data que vão para a célula ----------
  let descricao = ''
  let dataEvento = ''

  if (lista) {
    // a API não garante ordem; a prévia é sempre a publicação mais recente
    const maisNova = [...lista].sort((a, b) =>
      String(b.data_disponibilizacao).localeCompare(String(a.data_disponibilizacao)))[0]
    const cabecalho = [maisNova.tipoComunicacao, maisNova.nomeOrgao].filter(Boolean).join(' · ')
    const corpo = limparPublicacao(maisNova.texto)
    descricao = cabecalho ? `[${cabecalho}] ${corpo}` : corpo
    dataEvento = soData(maisNova.data_disponibilizacao)
  } else if (fonte === 'djen') {
    const pub = body.publicacao || {}
    const cabecalho = [pub.tipo, pub.orgao].filter(Boolean).join(' · ')
    const corpo = limparPublicacao(pub.texto)
    descricao = cabecalho ? `[${cabecalho}] ${corpo}` : corpo
    dataEvento = soData(pub.data)
    if (!corpo || !dataEvento) {
      return Response.json({ error: 'publicacao incompleta: exige texto e data' }, { status: 400 })
    }
  } else {
    const mov = body.movimento || {}
    descricao = descreverMovimento(mov.nome, mov.complementosTabelados, mov.instancia)
    dataEvento = soData(mov.dataHora)
    if (!descricao || !dataEvento) {
      return Response.json({ error: 'movimento incompleto: exige nome e dataHora' }, { status: 400 })
    }
  }

  const campos = CAMPOS_DA_FONTE[fonte]
  const colTexto = cols[campos.texto] as string | undefined
  const colData = cols[campos.data] as string | undefined
  if (!colTexto) return Response.json({ error: `Coluna de destino da fonte "${fonte}" não existe.` }, { status: 409 })

  const mesmaDescricao = textoDe(atual[colTexto]).trim() === descricao.trim()
  const mesmaData = colData ? soData(atual[colData]) === dataEvento : true

  if (mesmaDescricao && mesmaData) {
    // a prévia não mudou; mesmo assim pode ter entrado comunicação nova na
    // caixa (publicação antiga detectada com atraso), por isso `ingestao` volta
    await carimbarConsulta()
    return Response.json({ status: 'sem_mudanca', fonte, rowId: alvo.id, ingestao })
  }

  const novo: Record<string, unknown> = { ...atual, [colTexto]: descricao }
  if (colData) novo[colData] = dataEvento
  if (cols.consultadoEm) novo[cols.consultadoEm] = hoje

  const { error } = await admin.from('db_rows')
    .update({ data: novo, updated_at: new Date().toISOString() }).eq('id', alvo.id)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({
    status: 'atualizado',
    fonte,
    rowId: alvo.id,
    anterior: textoDe(atual[colTexto]) || null,
    movimentacao: descricao,
    dataMovimentacao: dataEvento,
    consultadoEm: hoje,
    ingestao,
  })
}
