/**
 * Contagem de prazo processual.
 *
 * POR QUE NÃO É A IA QUE CALCULA: a data final depende de regra jurídica, não
 * de leitura de texto. A publicação conta como o primeiro dia útil seguinte à
 * disponibilização (CPC art. 224 §2º), o prazo começa no dia útil seguinte ao
 * da publicação, no processo civil conta-se só dia útil (CPC art. 219) e o
 * curso fica suspenso entre 20/12 e 20/01 (CPC art. 220). Modelo de linguagem
 * erra isso com confiança. A IA devolve o NÚMERO de dias que o texto informa;
 * quem transforma em data é este módulo.
 *
 * LIMITE CONHECIDO: feriado forense local (municipal, estadual ou portaria do
 * tribunal) não está aqui — não existe lista nacional confiável. Por isso a
 * data devolvida é SUGESTÃO e a interface diz isso; a conferência é do
 * advogado. Melhor um campo pré-preenchido que ele valida do que um campo em
 * branco que ele esquece.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const dia = (s: string) => new Date(`${s}T12:00:00Z`)   // meio-dia evita fuso virar o dia
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

/** Domingo de Páscoa (algoritmo de Gauss/Meeus, calendário gregoriano). */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const diaMes = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, diaMes, 12))
}

const cacheFeriados = new Map<number, Set<string>>()

/** Feriados nacionais do ano (fixos + móveis atrelados à Páscoa). */
export function feriadosNacionais(ano: number): Set<string> {
  const guardado = cacheFeriados.get(ano)
  if (guardado) return guardado

  const p = pascoa(ano)
  const set = new Set<string>([
    `${ano}-01-01`, // Confraternização Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-11-20`, // Consciência Negra (nacional desde a Lei 14.759/2023)
    `${ano}-12-25`, // Natal
    iso(somaDias(p, -48)), // segunda de carnaval
    iso(somaDias(p, -47)), // terça de carnaval
    iso(somaDias(p, -2)),  // sexta-feira santa
    iso(somaDias(p, 60)),  // Corpus Christi
  ])
  cacheFeriados.set(ano, set)
  return set
}

/** Recesso forense: 20/12 a 20/01, inclusive (CPC art. 220). */
export function noRecesso(d: Date): boolean {
  const m = d.getUTCMonth() + 1, dd = d.getUTCDate()
  return (m === 12 && dd >= 20) || (m === 1 && dd <= 20)
}

/** Dia em que o foro funciona: não é fim de semana, feriado nacional nem recesso. */
export function ehDiaUtil(d: Date): boolean {
  const semana = d.getUTCDay()
  if (semana === 0 || semana === 6) return false
  if (feriadosNacionais(d.getUTCFullYear()).has(iso(d))) return false
  if (noRecesso(d)) return false
  return true
}

const proximoDiaUtil = (d: Date): Date => {
  let x = new Date(d)
  while (!ehDiaUtil(x)) x = somaDias(x, 1)
  return x
}

/** Avança `n` dias úteis a partir de `d` (que já deve ser dia útil). */
function avancarDiasUteis(d: Date, n: number): Date {
  let x = new Date(d)
  let faltam = n
  while (faltam > 0) {
    x = proximoDiaUtil(somaDias(x, 1))
    faltam--
  }
  return x
}

export interface PrazoCalculado {
  /** data em que a comunicação se considera publicada */
  publicacao: string
  /** primeiro dia do prazo */
  inicio: string
  /** último dia do prazo — SUGESTÃO, ver limite conhecido no topo do arquivo */
  fim: string
  avisos: string[]
}

/**
 * @param disponibilizacao data de disponibilização no DJEN (YYYY-MM-DD)
 * @param dias            número de dias informado na própria comunicação
 * @param contagem        'uteis' (padrão no processo civil) ou 'corridos'
 */
export function calcularPrazo(
  disponibilizacao: string, dias: number, contagem: 'uteis' | 'corridos' = 'uteis',
): PrazoCalculado | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(disponibilizacao) || !Number.isFinite(dias) || dias <= 0) return null

  const avisos: string[] = []
  const disp = dia(disponibilizacao)

  // publicação = primeiro dia útil seguinte à disponibilização
  const publicacao = proximoDiaUtil(somaDias(disp, 1))
  // o prazo começa no dia útil seguinte ao da publicação
  const inicio = proximoDiaUtil(somaDias(publicacao, 1))

  let fim: Date
  if (contagem === 'corridos') {
    fim = somaDias(inicio, dias - 1)
    // vencimento em dia sem expediente prorroga para o próximo dia útil
    if (!ehDiaUtil(fim)) {
      fim = proximoDiaUtil(fim)
      avisos.push('Vencimento caía em dia sem expediente; prorrogado para o dia útil seguinte.')
    }
  } else {
    fim = avancarDiasUteis(inicio, dias - 1)
  }

  if (noRecesso(publicacao) || noRecesso(inicio)) {
    avisos.push('Publicação dentro do recesso forense (20/12 a 20/01) — o início foi jogado para depois de 20/01.')
  }
  avisos.push('Data sugerida: não considera feriado forense local nem suspensão decretada pelo tribunal. Confira antes de aprovar.')

  return { publicacao: iso(publicacao), inicio: iso(inicio), fim: iso(fim), avisos }
}
