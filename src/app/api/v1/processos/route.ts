import { authApiKey, unauthorized } from '@/lib/api-auth'
import { colunasProcessos, textoDe } from '@/lib/processos-sync'

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
      return {
        rowId: r.id,
        numero: textoDe(d[cols.numero]),
        ultimaMovimentacao: cols.movimento ? textoDe(d[cols.movimento]) : '',
        dataMovimentacao: cols.dataMovimento ? textoDe(d[cols.dataMovimento]) : '',
        consultadoEm: cols.consultadoEm ? textoDe(d[cols.consultadoEm]) : '',
      }
    })
    .filter(p => p.numero.replace(/\D/g, '').length === 20)

  return Response.json({ total: processos.length, processos })
}
