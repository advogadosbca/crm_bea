import { authApiKey, unauthorized } from '@/lib/api-auth'
import {
  CAMPOS_DA_FONTE, cnjsDaCelula, colunasProcessos, descreverMovimento,
  limparPublicacao, soData, soDigitos, textoDe, type Fonte,
} from '@/lib/processos-sync'

/**
 * POST /api/v1/processos/sincronizar
 *
 * Recebe a última movimentação de um processo (vinda do DataJud, via n8n) e só
 * grava se for diferente da que já está registrada. A comparação é por
 * data + descrição da movimentação — equivalente a "código + data", já que o
 * código do CNJ determina o nome, e evita o falso positivo de usar
 * dataHoraUltimaAtualizacao (que muda em reindexação, sem andamento novo).
 *
 * Body: {
 *   numero: "5015739-27.2025.8.13.0223",   // ou só dígitos
 *   movimento: { nome, dataHora, complementosTabelados? }
 * }
 *
 * Resposta: { status: 'atualizado' | 'sem_mudanca' | 'nao_encontrado', ... }
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

  // duas fontes gratuitas, cada uma no seu par de colunas:
  //   datajud -> "Atualização JusBR"  + "Data da movimentação"   (movimento processual)
  //   djen    -> "Publicação (DJEN)"  + "Data da publicação"     (intimação publicada)
  // 'fonte' ausente = datajud (compatível com quem já chama). Valor desconhecido
  // é erro explícito: cair no padrão em silêncio esconderia typo no fluxo e
  // gravaria publicação em cima da movimentação.
  if (body.fonte !== undefined && body.fonte !== 'datajud' && body.fonte !== 'djen') {
    return Response.json({ error: `fonte inválida: "${body.fonte}". Use "datajud" ou "djen".` }, { status: 400 })
  }
  const fonte: Fonte = body.fonte === 'djen' ? 'djen' : 'datajud'

  let descricao = ''
  let dataEvento = ''
  if (fonte === 'djen') {
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

  const cols = await colunasProcessos(admin, workspaceId)
  if (!cols) return Response.json({ error: 'Fonte "Processos Judiciais" não encontrada.' }, { status: 404 })

  const campos = CAMPOS_DA_FONTE[fonte]
  const colTexto = cols[campos.texto] as string | undefined
  const colData = cols[campos.data] as string | undefined
  if (!colTexto) return Response.json({ error: `Coluna de destino da fonte "${fonte}" não existe.` }, { status: 409 })

  // Caminho rápido: o GET /processos já devolve o rowId, então a busca é por
  // chave primária. Sem isso seria preciso baixar as ~390 linhas da fonte a cada
  // chamada — o que degrada rápido quando o n8n dispara vários processos juntos.
  let alvo: { id: string; data: Record<string, unknown> } | null = null

  if (typeof body.rowId === 'string' && body.rowId) {
    const { data } = await admin.from('db_rows').select('id, data, table_id').eq('id', body.rowId).maybeSingle()
    // confere que a linha é mesmo da fonte de processos deste workspace
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

  const atual = alvo.data as Record<string, unknown>
  const mesmaDescricao = textoDe(atual[colTexto]).trim() === descricao.trim()
  const mesmaData = colData ? soData(atual[colData]) === dataEvento : true
  const hoje = new Date().toISOString().split('T')[0]

  if (mesmaDescricao && mesmaData) {
    // nada mudou: só registra que a consulta aconteceu, sem tocar no conteúdo
    if (cols.consultadoEm) {
      await admin.from('db_rows').update({ data: { ...atual, [cols.consultadoEm]: hoje } }).eq('id', alvo.id)
    }
    return Response.json({ status: 'sem_mudanca', fonte, rowId: alvo.id })
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
  })
}
