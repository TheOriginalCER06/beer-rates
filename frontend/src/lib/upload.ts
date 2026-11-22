import { apiUrl, authHeaders, isNative } from './platform'

export class UploadError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** POST a photo to /api/drinks/<id>/photo/. Network failures throw TypeError (so the queue retries). */
export async function uploadPhoto(drinkId: string, photo: Blob): Promise<void> {
  const body = new FormData()
  body.append('photo', photo, 'photo.jpg')
  const response = await fetch(apiUrl(`/api/drinks/${drinkId}/photo/`), {
    method: 'POST',
    body,
    headers: authHeaders(),
    credentials: isNative ? 'omit' : 'same-origin',
  })
  if (!response.ok) {
    let code = 'SERVER_ERROR'
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      code = data?.error?.code ?? code
      message = data?.error?.message ?? message
    } catch {
      // Not JSON (e.g. a proxy's error page).
    }
    throw new UploadError(code, message)
  }
}
