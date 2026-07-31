/**
 * Identidade visual das pessoas (avatares). Duas iniciais + cor própria,
 * porque só a primeira letra confundia colegas de mesmo nome
 * (Vitor Canedo x Vinicius Ferreira apareciam os dois como "V").
 */

// partículas que não contam como sobrenome
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von', 'la'])

/** "Vitor Canedo" → "VC"; "Brucy" → "BR"; vazio → "?" */
export function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(p => p && !PARTICULAS.has(p.toLowerCase()))
  if (!parts.length) {
    const bruto = String(name || '').trim()
    return bruto ? bruto.slice(0, 2).toUpperCase() : '?'
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// cores fortes o bastante para ler em fundo escuro e distinguir entre si
export const PERSON_COLORS = [
  '#5B6AF0', '#10B981', '#F59E0B', '#EC4899', '#22D3EE',
  '#8B5CF6', '#EF4444', '#84CC16', '#F97316', '#14B8A6',
]

/** cor estável de uma pessoa (mesmo id → sempre a mesma cor) */
export function personColor(key?: string | null): string {
  const s = String(key || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PERSON_COLORS[h % PERSON_COLORS.length]
}
