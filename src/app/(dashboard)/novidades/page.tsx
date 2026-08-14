import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { clientesPorProcesso } from '@/lib/clientes-por-processo'
import { NovidadesClient, type Comunicacao } from './NovidadesClient'

/**
 * Notificações: uma linha por comunicação processual, com estado de leitura e
 * aprovação. A leitura passa pela RLS (o membro só vê o próprio workspace);
 * toda escrita vai por /api/novidades/acao (uma) ou /api/novidades/lote (várias).
 *
 * A rota continua sendo /novidades depois da renomeação da tela: o `pageKey`
 * do banner/logo em `page_assets` está gravado com esse nome, e trocar a URL
 * apagaria a personalização já feita além de quebrar link salvo.
 *
 * O cabeçalho é montado dentro do NovidadesClient, e não aqui: o EditableHeader
 * é Client Component e recebe o ícone como prop. Componente é função, e função
 * não atravessa a fronteira servidor→cliente — renderizar daqui derrubava a
 * página com "Functions cannot be passed directly to Client Components". As
 * outras telas (GeralClient, SettingsClient) seguem esse mesmo caminho.
 */
/** Teto do que a tela carrega de uma vez. O resto é alcançado por "selecionar
 *  todas", que roda no servidor (ver /api/novidades/lote). */
const LIMITE = 300

export default async function Page() {
  const { supabase, profile } = await getAuthProfile()
  const assets = await getPageAssets('novidades')
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  const [{ data: comunicacoes }, { data: membros }, { data: tratadas }, { count: totalNovas }] = await Promise.all([
    supabase.from('comunicacoes')
      .select('*').eq('status', 'nova').order('detectado_em', { ascending: false }).limit(LIMITE),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', profile?.workspace_id || ''),
    // 'excluida' fica de fora de propósito: a linha só continua no banco para o
    // dedupe da ingestão (ver sql/003-notificacoes-lote.sql), não para ser vista
    supabase.from('comunicacoes')
      .select('*').in('status', ['aprovada', 'dispensada']).order('aprovada_em', { ascending: false }).limit(60),
    // o total real da caixa, que costuma ser maior que o LIMITE carregado — é o
    // que permite a tela oferecer "selecionar todas" em vez de mentir que a
    // seleção pegou tudo
    supabase.from('comunicacoes').select('id', { count: 'exact', head: true }).eq('status', 'nova'),
  ])

  // nome e telefone resolvidos na hora, só para os processos que estão na tela
  const cnjs = [...new Set([...(comunicacoes || []), ...(tratadas || [])].map(c => c.cnj as string))]
  const clientes = await clientesPorProcesso(supabase, profile?.workspace_id || '', cnjs)

  return (
    <NovidadesClient
      headerAssets={assets}
      clientes={clientes}
      novas={(comunicacoes || []) as Comunicacao[]}
      tratadas={(tratadas || []) as Comunicacao[]}
      membros={membros || []}
      userId={profile?.id || ''}
      isAdmin={isAdmin}
      totalNovas={totalNovas ?? (comunicacoes?.length || 0)}
    />
  )
}
