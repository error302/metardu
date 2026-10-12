import en from '../../../messages/en.json'
import type { SimpleTranslations } from './types'

// English (the fallback language) is bundled statically — every route needs
// it. All other locales are code-split: their JSON (~20–37 KB each, ~310 KB
// for all 14) only downloads when a user actually selects that language.
// Previously all locales were statically imported here, which pulled the
// whole set into the shared client chunk graph on every route.

const enMessages = en as unknown as SimpleTranslations

const lazyLoaders: Record<Exclude<Language, 'en'>, () => Promise<{ default: unknown }>> = {
  ar: () => import('../../../messages/ar.json'),
  zh: () => import('../../../messages/zh.json'),
  hi: () => import('../../../messages/hi.json'),
  es: () => import('../../../messages/es.json'),
  fr: () => import('../../../messages/fr.json'),
  am: () => import('../../../messages/am.json'),
  de: () => import('../../../messages/de.json'),
  ha: () => import('../../../messages/ha.json'),
  id: () => import('../../../messages/id.json'),
  ja: () => import('../../../messages/ja.json'),
  pt: () => import('../../../messages/pt.json'),
  ru: () => import('../../../messages/ru.json'),
  sw: () => import('../../../messages/sw.json'),
}

export type Language =
  | 'en' | 'ar' | 'zh' | 'hi' | 'es' | 'fr'
  | 'am' | 'de' | 'ha' | 'id' | 'ja' | 'pt' | 'ru' | 'sw'

// Registry of loaded translations. Populated with `en` at module init and
// extended as lazy locales arrive. `createTranslator` reads this snapshot,
// so an in-flight load falls back to English until it lands.
export const messagesByLanguage: Record<Language, SimpleTranslations> = {
  en: enMessages,
} as unknown as Record<Language, SimpleTranslations>

const inFlight = new Map<Language, Promise<void>>()

/**
 * Ensure a language's translations are loaded. Resolves immediately for
 * already-loaded languages. Safe to call repeatedly.
 */
export function ensureLanguage(lang: Language): Promise<void> {
  if (messagesByLanguage[lang]) return Promise.resolve()
  if (lang === 'en') return Promise.resolve() // statically bundled
  const loader = lazyLoaders[lang]
  if (!loader) return Promise.resolve()
  let p = inFlight.get(lang)
  if (!p) {
    p = loader()
      .then((m) => {
        messagesByLanguage[lang] = (m as { default: unknown }).default as SimpleTranslations
      })
      .catch(() => {
        // Load failure: leave the locale absent; translator falls back to en.
      })
      .finally(() => {
        inFlight.delete(lang)
      })
    inFlight.set(lang, p)
  }
  return p
}

// Re-exported for typing convenience
export type { SimpleTranslations }
