import Image from 'next/image'

interface LogoProps {
  className?: string
  height?: number
}

export default function Logo({ className = '', height = 40 }: LogoProps) {
  const mobileHeight = Math.round(height * 0.6)

  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/logo-ghergo.png"
        alt="Ghergo Immobiliare"
        height={height}
        width={height * 4.5}
        priority
        style={{ objectFit: 'contain' }}
        className="hidden md:block"
      />
      <Image
        src="/logo-ghergo.png"
        alt="Ghergo Immobiliare"
        height={mobileHeight}
        width={mobileHeight * 4.5}
        priority
        style={{ objectFit: 'contain' }}
        className="md:hidden"
      />
    </div>
  )
}
