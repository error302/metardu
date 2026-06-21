// ponytail: env-driven flags, no PostHog, no LaunchDarkly.
// 4 lines, one source of truth, zero runtime deps.
// Usage: if (FEATURE('cassini_v2')) { ... }

export const FEATURE = (name: string): boolean =>
  process.env[`NEXT_PUBLIC_FEATURE_${name.toUpperCase()}`] === 'on'
