'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save, FileText } from 'lucide-react'

export default function NewProjectPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    surveyType: 'Cadastral',
    location: '',
    utmZone: 36,
    hemisphere: 'N'
  })

  useEffect(() => {
    document.title = 'New Project — METARDU'
  }, [])

  const counties = [
    'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Kajiado',
    'Machakos', 'Kiambu', 'Kericho', 'Narok', 'Bungoma', 'Kakamega',
    'Kilifi', 'Mandera', 'Marsabit', 'Kitui', 'Garissa', 'Wajir',
    'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia', 'Uasin Gishu',
    'Elgeyo Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nyeri',
    'Kirinyaga', 'Muranga', 'Meru', 'Tharaka Nithi', 'Embu',
    'Kitui', 'Makueni', 'Taita Taveta', 'Tana River', 'Lamu',
    'Tana River', 'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo'
  ]

  const areaTypes = [
    'Freehold', 'Leasehold', 'Statutory Land', 'Customary Land', 'Trust Land'
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const project = await response.json()
      router.push(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (!session) {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">New Project</h1>
              <p className="text-[var(--text-muted)]">Create a new survey project</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  placeholder="Enter project name"
                />
              </div>

              {/* Survey Type */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Survey Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.surveyType}
                  onChange={(e) => handleInputChange('surveyType', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                >
                  <option value="Cadastral">Cadastral</option>
                  <option value="Topographical">Topographical</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Control">Control</option>
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  placeholder="Enter location"
                />
              </div>

              {/* Client Name - Removed as not in current table structure */}
              {/* UTM Zone */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  UTM Zone
                </label>
                <select
                  value={formData.utmZone}
                  onChange={(e) => handleInputChange('utmZone', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                >
                  {Array.from({length: 60}, (_, i) => i + 1).map(zone => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </div>

              {/* Hemisphere */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Hemisphere
                </label>
                <select
                  value={formData.hemisphere}
                  onChange={(e) => handleInputChange('hemisphere', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                >
                  <option value="N">North</option>
                  <option value="S">South</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => router.push('/projects')}
                className="px-6 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Create Project</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
