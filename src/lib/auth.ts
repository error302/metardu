import NextAuth, { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { checkLoginAllowed, recordFailedLogin, recordSuccessfulLogin, getFailedAttemptCount } from '@/lib/security/loginLimiter'

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        // Get client IP from the request
        // Note: In NextAuth v4, req can be a Request or an IncomingMessage
        // headers may be a Headers object (with .get()) or a plain object (with direct access)
        let forwarded = ''
        try {
          const headers = req?.headers
          if (headers && typeof (headers as Record<string, unknown>).get === 'function') {
            forwarded = (headers as { get: (n: string) => string | null }).get('x-forwarded-for') || ''
          } else if (headers) {
            forwarded = (headers as Record<string, string>)['x-forwarded-for'] || ''
          }
        } catch {
          forwarded = ''
        }
        const clientIp = forwarded.split(',')[0]?.trim() || 'unknown'

        // Check brute-force lockout BEFORE checking credentials
        const loginCheck = await checkLoginAllowed(credentials.email, clientIp)
        if (!loginCheck.allowed) {
          console.warn(`[auth] Login blocked for ${credentials.email} from ${clientIp}: ${loginCheck.reason}`)
          return null
        }

        try {
          const { rows } = await db.query(
            'SELECT id, email, password_hash, full_name, isk_number, verified_isk, role FROM users WHERE email = $1 LIMIT 1',
            [credentials.email.toLowerCase().trim()]
          )

          if (rows.length === 0) {
            await recordFailedLogin(credentials.email, clientIp)
            return null
          }

          const user = rows[0]
          const valid = await bcrypt.compare(credentials.password, user.password_hash)
          if (!valid) {
            await recordFailedLogin(credentials.email, clientIp)
            const remaining = 5 - await getFailedAttemptCount(credentials.email, clientIp)
            if (remaining <= 2 && remaining > 0) {
              console.warn(`[auth] ${remaining} attempts remaining for ${credentials.email} from ${clientIp}`)
            }
            return null
          }

          // Check if account is suspended
          try {
            const { rows: profileRows } = await db.query(
              'SELECT is_suspended, suspension_reason FROM surveyor_profiles WHERE user_id = $1 LIMIT 1',
              [user.id]
            )
            if (profileRows.length > 0 && profileRows[0].is_suspended) {
              console.warn(`[auth] Suspended account login attempt: ${user.email}`)
              return null
            }
          } catch {
            // surveyor_profiles may not exist yet — allow login anyway
          }

          // Successful login — clear failure count
          await recordSuccessfulLogin(credentials.email, clientIp)

          // Determine role — priority: hardcoded owner > ADMIN_EMAILS > users.role > surveyor_profiles.role > 'surveyor'
          let role = user.role || 'surveyor'

          // Platform owner always gets super_admin regardless of env var or DB state
          const platformOwnerEmail = (process.env.PLATFORM_OWNER_EMAIL || 'mohameddosho20@gmail.com').toLowerCase()
          if (user.email.toLowerCase() === platformOwnerEmail) {
            role = 'super_admin'
          }

          const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
          if (adminEmails.includes(user.email.toLowerCase())) {
            role = 'super_admin'
          } else if (!role || role === 'user') {
            // Fallback: check surveyor_profiles table
            try {
              const { rows: profileRows } = await db.query(
                'SELECT role FROM surveyor_profiles WHERE user_id = $1 LIMIT 1',
                [user.id]
              )
              if (profileRows.length > 0 && profileRows[0].role) {
                role = profileRows[0].role
              }
            } catch {
              // Table may not exist — keep default
            }

            // Ensure the user has a surveyor_profile (auto-create if missing)
            try {
              await db.query(
                `INSERT INTO surveyor_profiles (id, user_id, role, is_suspended)
                 VALUES (gen_random_uuid(), $1, $2, false)
                 ON CONFLICT (user_id) DO NOTHING`,
                [user.id, role]
              )
            } catch {
              // Non-critical — continue login
            }
          }

          return {
            id: user.id,
            email: user.email,
            name: user.full_name || user.email.split('@')[0],
            isk_number: user.isk_number || '',
            verified_isk: user.verified_isk || false,
            role,
          }
        } catch (err) {
          console.error('[auth] Login DB error:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name || user.email.split('@')[0]
        token.isk_number = user.isk_number || ''
        token.verified_isk = user.verified_isk || false
        token.role = (user as { role?: string }).role || 'surveyor'
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.isk_number = token.isk_number as string
        session.user.verified_isk = token.verified_isk as boolean
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days (reduced from 30 for security)
  },
  secret: (() => {
    const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    if (!s) {
      // During build, provide a dummy value — the app won't actually run
      if (process.env.NEXT_PHASE === 'phase-production-build') {
        console.warn('[auth] AUTH_SECRET not set during build — using dummy. Set it before running the app.')
        return 'build-time-dummy-secret-do-not-use-in-production'
      }
      // Fail hard at runtime — never use a dummy secret in production
      throw new Error('AUTH_SECRET is not set. Run: openssl rand -base64 32')
    }
    return s
  })(),
}
