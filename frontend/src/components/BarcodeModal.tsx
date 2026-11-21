import { Alert, Button, FileButton, Loader, Modal, Stack, Text, TextInput } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectIn, getDetector } from '../lib/barcode'

interface Props {
  opened: boolean
  onClose: () => void
  onCode: (code: string) => void
}

/**
 * Website and iOS: live camera with BarcodeDetector (or the zxing polyfill). Also: read the code
 * from a photo, or type it, for when the camera can't be used.
 */
export function BarcodeModal({ opened, onClose, onCode }: Props) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!opened) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    setError(null)
    setStarting(true)
    const run = async () => {
      try {
        const detector = await getDetector()
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        setStarting(false)
        const tick = async () => {
          if (stopped || !video.current) return
          try {
            const found = await detector.detect(video.current)
            if (found[0]?.rawValue) {
              onCode(found[0].rawValue)
              return
            }
          } catch {
            // A frame that couldn't be read; try the next one.
          }
          timer = window.setTimeout(() => void tick(), 200)
        }
        void tick()
      } catch {
        setStarting(false)
        setError(t('barcode.noCamera'))
      }
    }
    void run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [opened, onCode, t])

  const fromPhoto = async (file: File | null) => {
    if (!file) return
    try {
      const code = await detectIn(await createImageBitmap(file))
      if (code) onCode(code)
      else setError(t('barcode.notFound'))
    } catch {
      setError(t('barcode.notFound'))
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t('barcode.title')} fullScreen padding="sm" zIndex={400}>
      <Stack>
        <div style={{ position: 'relative' }}>
          <video ref={video} className="scanner-video" playsInline muted />
          {starting && !error && (
            <Loader style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          )}
        </div>
        <Text size="sm" c="dimmed">
          {t('barcode.hint')}
        </Text>
        {error && <Alert color="orange">{error}</Alert>}
        <FileButton onChange={(file) => void fromPhoto(file)} accept="image/*">
          {(props) => (
            <Button variant="light" leftSection={<IconPhoto size={16} />} {...props}>
              {t('barcode.fromPhoto')}
            </Button>
          )}
        </FileButton>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) onCode(typed.trim())
          }}
        >
          <TextInput
            label={t('barcode.type')}
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value.replace(/\D/g, ''))}
            rightSectionWidth={80}
            rightSection={
              <Button size="compact-sm" type="submit" disabled={typed.length < 8}>
                {t('common.ok')}
              </Button>
            }
          />
        </form>
      </Stack>
    </Modal>
  )
}
