'use client';

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, ArrowLeft, CheckCircle2, Globe2, ShieldCheck, WifiOff } from 'lucide-react'

type View = 'login' | 'forgot' | 'sent'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => { document.title = 'Login — METARDU' }, [])

  useEffect(() => {
    const saved = localStorage.getItem('metardu_remember')
    if (saved === 'true') setRememberMe(true)
  }, [])

  const getRedirectTo = () => {
    const param = searchParams.get('next') || searchParams.get('redirectTo')
    if (param) return decodeURIComponent(param)
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth:redirect') || '/dashboard'
    }
    return '/dashboard'
  }

  const validateEmail = (value: string) => {
    if (!value) return 'Please enter your email address'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address'
    return ''
  }

  const validatePassword = (value: string) => {
    if (!value) return 'Please enter your password'
    return ''
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)
    setPasswordTouched(true)

    const emailErr = validateEmail(email)
    const passErr = validatePassword(password)
    setEmailError(emailErr)
    setPasswordError(passErr)
    if (emailErr || passErr) {
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      setLoading(false)

      if (result?.error) {
        setError('Incorrect email or password. Please try again.')
        return
      }
      if (rememberMe) {
        localStorage.setItem('metardu_remember', 'true')
      } else {
        localStorage.removeItem('metardu_remember')
      }

      localStorage.removeItem('auth:redirect')
      window.location.href = getRedirectTo()
    } catch (err) {
      console.error('Login error:', err)
      setLoading(false)
      setError('An error occurred. Please try again.')
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailTouched(true)

    const emailErr = validateEmail(email)
    setEmailError(emailErr)
    if (emailErr) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setView('sent')
      } else {
        setError('Unable to send reset link. Please try again.')
      }
    } catch {
      setError('A network error occurred. Please check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* ──────────────────────────────────────────────────────────────
          FULL-BLEED WORLD MAP BACKGROUND
          The map now covers the entire viewport end-to-end on every
          breakpoint. A subtle gradient overlay ensures the glass form
          stays readable on top.
         ────────────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 -z-10">
        {/* Pre-loaded PNG (also as <img> for LCP + onLoad callback) */}
        <img
          src="/images/signin-hero.png"
          alt="World topographic contour map"
          onLoad={() => setImageLoaded(true)}
          className={[
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            imageLoaded ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
        {/* Fallback background color while PNG loads */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[#0a1620]"
          style={{ zIndex: -1 }}
        />
        {/* Cinematic gradient overlays for legibility */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40" />
        {/* Subtle vignette */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      </div>

      {/* Top brand bar — floats above background, mobile + desktop */}
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 py-5">
        <a
          href="/"
          className="group inline-flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight text-white"
        >
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/40 backdrop-blur-sm">
            <Globe2 className="w-5 h-5 text-[var(--accent)]" />
          </span>
          <span className="bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
            METARDU
          </span>
        </a>
        <div className="hidden sm:flex items-center gap-2 text-xs text-white/70 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>East Africa Survey Platform</span>
        </div>
      </header>

      {/* Main content — vertically centered, single column on all breakpoints */}
      <main className="relative z-10 flex min-h-[calc(100vh-88px)] items-center justify-center px-4 sm:px-6 pb-12">
        <div className="w-full max-w-md">
          {/* Glass card */}
          <div className="relative rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden">
            {/* Top accent stripe */}
            <div className="h-1 w-full bg-gradient-to-r from-[var(--accent)] via-orange-400 to-[var(--accent)]" />

            <div className="px-6 sm:px-8 py-8 sm:py-10">
              {view === 'login' && (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">
                      Welcome back
                    </h2>
                    <p className="text-sm text-white/60 mt-1.5">
                      Sign in to your METARDU account
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-start gap-2">
                        <span className="mt-0.5">⚠</span>
                        <span>{error}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-white/60 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => {
                          setEmailTouched(true)
                          setEmailError(validateEmail(email))
                        }}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-[var(--accent)] focus:bg-white/10 focus:ring-2 focus:ring-[var(--accent)]/30 focus:outline-none transition-all"
                        autoComplete="email"
                        autoFocus
                        placeholder="you@example.com"
                      />
                      {emailTouched && emailError && (
                        <p className="text-red-300 text-xs mt-1.5">{emailError}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-white/60 mb-2">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onBlur={() => {
                            setPasswordTouched(true)
                            setPasswordError(validatePassword(password))
                          }}
                          className="w-full px-4 py-3 pr-11 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-[var(--accent)] focus:bg-white/10 focus:ring-2 focus:ring-[var(--accent)]/30 focus:outline-none transition-all"
                          autoComplete="current-password"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {passwordTouched && passwordError && (
                        <p className="text-red-300 text-xs mt-1.5">{passwordError}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 text-[var(--accent)] focus:ring-[var(--accent)]/50"
                        />
                        <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                          Remember me
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setView('forgot')
                          setError('')
                        }}
                        className="text-sm text-[var(--accent)] hover:text-amber-300 hover:underline transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dim)] hover:from-amber-400 hover:to-[var(--accent)] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/25"
                    >
                      {loading && (
                        <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                      )}
                      {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                  </form>

                  <p className="text-center mt-6 text-white/60 text-sm">
                    Don&apos;t have an account?{' '}
                    <a
                      href="/register"
                      className="text-[var(--accent)] hover:text-amber-300 hover:underline font-medium transition-colors"
                    >
                      Create one
                    </a>
                  </p>
                </>
              )}

              {view === 'forgot' && (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">
                      Reset your password
                    </h2>
                    <p className="text-sm text-white/60 mt-1.5">
                      Enter your email and we&apos;ll send you a reset link.
                    </p>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-white/60 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => {
                          setEmailTouched(true)
                          setEmailError(validateEmail(email))
                        }}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-[var(--accent)] focus:bg-white/10 focus:ring-2 focus:ring-[var(--accent)]/30 focus:outline-none transition-all"
                        autoComplete="email"
                        autoFocus
                        placeholder="you@example.com"
                      />
                      {emailTouched && emailError && (
                        <p className="text-red-300 text-xs mt-1.5">{emailError}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dim)] hover:from-amber-400 hover:to-[var(--accent)] text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/25"
                    >
                      {loading && (
                        <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                      )}
                      {loading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </form>

                  <button
                    onClick={() => {
                      setView('login')
                      setError('')
                      setEmailTouched(false)
                      setPasswordTouched(false)
                    }}
                    className="flex items-center gap-2 text-sm text-[var(--accent)] hover:text-amber-300 hover:underline mt-6 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to sign in
                  </button>
                </>
              )}

              {view === 'sent' && (
                <div className="text-center py-2">
                  <div className="grid place-items-center w-16 h-16 rounded-full bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30 mx-auto mb-5">
                    <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                  <p className="text-white/60 mb-1">We&apos;ve sent a password reset link to:</p>
                  <p className="text-white font-medium mb-6">{email}</p>

                  <button
                    onClick={() => {
                      setView('login')
                      setError('')
                      setEmailTouched(false)
                      setPasswordTouched(false)
                    }}
                    className="flex items-center gap-2 text-sm text-[var(--accent)] hover:text-amber-300 hover:underline mx-auto transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Trust badges below the card — float over world map */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {[
              { icon: CheckCircle2, text: 'Kenya Survey Compliant' },
              { icon: WifiOff, text: 'Works Offline' },
              { icon: ShieldCheck, text: 'Trusted Across East Africa' },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md text-xs text-white/75"
              >
                <item.icon className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
