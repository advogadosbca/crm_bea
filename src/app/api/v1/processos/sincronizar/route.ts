import { authApiKey, unauthorized } from '@/lib/api-auth'
import { cnjsDaCelula, colunasProcessos, descreverMovimento, soData, soDigitos, textoDe } from '@/lib/processos-sync'

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

  const mov = body.movimento || {}
  const descricao = descreverMovimento(mov.nome, mov.complementosTabelados)
  const dataMov = soData(mov.dataHora)
  if (!descricao || !dataMov) {
    return Response.json({ error: 'movimento incompleto: exige nome e dataHora' }, { status: 400 })
  }

  const cols = await colunasProcessos(admin, workspaceId)
  if (!cols) return Response.json({ error: 'Fonte "Processos Judiciais" não encontrada.' }, { status: 404 })
  if (!cols.movimento) return Response.json({ error: 'Coluna "Atualização JusBR" não existe.' }, { status: 409 })

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
  const mesmaDescricao = textoDe(atual[cols.movimento]).trim() === descricao.trim()
  const mesmaData = cols.dataMovimento ? soData(atual[cols.dataMovimento]) === dataMov : true
  const hoje = new Date().toISOString().split('T')[0]

  if (mesmaDescricao && mesmaData) {
    // nada mudou: só registra que a consulta aconteceu, sem tocar no conteúdo
    if (cols.consultadoEm) {
      await admin.from('db_rows').update({ data: { ...atual, [cols.consultadoEm]: hoje } }).eq('id', alvo.id)
    }
    return Response.json({ status: 'sem_mudanca', rowId: alvo.id })
  }

  const novo: Record<string, unknown> = { ...atual, [cols.movimento]: descricao }
  if (cols.dataMovimento) novo[cols.dataMovimento] = dataMov
  if (cols.consultadoEm) novo[cols.consultadoEm] = hoje

  const { error } = await admin.from('db_rows')
    .update({ data: novo, updated_at: new Date().toISOString() }).eq('id', alvo.id)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({
    status: 'atualizado',
    rowId: alvo.id,
    anterior: textoDe(atual[cols.movimento]) || null,
    movimentacao: descricao,
    dataMovimentacao: dataMov,
    consultadoEm: hoje,
  })
}
