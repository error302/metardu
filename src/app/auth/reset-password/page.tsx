'use client';

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react'
import { safeRedirectPath } from '@/lib/auth/safeRedirect'
import { authFetch } from '@/lib/auth/client'

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (password.length < 8) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' }
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length
  if (password.length >= 8 && score >= 3) return { label: 'Strong', color: 'bg-green-500', width: 'w-full' }
  if (password.length >= 8 && score >= 2) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/3' }
  return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' }
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()

  const token = searchParams.get('token') || ''
  const nextPath = safeRedirectPath(searchParams.get('next'))
  const recoveryUrl = `/login?recovery=1&next=${encodeURIComponent(nextPath)}`
  const loginUrl = `/login?reset=success&next=${encodeURIComponent(nextPath)}`
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(true)

  const strength = getPasswordStrength(password)

  useEffect(() => {
    document.title = 'Reset Password - METARDU'
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Invalid reset link. Request a new one from login.')
      return
    }

    setLoading(true)
    try {
      const res = await authFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; confirmationEmailSent?: boolean }
      if (!res.ok) {
        setError(json.error || 'Password update failed. Your reset link may have expired.')
        setLoading(false)
        return
      }
      setConfirmationEmailSent(json.confirmationEmailSent !== false)
    } catch {
      setError('Password update failed. Please try again.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Invalid reset link</h2>
          <p className="text-[var(--text-secondary)] mb-6">This link is invalid or has expired.</p>
          <a href={recoveryUrl} className="text-[var(--accent)] hover:underline">Request a new reset link</a>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Password updated</h2>
          <p className="text-[var(--text-secondary)]">Your password is saved. Existing sessions have been signed out.</p>
          {!confirmationEmailSent && <p role="status" className="mt-3 text-sm text-amber-300">Your confirmation email could not be sent, but the password change succeeded.</p>}
          <a href={loginUrl} className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-black">Sign in with your new password</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <a href="/" className="text-2xl font-bold text-[var(--accent)] block mb-8">METARDU</a>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Set new password</h2>
        <p className="text-[var(--text-secondary)] mb-8">Choose a strong password for your account.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div role="alert" className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">{error} <a href={recoveryUrl} className="underline">Request a new reset link</a></div>
          )}

          <div>
            <label htmlFor="reset-password" className="block text-sm text-[var(--text-primary)] mb-2">New password</label>
            <div className="relative">
              <input id="reset-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-[var(--text-primary)] pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && (
              <div className="mt-2">
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full ${strength.color} ${strength.width} transition-all`} />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{strength.label}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block text-sm text-[var(--text-primary)] mb-2">Confirm password</label>
            <div className="relative">
              <input id="reset-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-[var(--text-primary)] pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || password !== confirmPassword || password.length < 8}
            className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
