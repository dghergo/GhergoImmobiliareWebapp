'use client'

import { useEffect, useState } from 'react'

// Conto alla rovescia reale fino all'inizio di un Open House (ora italiana del browser)
export default function Countdown({ date, time, tone = 'light' }: { date: string; time: string; tone?: 'light' | 'dark' }) {
  const target = new Date(`${date}T${time}`).getTime()
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  if (now === null) return null
  const diff = target - now
  if (diff <= 0) {
    return <span className={`pub-live ${tone === 'dark' ? 'is-dark' : ''}`}><i />In corso adesso</span>
  }

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const units = [
    ...(d > 0 ? [{ v: String(d), l: d === 1 ? 'giorno' : 'giorni' }] : []),
    { v: pad(h), l: 'ore' },
    { v: pad(m), l: 'min' },
    { v: pad(s), l: 'sec' },
  ]

  return (
    <span className={`pub-countdown ${tone === 'dark' ? 'is-dark' : ''}`} aria-label={`Mancano ${d} giorni, ${h} ore e ${m} minuti`}>
      {units.map(u => (
        <span key={u.l} className="pub-countdown-unit">
          <b>{u.v}</b>
          <small>{u.l}</small>
        </span>
      ))}
    </span>
  )
}
