import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'
import { auditarCaso, avisarDecisao, type CasoNovo } from '@/lib/casos-novos'

/**
 * POST /api/casos/acao — ler | aprovar | recusar | reenviar
 *
 * Toda mutação de caso novo passa por aqui (a tabela tem RLS só de leitura),
 * para a decisão, a auditoria e o aviso à cliente ficarem num lugar só.
 *
 * A decisão é definitiva: caso já decidido devolve 409 em vez de trocar de
 * aprovado para recusado por baixo da Sofia, que pode já estar agendando.
 * `reenviar` só repete o webhook de um caso decidido cujo aviso falhou.
 */
export async function POST(req: Request) {
  const { profile } = await getAuthProfile()
  if (!profile) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  const acao = String(body.acao || '')
  if (!id) return Response.json({ error: 'id ausente.' }, { status: 400 })

  const admin = adminClient()
  const { data } = await admin.from('casos_novos').select('*').eq('id', id).maybeSingle()
  if (!data || data.workspace_id !== profile.workspace_id) {
    return Response.json({ error: 'Caso não encontrado.' }, { status: 404 })
  }
  const caso = data as CasoNovo
  const agora = new Date().toISOString()

  if (acao === 'ler') {
    if (!caso.lida_em) await admin.from('casos_novos').update({ lida_em: agora }).eq('id', id)
    return Response.json({ ok: true })
  }

  if (acao === 'reenviar') {
    if (caso.status === 'pendente') return Response.json({ error: 'O caso ainda não foi decidido.' }, { status: 409 })
    if (caso.webhook_enviado_em) return Response.json({ error: 'A cliente já foi avisada.' }, { status: 409 })
    const aviso = await avisarDecisao(admin, profile.workspace_id, caso, await nomeDe(admin, caso.decidido_por))
    if (aviso.enviado) await auditarCaso(admin, profile.workspace_id, profile.id, caso, 'reenviou aviso do caso')
    return Response.json({ ok: true, status: caso.status, aviso })
  }

  if (acao !== 'aprovar' && acao !== 'recusar') {
    return Response.json({ error: `ação desconhecida: ${acao}` }, { status: 400 })
  }
  if (caso.status !== 'pendente') {
    return Response.json({ error: `Este caso já foi ${caso.status}.` }, { status: 409 })
  }

  const status = acao === 'aprovar' ? 'aprovado' : 'recusado'
  const observacao = String(body.observacao || '').trim().slice(0, 2000) || null

  // `.eq('status', 'pendente')` no próprio update: dois advogados decidindo o
  // mesmo caso ao mesmo tempo, só o primeiro grava — o outro recebe 409.
  const { data: decidido } = await admin.from('casos_novos').update({
    status, observacao,
    decidido_por: profile.id,
    decidido_em: agora,
    lida_em: caso.lida_em || agora,
  }).eq('id', id).eq('status', 'pendente').select('*').maybeSingle()
  if (!decidido) return Response.json({ error: 'Outra pessoa decidiu este caso agora há pouco.' }, { status: 409 })

  await auditarCaso(admin, profile.workspace_id, profile.id, decidido as CasoNovo,
    status === 'aprovado' ? 'aprovou caso novo' : 'recusou caso novo')

  const aviso = await avisarDecisao(admin, profile.workspace_id, decidido as CasoNovo, profile.full_name || '')
  return Response.json({ ok: true, status, aviso })
}

async function nomeDe(admin: ReturnType<typeof adminClient>, id: string | null) {
  if (!id) return ''
  const { data } = await admin.from('profiles').select('full_name').eq('id', id).maybeSingle()
  return (data?.full_name as string) || ''
}
