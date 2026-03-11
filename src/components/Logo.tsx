import Image from 'next/image'

interface LogoProps {
  className?: string
  height?: number
}

export default function Logo({ className = '', height = 40 }: LogoProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/logo-ghergo.png"
        alt="Ghergo Immobiliare"
        height={height}
        width={height * 4.5} // Proporzione approssimativa del logo
        priority
        style={{ objectFit: 'contain' }}
      />
    </div>
  )
}
