import { z } from 'zod'
import { logger } from '@/lib/logger'

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORT_CODE: z.string().optional(),
  MPESA_INITIATOR_NAME: z.string().optional(),
  MPESA_SECURITY_CREDENTIAL: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),

  AIRTEL_CLIENT_ID: z.string().optional(),
  AIRTEL_CLIENT_SECRET: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal('')),

  NEXT_PUBLIC_LOG_ENDPOINT: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.enum(['development', 'staging', 'production']).prefault('production'),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),

  PYTHON_COMPUTE_URL: z.string().url().optional().or(z.literal('')),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().regex(/^\d*$/).optional(),
  ADMIN_EMAILS: z.string().optional(),

  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  
  NVIDIA_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  SUPPORT_EMAIL: z.string().email().optional().or(z.literal('')),

  AFRICASTALKING_USERNAME: z.string().optional(),
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_ENABLED: z.string().optional(),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues

  // Required fields — crash at runtime so misconfiguration is caught at startup
  // During build (next build), env vars may not be available, so we warn instead of throwing
  const requiredFields = ['AUTH_SECRET']
  const missingRequired = issues.filter(i =>
    i.path.some(p => requiredFields.includes(String(p)))
  )

  if (missingRequired.length > 0) {
    const missing = missingRequired.map(i => i.path.join('.')).join(', ')
    const message = `[env] Missing required environment variables: ${missing}\nSet these in .env.local or your deployment environment before starting.`
    
    // During Next.js build, process.env.NEXT_PHASE === 'phase-production-build'
    // In that case, just warn — the app won't actually run
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      logger.warn(message)
    } else {
      throw new Error(message)
    }
  }

  // Optional fields — warn but continue
  logger.warn('[env] Some optional environment variables are invalid — related features will be disabled.')
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())
const hasDiscreteDatabaseConfig = Boolean(
  process.env.DB_HOST?.trim() &&
    process.env.DB_NAME?.trim() &&
    process.env.DB_USER?.trim(),
)
if (!hasDatabaseUrl && !hasDiscreteDatabaseConfig) {
  const message = '[env] Configure DATABASE_URL or DB_HOST, DB_NAME, and DB_USER before starting the application.'
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    logger.warn(message)
  } else {
    throw new Error(message)
  }
}

const defaults = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || '',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
} as const

// One malformed optional provider value must not discard independently valid
// database/authentication configuration. Required runtime failures still throw above.
const validatedEnv = parsedEnv.success ? parsedEnv.data : Object.fromEntries(
  Object.entries(envSchema.shape).flatMap(([name, schema]) => {
    const field = schema.safeParse(process.env[name])
    return field.success ? [[name, field.data]] : []
  }),
) as Partial<z.infer<typeof envSchema>>

export const env = { ...defaults, ...validatedEnv } as typeof defaults & Partial<z.infer<typeof envSchema>>

export function requireEnv(name: keyof typeof env): string {
  const value = env[name]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(name)}`)
  }

  return value
}
