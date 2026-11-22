import i18n from '../i18n'

function locale(): string {
  return i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO'
}

/** Today in the phone's time zone, as YYYY-MM-DD (what <input type="date"> and the API use). */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return parseDay(day).toLocaleDateString(locale(), options)
}

/** "today", "yesterday", "3 days ago", else the date. */
export function relativeDay(day: string): string {
  const days = Math.round((parseDay(today()).getTime() - parseDay(day).getTime()) / 86_400_000)
  if (days >= 0 && days < 7) {
    return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-days, 'day')
  }
  const sameYear = day.slice(0, 4) === today().slice(0, 4)
  return formatDay(day, sameYear ? { day: 'numeric', month: 'short' } : undefined)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatAbv(abv: number | null | undefined): string {
  return abv == null ? '' : `${abv.toLocaleString(locale(), { maximumFractionDigits: 1 })} %`
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  return value == null ? '–' : value.toLocaleString(locale(), { maximumFractionDigits: digits })
}

export function monthName(month: number, year: number, style: 'long' | 'short' = 'long'): string {
  return new Date(year, month - 1, 1).toLocaleDateString(locale(), { month: style })
}

/** Monday-first weekday names. */
export function weekdayNames(): string[] {
  const monday = new Date(2024, 0, 1)
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86_400_000).toLocaleDateString(locale(), { weekday: 'short' }),
  )
}
