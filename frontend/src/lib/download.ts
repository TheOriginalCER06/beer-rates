// Spreadsheet export. Website: a normal download. Apps: saved to the app's cache, then the phone's
// share sheet (save to Files/Drive, send by mail…).
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { apiUrl, authHeaders, isNative } from './platform'

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function downloadExport(format: 'csv' | 'xlsx', userId?: string | null): Promise<void> {
  const query = userId ? `?user=${encodeURIComponent(userId)}` : ''
  const path = `/api/export/drinks.${format}${query}`
  if (!isNative) {
    window.location.href = path
    return
  }
  const response = await fetch(apiUrl(path), { headers: authHeaders() })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const name = `drinks-${new Date().toISOString().slice(0, 10)}.${format}`
  const file = await Filesystem.writeFile({ path: name, data: await base64(await response.blob()), directory: Directory.Cache })
  await Share.share({ title: name, url: file.uri })
}
