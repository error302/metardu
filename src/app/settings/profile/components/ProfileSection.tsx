'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ProfileData } from './SettingsTabs'

interface ProfileSectionProps {
  profile: ProfileData | null
  onPatch: (patch: Partial<ProfileData>) => Promise<void>
}

export default function ProfileSection({ profile, onPatch }: ProfileSectionProps) {
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    bio: profile?.bio ?? '',
  })
  const [dirty, setDirty] = useState(false)

  // Sync form when profile reloads from server
  useEffect(() => {
    setForm({
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
      address: profile?.address ?? '',
      bio: profile?.bio ?? '',
    })
    setDirty(false)
  }, [profile?.full_name, profile?.phone, profile?.address, profile?.bio])

  const handleChange = useCallback((field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setDirty(true)
  }, [])

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onPatch(form)
    },
    [form, onPatch],
  )

  return (
    <form onSubmit={handleSave} className="space-y-5 p-5 sm:p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)]">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Personal Information</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Your name appears on Deed Plans, Form No. 4 certificates, and the surveyor registry.
        </p>
      </div>

      <Field
        label="Full Name"
        value={form.full_name}
        onChange={(v) => handleChange('full_name', v)}
        placeholder="e.g. John Mwangi"
        required
        maxLength={255}
      />

      <Field
        label="Phone Number"
        type="tel"
        value={form.phone}
        onChange={(v) => handleChange('phone', v)}
        placeholder="+254 7XX XXX XXX"
        maxLength={50}
        hint="Used for SMS notifications if you enable them below."
      />

      <Field
        label="Address"
        value={form.address}
        onChange={(v) => handleChange('address', v)}
        placeholder="P.O. Box 12345-00100, Nairobi"
        maxLength={1000}
        hint="Optional — appears on the cover sheet of statutory workbooks."
      />

      <div>
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
        >
          Bio
        </label>
        <textarea
          id="bio"
          value={form.bio}
          onChange={(e) => handleChange('bio', e.target.value)}
          placeholder="Brief professional bio — appears on your public surveyor profile if listed in the registry."
          rows={4}
          maxLength={2000}
          className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] resize-y"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {form.bio.length}/2000 characters
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!dirty}
          className="px-5 py-2 text-sm font-medium bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Save Changes
        </button>
        {dirty && (
          <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
        )}
      </div>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  maxLength?: number
  hint?: string
}) {
  return (
    <div>
      <label
        htmlFor={label.toLowerCase().replace(/\s+/g, '_')}
        className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
      </label>
      <input
        id={label.toLowerCase().replace(/\s+/g, '_')}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
      />
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}
