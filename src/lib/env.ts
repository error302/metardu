import { z } from 'zod'

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),

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
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('production'),

  PYTHON_COMPUTE_URL: z.string().url().optional().or(z.literal('')),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().regex(/^\d*$/).optional(),
  ADMIN_EMAILS: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  
  NVIDIA_API_KEY: z.string().optional(),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues

  // Required fields — crash immediately so misconfiguration is caught at startup
  const requiredFields = ['DATABASE_URL', 'AUTH_SECRET']
  const missingRequired = issues.filter(i =>
    i.path.some(p => requiredFields.includes(String(p)))
  )

  if (missingRequired.length > 0) {
    const missing = missingRequired.map(i => i.path.join('.')).join(', ')
    throw new Error(
      `[env] Missing required environment variables: ${missing}\n` +
      `Set these in .env.local or your deployment environment before starting.`
    )
  }

  // Optional fields — warn but continue
  console.warn('[env] Some optional environment variables are missing — related features will be disabled.')
}

const defaults = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || '',
} as const

export const env = { ...defaults, ...(parsedEnv.data ?? {}) } as typeof defaults & Partial<z.infer<typeof envSchema>>

export function requireEnv(name: keyof typeof env): string {
  const value = env[name]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${String(name)}`)
  }

  return value
}
