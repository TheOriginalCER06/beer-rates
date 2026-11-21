// Taking or choosing a photo. In the apps: the phone's own camera and gallery (Capacitor Camera),
// already turned upright. On the website: a file input (with `capture` for the camera).
import { App } from '@capacitor/app'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { isNative } from './platform'

export type PhotoSource = 'camera' | 'gallery'

async function fromWebPath(webPath: string): Promise<Blob> {
  const response = await fetch(webPath)
  return response.blob()
}

/** Native only: returns null if the user cancelled. */
export async function nativePhoto(source: PhotoSource): Promise<Blob | null> {
  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      width: 2400,
      height: 2400,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
    })
    return photo.webPath ? fromWebPath(photo.webPath) : null
  } catch (error) {
    // "User cancelled photos app" and friends.
    if (String(error).toLowerCase().includes('cancel')) return null
    throw error
  }
}

/**
 * Android may close the app while the camera is open (low memory). The photo then arrives with
 * the next start; `callback` gets it so the add form can carry on.
 */
export function onRestoredPhoto(callback: (photo: Blob) => void): () => void {
  if (!isNative) return () => undefined
  const handle = App.addListener('appRestoredResult', (event) => {
    const data = event.data as { webPath?: string } | undefined
    if (event.pluginId === 'Camera' && event.methodName === 'getPhoto' && event.success && data?.webPath) {
      void fromWebPath(data.webPath).then(callback)
    }
  })
  return () => void handle.then((h) => h.remove())
}

// A photo handed to the add form from outside it (the app restarted while the camera was open).
let pendingPhoto: Blob | null = null

export function setPendingPhoto(photo: Blob): void {
  pendingPhoto = photo
}

export function takePendingPhoto(): Blob | null {
  const photo = pendingPhoto
  pendingPhoto = null
  return photo
}
