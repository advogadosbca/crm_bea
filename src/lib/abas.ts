/**
 * Abas do menu que o admin libera ou bloqueia por membro (engrenagem na tela
 * de Membros). Usado no menu lateral, na Início e no proxy, que barra a rota —
 * por isso este arquivo não importa nada de servidor nem de navegador.
 *
 * `profiles.abas` guarda só as exceções: { financeiro: true, marketing: false }.
 * Aba sem exceção segue o padrão do papel: admin vê tudo; os demais veem tudo
 * menos o que é `soAdmin`.
 *
 * Sub-abas (ex.: as da Geral) usam o mesmo esquema, com slug "aba.sub"
 * ("geral.atendimentos"). Sub-aba só abre se a aba-mãe também abrir.
 */

export interface SubAba {
  /** "aba.sub" — é a chave gravada em profiles.abas */
  slug: string
  label: string
  /** fechada por padrão para quem não é admin (o admin pode liberar) */
  soAdmin?: boolean
}

export interface Aba {
  slug: string
  label: string
  /** fechada por padrão para quem não é admin (o admin pode liberar) */
  soAdmin?: boolean
  subAbas?: SubAba[]
}

export const ABAS: Aba[] = [
  { slug: 'novidades', label: 'Notificações' },
  {
    slug: 'geral', label: 'Geral',
    subAbas: [
      { slug: 'geral.tabelas', label: 'Tabelas' },
      { slug: 'geral.funil', label: 'Funil Pré-Atendimento' },
      { slug: 'geral.negociacao', label: 'Leads em Negociação' },
      { slug: 'geral.acoes', label: 'Ações' },
      // valores de contrato e funil comercial: só sócios por padrão (Gabriel, 13/10/2026)
      { slug: 'geral.atendimentos', label: 'Atendimentos', soAdmin: true },
    ],
  },
  { slug: 'fontes', label: 'Fonte de dados' },
  { slug: 'financeiro', label: 'Financeiro', soAdmin: true },
  { slug: 'dashboard', label: 'Dashboard', soAdmin: true },
  { slug: 'alvaras', label: 'Alvarás' },
  { slug: 'pendencias', label: 'Pendências' },
  { slug: 'processos', label: 'Processos Judiciais' },
  { slug: 'audiencias', label: 'Audiências' },
  { slug: 'acoes-coletivas', label: 'Ações Coletivas' },
  { slug: 'administrativo', label: 'Administrativo' },
  { slug: 'metas', label: 'Metas' },
  { slug: 'membros', label: 'Membros' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'avaliacoes', label: 'Avaliações' },
  { slug: 'ideias', label: 'Ideias' },
  { slug: 'settings', label: 'Settings' },
]

export type PermissoesAbas = Record<string, boolean>

/** abas e sub-abas numa lista só — tudo que a engrenagem de Membros controla */
export const ITENS_DE_ACESSO: (Aba | SubAba)[] = ABAS.flatMap(a => [a, ...(a.subAbas || [])])
const acharItem = (slug: string) => ITENS_DE_ACESSO.find(a => a.slug === slug)
/** "geral.atendimentos" → "geral"; aba de menu → null */
export const abaMae = (slug: string) => (slug.includes('.') ? slug.split('.')[0] : null)

export const PAPEIS_ADMIN = ['admin', 'super_admin']
export const ehAdmin = (role?: string | null) => PAPEIS_ADMIN.includes(role || '')
export const ehVisualizador = (role?: string | null) => role === 'visualizador'

/** Membros nunca fecha para admin: sem ela, ninguém desfaz o bloqueio. */
export const abaTravadaParaAdmin = (slug: string) => slug === 'membros'

/** padrão do papel, sem olhar as exceções */
export function padraoDaAba(role: string | null | undefined, slug: string): boolean {
  const aba = acharItem(slug)
  if (!aba) return true
  return ehAdmin(role) || !aba.soAdmin
}

export function podeVerAba(role: string | null | undefined, abas: unknown, slug: string): boolean {
  if (!acharItem(slug)) return true
  if (role === 'super_admin') return true
  // sub-aba de uma aba fechada também fica fechada
  const mae = abaMae(slug)
  if (mae && !podeVerAba(role, abas, mae)) return false
  if (ehAdmin(role) && abaTravadaParaAdmin(slug)) return true
  const excecao = abas && typeof abas === 'object' ? (abas as PermissoesAbas)[slug] : undefined
  return typeof excecao === 'boolean' ? excecao : padraoDaAba(role, slug)
}

/** /tabelas é a gestão das fontes de dados: segue a aba "Fonte de dados" */
const ROTA_PARA_ABA: Record<string, string> = { tabelas: 'fontes' }

/** slug da aba dona da rota (primeiro segmento), ou null se a rota não é aba */
export function abaDaRota(pathname: string): string | null {
  const seg = pathname.split('/').filter(Boolean)[0]
  if (!seg) return null
  const slug = ROTA_PARA_ABA[seg] || seg
  return ABAS.some(a => a.slug === slug) ? slug : null
}

/** limpa o que veio do navegador: só abas conhecidas e valores booleanos */
export function sanitizarAbas(entrada: unknown): PermissoesAbas {
  const out: PermissoesAbas = {}
  if (!entrada || typeof entrada !== 'object') return out
  for (const aba of ITENS_DE_ACESSO) {
    const v = (entrada as Record<string, unknown>)[aba.slug]
    if (typeof v === 'boolean') out[aba.slug] = v
  }
  return out
}
