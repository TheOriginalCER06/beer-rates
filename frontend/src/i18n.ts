import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import nb from './locales/nb.json'

export const LANGUAGES = ['nb', 'en'] as const
export type AppLanguage = (typeof LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, nb: { translation: nb } },
    supportedLngs: LANGUAGES,
    // Norwegian variants (no, nn) fall back to bokmål.
    fallbackLng: { no: ['nb'], nn: ['nb'], default: ['en'] },
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'lang', caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export function currentLanguage(): AppLanguage {
  const lng = i18n.resolvedLanguage ?? i18n.language
  return (LANGUAGES as readonly string[]).includes(lng) ? (lng as AppLanguage) : 'nb'
}

export default i18n
