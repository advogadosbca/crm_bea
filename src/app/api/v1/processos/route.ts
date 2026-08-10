import { authApiKey, unauthorized } from '@/lib/api-auth'
import { cnjsDaCelula, colunasProcessos, textoDe } from '@/lib/processos-sync'

/**
 * GET /api/v1/processos
 * Lista os processos com número preenchido, no formato que o fluxo do n8n precisa.
 * Evita que o n8n tenha que conhecer os UUIDs das colunas.
 */
export async function GET(req: Request) {
  const auth = await authApiKey(req)
  if (!auth) return unauthorized()
  const { workspaceId, admin } = auth

  const cols = await colunasProcessos(admin, workspaceId)
  if (!cols) return Response.json({ error: 'Fonte "Processos Judiciais" não encontrada.' }, { status: 404 })

  const { data: rows } = await admin.from('db_rows').select('id, data').eq('table_id', cols.tableId).order('position')

  const processos = (rows || [])
    .map(r => {
      const d = r.data as Record<string, unknown>
      const cnjs = cnjsDaCelula(d[cols.numero])
      return {
        rowId: r.id,
        // o CNJ extraído é o que vai para o DataJud; o texto original fica junto
        // para conferência quando a célula tem anotação
        numero: cnjs[0] || '',
        numeroNaTabela: textoDe(d[cols.numero]),
        outrosNumerosNaCelula: cnjs.slice(1),
        ultimaMovimentacao: cols.movimento ? textoDe(d[cols.movimento]) : '',
        dataMovimentacao: cols.dataMovimento ? textoDe(d[cols.dataMovimento]) : '',
        consultadoEm: cols.consultadoEm ? textoDe(d[cols.consultadoEm]) : '',
      }
    })
    .filter(p => p.numero)

  const comExtras = processos.filter(p => p.outrosNumerosNaCelula.length).length
  return Response.json({ total: processos.length, comMaisDeUmNumeroNaCelula: comExtras, processos })
}
