import { redirect } from 'next/navigation'

/**
 * Redirect /settings → /settings/profile
 * Settings is a nested route — the main page redirects to profile.
 */
export default function SettingsRedirect() {
  redirect('/settings/profile')
}
