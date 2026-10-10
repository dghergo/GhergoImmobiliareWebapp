import type { Metadata } from 'next'
import Link from 'next/link'
import VideoProposta from '@/components/public/VideoProposta'

export const metadata: Metadata = {
  title: 'Come presentare la proposta d’acquisto – Ghergo Immobiliare',
  description: 'In meno di tre minuti: documenti da portare, prezzo, tempistiche, mutuo e assegni.',
}

// Pagina pubblica del video (link dalla mail del feedback)
export default function PropostaPage() {
  return (
    <div className="pub min-h-screen">
      <main className="pub-wrap py-10 max-w-3xl">
        <p className="text-sm font-semibold" style={{ color: 'var(--sky)' }}>Ghergo Immobiliare</p>
        <h1 className="pub-display text-3xl md:text-4xl leading-tight mt-1">Come presentare la tua proposta d&apos;acquisto</h1>
        <p className="pub-body pub-muted mt-3">Documenti da portare, prezzo, tempistiche, mutuo e assegni: tutto in meno di tre minuti.</p>
        <div className="mt-6">
          <VideoProposta />
        </div>
        <div className="mt-8 p-6 rounded-2xl text-center" style={{ background: '#203162', color: '#fff' }}>
          <p className="text-xl font-bold">Vuoi studiare insieme la tua proposta?</p>
          <p className="opacity-80 mt-1">Fissa un appuntamento in ufficio</p>
          <a href="tel:+390719257300" className="inline-block mt-4 px-6 py-3 rounded-full font-bold" style={{ background: '#fff', color: '#203162' }}>📞 071 9257300</a>
        </div>
        <div className="text-center mt-8">
          <Link href="/" className="pub-link">Guarda gli Open House in programma</Link>
        </div>
      </main>
    </div>
  )
}
