'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Opts = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; placeholder?: string; defaultValue?: string }
type State = ({ kind: 'confirm' | 'prompt' | 'alert'; message: string; opts: Opts; resolve: (v: unknown) => void }) | null

interface DialogApi {
  confirm: (message: string, opts?: Opts) => Promise<boolean>
  prompt: (message: string, opts?: Opts) => Promise<string | null>
  alert: (message: string, opts?: Opts) => Promise<void>
}

const Ctx = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDialog precisa do DialogProvider')
  return c
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null)
  const [value, setValue] = useState('')

  const confirm = useCallback((message: string, opts: Opts = {}) =>
    new Promise<boolean>(resolve => setState({ kind: 'confirm', message, opts, resolve: v => resolve(v as boolean) })), [])
  const prompt = useCallback((message: string, opts: Opts = {}) =>
    new Promise<string | null>(resolve => { setValue(opts.defaultValue || ''); setState({ kind: 'prompt', message, opts, resolve: v => resolve(v as string | null) }) }), [])
  const alert = useCallback((message: string, opts: Opts = {}) =>
    new Promise<void>(resolve => setState({ kind: 'alert', message, opts, resolve: () => resolve() })), [])

  function done(result: unknown) { state?.resolve(result); setState(null) }
  const cancelResult = state?.kind === 'prompt' ? null : false
  const okResult = state?.kind === 'prompt' ? value : (state?.kind === 'confirm' ? true : undefined)

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(cancelResult)
      if (e.key === 'Enter' && state.kind !== 'alert') { e.preventDefault(); done(okResult) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ confirm, prompt, alert }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.6)' }} onClick={e => { if (e.target === e.currentTarget) done(cancelResult) }}>
          <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl" style={{ background: 'var(--notion-bg-2)', border: '1px solid var(--notion-border)' }} onClick={e => e.stopPropagation()}>
            {state.opts.title && <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--notion-text)' }}>{state.opts.title}</h2>}
            <p className="text-sm mb-4" style={{ color: 'var(--notion-text-2)' }}>{state.message}</p>
            {state.kind === 'prompt' && (
              <input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder={state.opts.placeholder || ''}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
                style={{ background: 'var(--notion-bg-3)', border: '1px solid var(--notion-border)', color: 'var(--notion-text)' }} />
            )}
            <div className="flex justify-end gap-2">
              {state.kind !== 'alert' && (
                <button onClick={() => done(cancelResult)} className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--notion-bg-3)', color: 'var(--notion-text-2)' }}>
                  {state.opts.cancelLabel || 'Cancelar'}
                </button>
              )}
              <button autoFocus={state.kind === 'alert'} onClick={() => done(okResult)} className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: state.opts.danger ? '#DC2626' : 'var(--notion-accent)', color: '#fff' }}>
                {state.opts.confirmLabel || (state.kind === 'alert' ? 'OK' : state.kind === 'prompt' ? 'Salvar' : 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
