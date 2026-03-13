'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NewProjectPage() {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [utmZone, setUtmZone] = useState('37')
  const [hemisphere, setHemisphere] = useState('S')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error } = await supabase.from('projects').insert({
      name,
      location,
      utm_zone: parseInt(utmZone),
      hemisphere,
      user_id: user.id,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
          <a href="/dashboard" className="text-2xl font-bold" style={{ color: '#E8841A' }}>
            GEONOVA
          </a>
          <span className="ml-4 text-gray-400">/ New Project</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-8">Create New Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-2">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded focus:border-[#E8841A] focus:outline-none text-gray-100"
              required
              placeholder="My Survey Project"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Location / Description</label>
            <textarea
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded focus:border-[#E8841A] focus:outline-none text-gray-100 h-24 resize-none"
              placeholder="Project location or description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-300 mb-2">UTM Zone</label>
              <input
                type="number"
                value={utmZone}
                onChange={(e) => setUtmZone(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded focus:border-[#E8841A] focus:outline-none text-gray-100"
                min={1}
                max={60}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">Hemisphere</label>
              <select
                value={hemisphere}
                onChange={(e) => setHemisphere(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded focus:border-[#E8841A] focus:outline-none text-gray-100"
              >
                <option value="N">Northern</option>
                <option value="S">Southern</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <a
              href="/dashboard"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded transition-colors"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-[#E8841A] hover:bg-[#d67715] text-black font-semibold rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
