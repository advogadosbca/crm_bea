import { authApiKey, adminClient } from '@/lib/api-auth'
import { getAuthProfile } from '@/lib/auth'
import { classificar, configIa, type EntradaClassificacao } from '@/lib/ia-classificacao'
import { calcularPrazo } from '@/lib/prazos'

/**
 * POST /api/v1/novidades/classificar
 *
 * Classifica as comunicações que ainda não passaram pela IA. Pensado para ser
 * chamado uma vez pelo n8n logo depois da rodada do DJEN, mas também aceita
 * sessão de admin (botão "classificar agora" em /novidades).
 *
 * Aceita API key (Bearer) ou sessão de admin.
 * Body opcional: { limite?: number, reprocessarErros?: boolean }
 *
 * Falha de classificação NUNCA some com a comunicação: o erro é gravado em
 * `classificacao_erro` e o item continua na caixa, cru.
 */

const ADMIN = ['super_admin', 'admin']

export async function POST(req: Request) {
  // 1) API key (n8n) — 2) sessão de admin (botão na interface)
  let workspaceId: string | null = null
  const porChave = await authApiKey(req)
  if (porChave) workspaceId = porChave.workspaceId
  else {
    const { profile } = await getAuthProfile()
    if (profile && ADMIN.includes(profile.role || '')) workspaceId = profile.workspace_id
  }
  if (!workspaceId) return Response.json({ error: 'Não autorizado.' }, { status: 401 })

  const admin = porChave?.admin || adminClient()
  const body = await req.json().catch(() => ({}))
  const limite = Math.min(Math.max(Number(body.limite) || 40, 1), 200)

  const cfg = await configIa(admin, workspaceId)
  if (!cfg) {
    return Response.json({
      error: 'Nenhuma chave de IA configurada. Cadastre em Settings → IA.',
    }, { status: 409 })
  }

  let q = admin.from('comunicacoes')
    .select('id, texto, data_publicacao, tipo_documento, nome_classe, orgao, tribunal, partes')
    .eq('workspace_id', workspaceId)
    // só o que está na caixa: publicação que entrou já tratada (acervo antigo
    // de processo recém-monitorado) ninguém vai ler, e classificar cada uma
    // custa uma chamada paga à IA
    .eq('status', 'nova')
    .is('classificado_em', null)
    .order('detectado_em', { ascending: false })
    .limit(limite)
  // por padrão não insiste no que já falhou — senão uma publicação problemática
  // é reprocessada e cobrada em toda execução
  if (!body.reprocessarErros) q = q.is('classificacao_erro', null)

  const { data: pendentes, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 400 })
  if (!pendentes?.length) return Response.json({ classificadas: 0, erros: 0, restantes: 0 })

  let ok = 0, falhas = 0
  for (const c of pendentes) {
    const linha = c as Record<string, unknown>
    const entrada: EntradaClassificacao = {
      texto: String(linha.texto || ''),
      dataPublicacao: (linha.data_publicacao as string) || null,
      tipoDocumento: (linha.tipo_documento as string) || null,
      nomeClasse: (linha.nome_classe as string) || null,
      orgao: (linha.orgao as string) || null,
      tribunal: (linha.tribunal as string) || null,
      partes: (linha.partes as { nome?: string; polo?: string }[]) || [],
    }

    try {
      const cls = await classificar(entrada, cfg)

      // o prazo em DIAS vem da IA; a DATA é calculada aqui, com dia útil
      const prazo = cls.prazo_dias && entrada.dataPublicacao
        ? calcularPrazo(entrada.dataPublicacao, cls.prazo_dias, cls.prazo_contagem || 'uteis')
        : null

      await admin.from('comunicacoes').update({
        classificacao: { ...cls, prazo },
        classificado_em: new Date().toISOString(),
        classificacao_modelo: cfg.modelo,
        classificacao_erro: null,
      }).eq('id', linha.id as string)
      ok++
    } catch (e) {
      await admin.from('comunicacoes').update({
        classificacao_erro: (e as Error).message.slice(0, 300),
      }).eq('id', linha.id as string)
      falhas++
    }
  }

  const { count } = await admin.from('comunicacoes')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).eq('status', 'nova')
    .is('classificado_em', null).is('classificacao_erro', null)

  return Response.json({ classificadas: ok, erros: falhas, restantes: count ?? 0, modelo: cfg.modelo })
}
