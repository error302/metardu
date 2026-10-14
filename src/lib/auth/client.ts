/** Bound account requests so a mail-provider/network outage cannot leave a form spinning. */
export async function authFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export function signInErrorMessage(code?: string): string {
  if (code === 'AUTH_SERVICE_UNAVAILABLE') return 'Sign-in is temporarily unavailable. Please try again later.'
  if (code === 'ACCOUNT_TEMPORARILY_LOCKED') return 'Too many sign-in attempts. Please wait before trying again, or reset your password.'
  return 'Incorrect email or password. Please try again.'
}
