/**
 * Esqueleto mostrado NA HORA em que se clica numa aba do menu.
 *
 * As páginas são dinâmicas (dependem do usuário logado): sem este arquivo, o
 * Next só trocava a tela quando o servidor terminava de montar a página nova, e
 * nesse meio-tempo nada acontecia — parecia travado. Com ele, o menu lateral
 * continua no lugar, o esqueleto aparece imediatamente e a página entra por cima
 * assim que fica pronta. Mesma altura do cabeçalho das abas (h-36), para não pular.
 */
export default function Loading() {
  const barra = (w: string, h = 'h-3') => (
    <div className={`${h} ${w} rounded animate-pulse`} style={{ background: 'var(--notion-bg-3)' }} />
  )
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Carregando">
      <div className="h-36 animate-pulse" style={{ background: 'var(--notion-bg-2)' }} />
      <div className="px-16 py-6 space-y-6">
        <div className="flex gap-2">{barra('w-24', 'h-7')}{barra('w-40', 'h-7')}{barra('w-36', 'h-7')}{barra('w-20', 'h-7')}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl p-4 border space-y-3" style={{ background: 'var(--notion-bg-2)', borderColor: 'var(--notion-border)' }}>
              {barra('w-1/3')}{barra('w-1/2', 'h-6')}{barra('w-2/3')}
            </div>
          ))}
        </div>
        <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map(i => <div key={i}>{barra('w-full', 'h-8')}</div>)}</div>
      </div>
    </div>
  )
}
