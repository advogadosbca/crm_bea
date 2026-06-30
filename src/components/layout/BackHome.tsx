import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackHome() {
  return (
    <Link href="/"
      className="group flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border transition-colors hover:bg-[var(--notion-bg-2)] mt-3"
      style={{ borderColor: 'var(--notion-border)', color: 'var(--notion-text)' }}>
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
      <span className="text-sm font-medium underline underline-offset-2">Voltar ao Início</span>
    </Link>
  )
}
