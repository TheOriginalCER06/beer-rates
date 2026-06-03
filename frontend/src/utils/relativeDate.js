/**
 * Returns a human-friendly relative date string.
 * @param {string} dateStr — "YYYY-MM-DD" format
 */
export function relativeDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.floor((now - d) / 86400000)

  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)   return `${diff}d ago`
  if (diff < 30)  return `${Math.floor(diff / 7)}w ago`
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
  return d.toLocaleDateString()
}
