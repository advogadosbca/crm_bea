import { getAuthProfile, getPageAssets } from '@/lib/auth'
import { clientesPorProcesso } from '@/lib/clientes-por-processo'
import { NovidadesClient, type Comunicacao } from './NovidadesClient'

/**
 * Central de Novidades: uma linha por comunicação processual, com estado de
 * leitura e aprovação. A leitura passa pela RLS (o membro só vê o próprio
 * workspace); toda escrita vai por /api/novidades/acao.
 *
 * O cabeçalho é montado dentro do NovidadesClient, e não aqui: o EditableHeader
 * é Client Component e recebe o ícone como prop. Componente é função, e função
 * não atravessa a fronteira servidor→cliente — renderizar daqui derrubava a
 * página com "Functions cannot be passed directly to Client Components". As
 * outras telas (GeralClient, SettingsClient) seguem esse mesmo caminho.
 */
export default async function Page() {
  const { supabase, profile } = await getAuthProfile()
  const assets = await getPageAssets('novidades')
  const isAdmin = ['super_admin', 'admin'].includes(profile?.role || '')

  const [{ data: comunicacoes }, { data: membros }, { data: tratadas }] = await Promise.all([
    supabase.from('comunicacoes')
      .select('*').eq('status', 'nova').order('detectado_em', { ascending: false }).limit(300),
    supabase.from('profiles').select('id, full_name').eq('workspace_id', profile?.workspace_id || ''),
    supabase.from('comunicacoes')
      .select('*').neq('status', 'nova').order('aprovada_em', { ascending: false }).limit(60),
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
    />
  )
}
