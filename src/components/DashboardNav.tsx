'use client'

import { useState } from 'react'

interface NavItem {
  label: string
  href: string
  active?: boolean
}

interface DashboardNavProps {
  items: NavItem[]
}

export default function DashboardNav({ items }: DashboardNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        {/* Desktop nav */}
        <div className="hidden md:flex space-x-8">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`py-4 px-2 border-b-2 text-sm font-medium nav-text ${
                item.active
                  ? ''
                  : 'border-transparent hover:border-blue-500'
              }`}
              style={
                item.active
                  ? { borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }
                  : { color: 'var(--text-gray)' }
              }
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between py-3 text-sm font-medium nav-text"
            style={{ color: 'var(--primary-blue)' }}
          >
            <span>{items.find(i => i.active)?.label || 'MENU'}</span>
            <svg
              className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isOpen && (
            <div className="border-t border-gray-200 pb-2">
              {items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block py-3 px-3 text-sm font-medium nav-text rounded-lg my-0.5 ${
                    item.active ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  style={
                    item.active
                      ? { color: 'var(--accent-blue)' }
                      : { color: 'var(--text-gray)' }
                  }
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
