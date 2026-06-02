import { useState, useEffect } from 'react'

const KEY = 'beerrates.ai'

export const AI_DEFAULTS = {
  smartDetection: false,  // drink / brand / ABV recognition (downloads ML models)
  qualityWarnings: true,  // blur + darkness warnings
  autoEnhance: true,      // EXIF auto-rotation + 4:3 auto-crop
}

const EVENT = 'ai-settings-changed'

export function getAiSettings() {
  try {
    return { ...AI_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...AI_DEFAULTS }
  }
}

export function setAiSetting(key, value) {
  const next = { ...getAiSettings(), [key]: value }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  return next
}

/** React hook — returns current settings and re-renders on change (even across tabs). */
export function useAiSettings() {
  const [settings, setSettings] = useState(getAiSettings)

  useEffect(() => {
    const onChange = () => setSettings(getAiSettings())
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  return settings
}
