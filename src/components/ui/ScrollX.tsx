'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** classes do container que rola (mantenha o overflow-x-auto original) */
  className?: string
  style?: CSSProperties
  /** deslocamento do topo quando existe algum header fixo acima (px) */
  topOffset?: number
}

/**
 * Container com rolagem horizontal cuja barra fica ACIMA do conteúdo (e gruda no
 * topo ao rolar a página), em vez de ficar no rodapé — que em tabelas/kanbans
 * longos obriga o usuário a descer até o fim para arrastar.
 */
export function ScrollX({ children, className = '', style, topOffset = 0 }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const [spacerWidth, setSpacerWidth] = useState(0)
  const [overflows, setOverflows] = useState(false)

  const measure = useCallback(() => {
    const body = bodyRef.current
    if (!body) return
    const bar = barRef.current
    // a barra não tem borda; o container pode ter. Compensa a diferença para que
    // o curso das duas barras seja idêntico (senão o topo para antes do fim).
    const delta = bar ? bar.clientWidth - body.clientWidth : 0
    const w = body.scrollWidth + delta
    setSpacerWidth(prev => (Math.abs(prev - w) > 0.5 ? w : prev))
    const over = body.scrollWidth - body.clientWidth > 1
    setOverflows(prev => (prev === over ? prev : over))
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(measure)
  }, [measure])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    measure()

    const ro = new ResizeObserver(schedule)
    ro.observe(body)
    const observeChildren = () => Array.from(body.children).forEach(c => ro.observe(c))
    observeChildren()

    // conteúdo muda (linhas/colunas/cards) → remede a largura
    const mo = new MutationObserver(() => { observeChildren(); schedule() })
    mo.observe(body, { childList: true, subtree: true })

    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf.current)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [measure, schedule])

  // a barra só existe depois que `overflows` vira true — remede com ela montada
  useEffect(() => { if (overflows) measure() }, [overflows, measure])

  // Espelha a posição entre as duas barras. Sem trava/timer: o eco para sozinho
  // porque a segunda barra já está no valor destino quando o evento dela chega.
  const mirror = (from: 'bar' | 'body') => () => {
    const bar = barRef.current
    const body = bodyRef.current
    if (!bar || !body) return
    const [src, dst] = from === 'bar' ? [bar, body] : [body, bar]
    if (dst.scrollLeft !== src.scrollLeft) dst.scrollLeft = src.scrollLeft
  }

  return (
    <div className="relative">
      {overflows && (
        <div ref={barRef} onScroll={mirror('bar')} aria-hidden
          className="scrollx-bar sticky z-20 overflow-x-auto overflow-y-hidden mb-1"
          style={{ top: topOffset, background: 'var(--notion-bg)' }}>
          <div style={{ width: spacerWidth, height: 1 }} />
        </div>
      )}
      <div ref={bodyRef} onScroll={mirror('body')}
        className={overflows ? `${className} scrollx-body` : className} style={style}>
        {children}
      </div>
    </div>
  )
}
