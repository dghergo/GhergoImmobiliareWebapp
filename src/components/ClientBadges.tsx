// Indicatori del cliente al check-in: di chi è, se è senza mutuo (pallino verde), se deve vendere casa.

export default function ClientBadges({ tuo, portatoDa, agente, senzaMutuo, deveVendere }: {
  tuo?: boolean
  portatoDa: string | null | undefined
  agente: string | null | undefined
  senzaMutuo?: boolean
  deveVendere?: boolean
}) {
  const collega = !!portatoDa && !tuo
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      {tuo ? (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: '#203162' }}>
          👤 Tuo cliente
        </span>
      ) : collega ? (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
          🤝 Mandato da {portatoDa}
        </span>
      ) : agente ? (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-800">
          👤 Cliente di {agente}
        </span>
      ) : null}
      {senzaMutuo && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-800 inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" aria-hidden /> Senza mutuo
        </span>
      )}
      {deveVendere && (
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
          🏠 Deve vendere casa
        </span>
      )}
    </div>
  )
}
