'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isAdmin } from '@/lib/auth'
import { AuthUser } from '@/lib/auth'

interface Agent {
  id: string
  nome: string
  cognome: string
  email: string
}

interface AgentSelectorProps {
  agent: AuthUser
  selectedAgentId: string
  onChange: (agentId: string) => void
  required?: boolean
  label?: string
}

export default function AgentSelector({ agent, selectedAgentId, onChange, required = true, label = 'Agente *' }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)

  useEffect(() => {
    if (isAdmin(agent)) {
      loadAgents()
    }
  }, [agent])

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('gre_agents')
        .select('id, nome, cognome, email')
        .eq('is_active', true)
        .order('cognome')

      if (error) throw error
      setAgents(data || [])
    } catch (error) {
      console.error('Error loading agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  if (!isAdmin(agent)) return null

  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-dark)' }}>
        {label}
      </label>
      <select
        value={selectedAgentId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        required={required}
        disabled={loadingAgents}
      >
        <option value="">Seleziona un agente...</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome} {a.cognome} ({a.email})
          </option>
        ))}
      </select>
    </div>
  )
}
