import { ActionIcon, Button, Group, Modal, SegmentedControl, Slider, Stack, Text } from '@mantine/core'
import { IconRotateClockwise2, IconZoomIn } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { crop } from '../lib/photo'

const ASPECTS: Record<string, number | null> = { '4:5': 4 / 5, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16, full: null }

interface Props {
  /** The prepared (upright, shrunk) photo, or null when closed. */
  photo: Blob | null
  onCancel: () => void
  onDone: (cropped: Blob) => void
}

/** Full-screen cropper: drag to move, pinch or the slider to zoom, rotate in 90° steps. */
export function CropModal({ photo, onCancel, onDone }: Props) {
  const { t } = useTranslation()
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  const [aspectKey, setAspectKey] = useState('4:5')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<Area | null>(null)
  const [natural, setNatural] = useState<number>(4 / 5)
  const [busy, setBusy] = useState(false)

  // A new photo starts uncropped. Reset while rendering (React's pattern for state that follows a
  // prop), not in an effect, which would first render the old crop on the new photo.
  const [shownPhoto, setShownPhoto] = useState(photo)
  if (photo !== shownPhoto) {
    setShownPhoto(photo)
    setPosition({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  const sideways = rotation % 180 !== 0
  const aspect = ASPECTS[aspectKey] ?? (sideways ? 1 / natural : natural)

  const done = async () => {
    if (!photo || !area) return
    setBusy(true)
    try {
      onDone(await crop(photo, area, rotation))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={!!photo} onClose={onCancel} fullScreen title={t('photo.cropTitle')} padding="sm" zIndex={400}>
      <Stack gap="sm">
        <div className="cropper">
          {url && (
            <Cropper
              image={url}
              crop={position}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              minZoom={1}
              maxZoom={5}
              onCropChange={setPosition}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
              onMediaLoaded={(size) => setNatural(size.naturalWidth / size.naturalHeight)}
              objectFit="contain"
              showGrid
            />
          )}
        </div>
        <SegmentedControl
          fullWidth
          value={aspectKey}
          onChange={setAspectKey}
          data={Object.keys(ASPECTS).map((key) => ({ value: key, label: key === 'full' ? t('photo.whole') : key }))}
        />
        <Group wrap="nowrap" gap="sm">
          <IconZoomIn size={20} />
          <Slider style={{ flex: 1 }} min={1} max={5} step={0.05} value={zoom} onChange={setZoom} label={null} />
          <ActionIcon
            variant="light"
            size="lg"
            aria-label={t('photo.rotate')}
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <IconRotateClockwise2 size={20} />
          </ActionIcon>
        </Group>
        <Text size="xs" c="dimmed">
          {t('photo.cropHint')}
        </Text>
        <Group grow>
          <Button variant="default" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void done()} loading={busy} disabled={!area}>
            {t('photo.usePhoto')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
