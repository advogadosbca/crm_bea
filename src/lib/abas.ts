/**
 * Abas do menu que o admin libera ou bloqueia por membro (engrenagem na tela
 * de Membros). Usado no menu lateral, na Início e no proxy, que barra a rota —
 * por isso este arquivo não importa nada de servidor nem de navegador.
 *
 * `profiles.abas` guarda só as exceções: { financeiro: true, marketing: false }.
 * Aba sem exceção segue o padrão do papel: admin vê tudo; os demais veem tudo
 * menos o que é `soAdmin`.
 */

export interface Aba {
  slug: string
  label: string
  /** fechada por padrão para quem não é admin (o admin pode liberar) */
  soAdmin?: boolean
}

export const ABAS: Aba[] = [
  { slug: 'novidades', label: 'Notificações' },
  { slug: 'geral', label: 'Geral' },
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

export const PAPEIS_ADMIN = ['admin', 'super_admin']
export const ehAdmin = (role?: string | null) => PAPEIS_ADMIN.includes(role || '')
export const ehVisualizador = (role?: string | null) => role === 'visualizador'

/** Membros nunca fecha para admin: sem ela, ninguém desfaz o bloqueio. */
export const abaTravadaParaAdmin = (slug: string) => slug === 'membros'

/** padrão do papel, sem olhar as exceções */
export function padraoDaAba(role: string | null | undefined, slug: string): boolean {
  const aba = ABAS.find(a => a.slug === slug)
  if (!aba) return true
  return ehAdmin(role) || !aba.soAdmin
}

export function podeVerAba(role: string | null | undefined, abas: unknown, slug: string): boolean {
  if (!ABAS.some(a => a.slug === slug)) return true
  if (role === 'super_admin') return true
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
  for (const aba of ABAS) {
    const v = (entrada as Record<string, unknown>)[aba.slug]
    if (typeof v === 'boolean') out[aba.slug] = v
  }
  return out
}
