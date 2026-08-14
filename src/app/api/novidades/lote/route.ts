import { getAuthProfile } from '@/lib/auth'
import { adminClient } from '@/lib/api-auth'

/**
 * POST /api/novidades/lote — ações em várias comunicações de uma vez.
 *
 * Existe separado de /api/novidades/acao porque as duas coisas são diferentes:
 * lá o alvo é UMA comunicação e a ação pode criar tarefa, audiência e mensagem
 * ao cliente. Aqui só se mexe no estado da caixa (lida / dispensada /
 * excluída) — nada é criado em outro quadro e nada é enviado a ninguém.
 * Aprovar continua sendo um por um, de propósito: aprovação passa por
 * formulário editável e não faz sentido em lote.
 *
 * SELEÇÃO
 *   { ids: [...] }                      -> só esses
 *   { todas: { aba, soMinhas } }        -> tudo o que a aba mostra HOJE
 *
 * O segundo formato existe porque a tela carrega no máximo 300 itens e a caixa
 * real passa de 900: sem ele, "marcar todas como lidas" deixaria centenas para
 * trás sem avisar. Quem resolve a lista é o servidor, aplicando as mesmas
 * regras da aba — se fosse o cliente a mandar os ids, mandaria só os que
 * carregou.
 */

type Acao = 'ler' | 'nao_ler' | 'dispensar' | 'excluir'
const ACOES: Acao[] = ['ler', 'nao_ler', 'dispensar', 'excluir']

/** Teto de segurança: mesmo "selecionar todas" não deve virar update infinito. */
const MAX = 2000

interface LinhaSelecionavel {
  id: string
  status: string
  responsaveis: string[] | null
  classificacao: { acao_necessaria?: boolean } | null
}

export async function POST(req: Request) {
  const { profile } = await getAuthProfile()
  if (!profile) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const acao = String(body.acao || '') as Acao
  if (!ACOES.includes(acao)) {
    return Response.json({ error: `ação desconhecida: ${body.acao}` }, { status: 400 })
  }

  // Excluir é irreversível pela tela e some de todas as abas — mesma régua do
  // resto do sistema, onde apagar registro é de admin.
  const isAdmin = ['super_admin', 'admin'].includes(profile.role || '')
  if (acao === 'excluir' && !isAdmin) {
    return Response.json({ error: 'Só administradores podem excluir comunicações.' }, { status: 403 })
  }

  const admin = adminClient()
  const agora = new Date().toISOString()

  // ---------- resolver quais linhas serão afetadas ----------
  let alvo: LinhaSelecionavel[] = []

  if (Array.isArray(body.ids) && body.ids.length) {
    const ids = [...new Set(body.ids.map(String))].slice(0, MAX)
    const { data } = await admin.from('comunicacoes')
      .select('id, status, responsaveis, classificacao')
      .eq('workspace_id', profile.workspace_id)   // nunca confiar no id que veio do navegador
      .in('id', ids)
    alvo = (data || []) as LinhaSelecionavel[]
  } else if (body.todas && typeof body.todas === 'object') {
    const aba = String(body.todas.aba || 'acao')
    const soMinhas = body.todas.soMinhas === true

    const q = admin.from('comunicacoes')
      .select('id, status, responsaveis, classificacao')
      .eq('workspace_id', profile.workspace_id)
      .limit(MAX)

    const { data } = aba === 'tratadas'
      ? await q.in('status', ['aprovada', 'dispensada'])
      : await q.eq('status', 'nova')

    let linhas = (data || []) as LinhaSelecionavel[]
    if (aba !== 'tratadas') {
      if (soMinhas) linhas = linhas.filter(l => (l.responsaveis || []).includes(profile.id))
      // mesma regra da tela: sem classificação a comunicação conta como
      // "precisa de ação" — melhor sobrar do que sumir
      linhas = aba === 'acao'
        ? linhas.filter(l => !l.classificacao || l.classificacao.acao_necessaria !== false)
        : linhas.filter(l => !!l.classificacao && l.classificacao.acao_necessaria === false)
    }
    alvo = linhas
  }

  if (!alvo.length) return Response.json({ ok: true, afetadas: 0, ignoradas: 0 })

  // ---------- aplicar ----------
  // Dispensar só faz sentido no que ainda está na caixa: uma comunicação já
  // aprovada gerou pendência e, possivelmente, aviso ao cliente — rebaixar o
  // status deixaria a tarefa órfã, apontando para um item que a tela diz que
  // ninguém tratou.
  const elegiveis = acao === 'dispensar' ? alvo.filter(l => l.status === 'nova') : alvo
  const ignoradas = alvo.length - elegiveis.length
  if (!elegiveis.length) return Response.json({ ok: true, afetadas: 0, ignoradas })

  const ids = elegiveis.map(l => l.id)
  const patch: Record<string, unknown> =
    acao === 'ler' ? { lida_em: agora }
    : acao === 'nao_ler' ? { lida_em: null }
    : acao === 'dispensar' ? {
        status: 'dispensada',
        dispensada_motivo: String(body.motivo || 'dispensada em lote').slice(0, 300),
        lida_em: agora,
        aprovada_por: profile.id,
        aprovada_em: agora,
      }
    : { status: 'excluida', excluida_por: profile.id, excluida_em: agora, lida_em: agora }

  const { error } = await admin.from('comunicacoes').update(patch).in('id', ids)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  // Uma entrada de auditoria para o lote inteiro, não uma por linha: 900
  // registros iguais afogariam a tela de auditoria e não contariam nada que
  // esta única linha não conte.
  await admin.from('audit_logs').insert({
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    action: ROTULO[acao],
    table_name: 'comunicacoes',
    record_id: null,
    record_label: `${ids.length} comunicaç${ids.length === 1 ? 'ão' : 'ões'}`,
    context: body.todas ? `seleção: toda a aba "${body.todas.aba}"` : 'seleção manual',
  })

  return Response.json({ ok: true, afetadas: ids.length, ignoradas })
}

const ROTULO: Record<Acao, string> = {
  ler: 'marcou comunicações como lidas',
  nao_ler: 'marcou comunicações como não lidas',
  dispensar: 'dispensou comunicações em lote',
  excluir: 'excluiu comunicações em lote',
}
