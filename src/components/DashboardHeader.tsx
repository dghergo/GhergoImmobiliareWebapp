'use client'

import Logo from './Logo'

interface DashboardHeaderProps {
  agentName: string
  children?: React.ReactNode
}

export default function DashboardHeader({ agentName, children }: DashboardHeaderProps) {
  return (
    <header style={{ backgroundColor: 'var(--primary-blue)' }} className="text-white shadow-lg">
      <div className="container mx-auto px-4 py-2 md:py-0 md:h-16">
        <div className="flex justify-between items-center h-full">
          <Logo height={56} />
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-xs md:text-sm hidden sm:inline">
              Benvenuto, <strong>{agentName}</strong>
            </span>
            {children}
          </div>
        </div>
      </div>
    </header>
  )
}
