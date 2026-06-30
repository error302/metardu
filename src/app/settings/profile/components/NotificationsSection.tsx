'use client'

import { useState, useCallback, useMemo } from 'react'
import type { NotificationPreferences } from './SettingsTabs'

interface NotificationsSectionProps {
  preferences: NotificationPreferences | null
  lastUpdated: string | null
  onPatch: (prefs: NotificationPreferences) => Promise<void>
}

type Channel = 'email' | 'sms' | 'push' | 'in_app'

interface EventDef {
  key: string
  label: string
  description: string
  /** Channels on which this event is eligible to fire (others are hidden). */
  channels: Channel[]
}

const EVENTS: EventDef[] = [
  {
    key: 'project_updates',
    label: 'Project updates',
    description: 'When a project you own is modified, archived, or shared with a new surveyor.',
    channels: ['email', 'push', 'in_app'],
  },
  {
    key: 'field_sync_complete',
    label: 'Field sync complete',
    description: 'When offline observations finish uploading to the server at end of day.',
    channels: ['email', 'sms', 'push', 'in_app'],
  },
  {
    key: 'document_generated',
    label: 'Document generated',
    description: 'When a deed plan, Form No. 4, or statutory workbook is ready to download.',
    channels: ['email', 'push', 'in_app'],
  },
  {
    key: 'billing_reminders',
    label: 'Billing & subscription',
    description: 'Trial ending, payment failed, receipt ready, plan renewal upcoming.',
    channels: ['email', 'sms', 'in_app'],
  },
  {
    key: 'security_alerts',
    label: 'Security alerts',
    description: 'New device login, password changed, suspicious activity detected. Always recommended.',
    channels: ['email', 'sms', 'push', 'in_app'],
  },
  {
    key: 'team_mentions',
    label: 'Team mentions',
    description: 'When a colleague @mentions you on a project comment or task.',
    channels: ['email', 'push', 'in_app'],
  },
  {
    key: 'weekly_digest',
    label: 'Weekly digest',
    description: 'Monday-morning summary of your projects, points collected, and pending submissions.',
    channels: ['email'],
  },
  {
    key: 'marketing',
    label: 'Product news & offers',
    description: 'New features, training events, and occasional promotions. Off by default.',
    channels: ['email'],
  },
]

const CHANNEL_LABELS: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
  in_app: 'In-app',
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    project_updates: true,
    field_sync_complete: true,
    document_generated: true,
    billing_reminders: true,
    security_alerts: true,
    team_mentions: true,
    weekly_digest: true,
    marketing: false,
  },
  sms: {
    field_sync_complete: false,
    billing_reminders: false,
    security_alerts: true,
  },
  push: {
    project_updates: false,
    field_sync_complete: false,
    document_generated: false,
    security_alerts: true,
    team_mentions: false,
  },
  in_app: {
    project_updates: true,
    field_sync_complete: true,
    document_generated: true,
    billing_reminders: true,
    security_alerts: true,
    team_mentions: true,
  },
}

export default function NotificationsSection({
  preferences,
  lastUpdated,
  onPatch,
}: NotificationsSectionProps) {
  // Merge defaults with stored preferences so new events always appear
  const current = useMemo<NotificationPreferences>(() => {
    const merged: NotificationPreferences = {}
    for (const channel of ['email', 'sms', 'push', 'in_app'] as Channel[]) {
      merged[channel] = {
        ...(DEFAULT_PREFERENCES[channel] ?? {}),
        ...(preferences?.[channel] ?? {}),
      }
    }
    return merged
  }, [preferences])

  const [dirty, setDirty] = useState(false)
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>(current)

  // Sync when server-pushed preferences change
  useMemo(() => {
    setLocalPrefs(current)
    setDirty(false)
  }, [current])

  const toggle = useCallback(
    (channel: Channel, eventKey: string, value: boolean) => {
      setLocalPrefs((prev) => ({
        ...prev,
        [channel]: { ...prev[channel], [eventKey]: value },
      }))
      setDirty(true)
    },
    [],
  )

  const handleSave = useCallback(() => {
    onPatch(localPrefs)
    setDirty(false)
  }, [localPrefs, onPatch])

  const handleReset = useCallback(() => {
    setLocalPrefs(DEFAULT_PREFERENCES)
    setDirty(true)
  }, [])

  const channels: Channel[] = ['email', 'sms', 'push', 'in_app']

  return (
    <div className="space-y-5 p-5 sm:p-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notification Preferences</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Choose how you want to be notified for each event type. Security alerts are strongly recommended on at least one channel.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
        >
          Reset to defaults
        </button>
      </div>

      {lastUpdated && (
        <p className="text-xs text-[var(--text-muted)]">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}

      {/* Preferences matrix */}
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              <th className="text-left font-medium text-[var(--text-secondary)] py-3 px-2 sm:px-4 min-w-[260px]">
                Event
              </th>
              {channels.map((ch) => (
                <th
                  key={ch}
                  scope="col"
                  className="text-center font-medium text-[var(--text-secondary)] py-3 px-2 sm:px-4 min-w-[80px]"
                >
                  {CHANNEL_LABELS[ch]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((event) => (
              <tr
                key={event.key}
                className="border-b border-[var(--border-color)] last:border-0"
              >
                <td className="py-3 px-2 sm:px-4">
                  <div className="font-medium text-[var(--text-primary)]">
                    {event.label}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 max-w-md">
                    {event.description}
                  </div>
                </td>
                {channels.map((ch) => {
                  const enabled = event.channels.includes(ch)
                  const checked = !!localPrefs[ch]?.[event.key]
                  return (
                    <td key={ch} className="py-3 px-2 sm:px-4 text-center">
                      {enabled ? (
                        <Toggle
                          checked={checked}
                          onChange={(v) => toggle(ch, event.key, v)}
                          label={`${CHANNEL_LABELS[ch]} for ${event.label}`}
                        />
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs" aria-hidden>
                          —
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="px-5 py-2 text-sm font-medium bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Save Preferences
        </button>
        {dirty && (
          <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
        )}
      </div>

      <div className="mt-2 p-3 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-muted)]">
        <strong className="font-medium text-[var(--text-secondary)]">Note on SMS:</strong>{' '}
        SMS notifications are sent via the configured gateway (AT/Africa&apos;s Talking).
        Standard carrier rates apply. Currently available for Kenyan numbers only.
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] ${
        checked
          ? 'bg-[var(--accent)]'
          : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
