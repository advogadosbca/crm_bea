/**
 * Telefone brasileiro: uma definição só de "é o mesmo número".
 *
 * A base tem o mesmo celular escrito de todo jeito — "37 9 9919-9014",
 * "(37)99199014", "5537991990140" — e o WhatsApp entrega só dígitos. Comparar
 * texto cru daria falso negativo em quase toda comparação, então tudo passa por
 * `chaveTelefone` antes de bater um contra o outro.
 */

/**
 * Chave de comparação: DDD + últimos 8 dígitos.
 *
 * Ignora de propósito o "9" que a operadora acrescentou aos celulares: metade
 * do cadastro é anterior a ele, e "37 9919-9014" e "37 9 9919-9014" são a mesma
 * pessoa. Devolve null quando não sobra número suficiente para afirmar nada.
 */
export function chaveTelefone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

/**
 * Formata para o padrão que o escritório usa na tela: "37 9 9109-6894".
 *
 * É só aparência — quem compara é a `chaveTelefone`. Serve para o registro
 * criado pela automação não destoar dos que a equipe digitou à mão.
 */
export function formatarTelefoneBr(v: unknown): string {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10) return String(v ?? '').trim()

  const ddd = d.slice(0, 2)
  let resto = d.slice(2)
  if (resto.length === 8) resto = '9' + resto      // celular antigo, sem o nono
  if (resto.length !== 9) return `${ddd} ${resto}` // fixo ou algo fora do padrão

  return `${ddd} ${resto.slice(0, 1)} ${resto.slice(1, 5)}-${resto.slice(5)}`
}
