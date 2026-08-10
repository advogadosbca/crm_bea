import { authApiKey, unauthorized } from '@/lib/api-auth'
import { colunasProcessos, descreverMovimento, soData, soDigitos, textoDe } from '@/lib/processos-sync'

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

  // localiza pelo número normalizado (a base tem o número formatado)
  const { data: rows } = await admin.from('db_rows').select('id, data').eq('table_id', cols.tableId)
  const alvo = (rows || []).find(r => soDigitos((r.data as Record<string, unknown>)[cols.numero]) === digitos)
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
