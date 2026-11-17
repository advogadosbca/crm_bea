/**
 * Para onde voltar depois do login (`/login?next=...`).
 *
 * Hoje só a tela de permissão do Claude (/oauth/...) usa: o Claude abre essa
 * tela, o proxy manda para o login quem não está logado, e depois do login a
 * pessoa precisa cair de volta nela — senão o conector nunca termina de ligar.
 *
 * Só caminho interno e só /oauth/: aceitar qualquer `next` viraria um
 * redirecionador aberto (link do CRM levando para site de terceiros).
 */
export function destinoSeguro(next: string | null | undefined): string | null {
  const v = String(next || '')
  if (!v.startsWith('/oauth/')) return null
  if (v.startsWith('//') || v.includes('\\')) return null
  return v
}
