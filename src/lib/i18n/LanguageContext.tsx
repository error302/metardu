'use client'
import { createContext, useContext, useState, ReactNode } from 'react'
import { en, sw, Language } from './sw'

const LanguageContext = createContext<{
  language: Language
  t: (key: string) => string
  setLanguage: (lang: Language) => void
}>({
  language: 'en',
  t: (key: string) => key,
  setLanguage: () => {}
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')
  
  function t(key: string): string {
    const translations = language === 'sw' ? sw : en
    return (translations as any)[key] || key
  }
  
  return (
    <LanguageContext.Provider value={{ language, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
