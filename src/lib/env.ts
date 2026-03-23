import { z } from 'zod'

const envSchema = z.object({
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // PayPal
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),

  // M-Pesa (Kenya)
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORT_CODE: z.string().optional(),
  MPESA_INITIATOR_NAME: z.string().optional(),
  MPESA_SECURITY_CREDENTIAL: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),

  // Airtel Money
  AIRTEL_CLIENT_ID: z.string().optional(),
  AIRTEL_CLIENT_SECRET: z.string().optional(),

  // App URLs
  NEXT_PUBLIC_APP_URL: z.string().url().optional().or(z.literal('')),
  
  // Monitoring / Sentry
  NEXT_PUBLIC_LOG_ENDPOINT: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('production'),

  // Python Engine
  PYTHON_COMPUTE_URL: z.string().url().optional().or(z.literal('')),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // SEO
  GOOGLE_SITE_VERIFICATION: z.string().optional(),

  // Community
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().regex(/^\d*$/).optional(),

  // Admins
  ADMIN_EMAILS: z.string().optional()
})

// Parse environment variables - make optional for build, warn if missing
const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.warn('⚠️ Some environment variables are missing - runtime features may be limited')
}

const defaults = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hqdovpgztgqhumhnvfoh.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBlcmFkbWluIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgn4Re2RmBG-F_KD9n0',
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'mohameddosho20@gmail.com',
} as const

// Export the strictly typed env variables with runtime fallbacks
export const env = { ...defaults, ...parsedEnv.data }
