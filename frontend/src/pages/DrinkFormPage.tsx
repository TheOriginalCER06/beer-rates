import { useApolloClient, useLazyQuery, useMutation, useQuery } from '@apollo/client/react'
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Chip,
  Collapse,
  FileButton,
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconBarcode,
  IconCamera,
  IconCrop,
  IconPhoto,
  IconScan,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { BarcodeModal } from '../components/BarcodeModal'
import { CropModal } from '../components/CropModal'
import { CategoryBadge } from '../components/DrinkCard'
import { RatingBadge, RatingPicker } from '../components/Rating'
import {
  CATEGORIES,
  CONTAINERS,
  CREATE_DRINK,
  DRINK,
  DRINKS,
  FIELD_VALUES,
  IMPORT_PHOTO,
  LOOKUP,
  LOOKUP_BARCODE,
  REMOVE_PHOTO,
  SIMILAR_DRINKS,
  UPDATE_DRINK,
  type Category,
  type Container,
  type Drink,
  type DrinkInput,
  type LookupResult,
} from '../graphql/operations'
import { useNotifyError } from '../hooks'
import { hasNativeScanner, scanNative } from '../lib/barcode'
import { nativePhoto, takePendingPhoto, type PhotoSource } from '../lib/camera'
import { describeError } from '../lib/errors'
import { formatAbv, relativeDay, today } from '../lib/format'
import { readLabel, type LabelText } from '../lib/ocr'
import { useOnline } from '../lib/offline'
import { addToOutbox, isNetworkError, newClientId } from '../lib/outbox'
import { checkQuality, prepare, type Quality } from '../lib/photo'
import { isNative, mediaUrl } from '../lib/platform'
import { COUNTRIES, CATEGORY_ICON, STYLES } from '../lib/styles'
import { uploadPhoto } from '../lib/upload'
import { useSiteConfig } from '../me'

interface FormState {
  name: string
  producer: string
  style: string
  abv: number | string
  country: string
  category: Category
  container: Container | ''
  rating: number | null
  comment: string
  location: string
  dateTried: string
  wouldHaveAgain: boolean
  barcode: string
}

const EMPTY: FormState = {
  name: '',
  producer: '',
  style: '',
  abv: '',
  country: '',
  category: 'BEER',
  container: '',
  rating: null,
  comment: '',
  location: '',
  dateTried: today(),
  wouldHaveAgain: false,
  barcode: '',
}

const DRAFT_KEY = 'beer-draft-new'

function fromDrink(drink: Drink): FormState {
  return {
    name: drink.name,
    producer: drink.producer,
    style: drink.style,
    abv: drink.abv ?? '',
    country: drink.country,
    category: drink.category,
    container: drink.container ?? '',
    rating: drink.rating,
    comment: drink.comment,
    location: drink.location,
    dateTried: drink.dateTried,
    wouldHaveAgain: drink.wouldHaveAgain,
    barcode: drink.barcode,
  }
}

function toInput(form: FormState): DrinkInput {
  return {
    name: form.name.trim(),
    rating: form.rating ?? 0,
    category: form.category,
    producer: form.producer.trim(),
    style: form.style.trim(),
    abv: form.abv === '' ? null : Number(form.abv),
    country: form.country.trim(),
    container: form.container || null,
    comment: form.comment.trim(),
    location: form.location.trim(),
    dateTried: form.dateTried || today(),
    wouldHaveAgain: form.wouldHaveAgain,
    barcode: form.barcode.trim(),
  }
}

/** A big photo-section button: icon above a short label, so three fit side by side on a phone. */
function Tile({ icon, label, filled, onClick }: { icon: ReactNode; label: string; filled?: boolean; onClick: () => void }) {
  return (
    <Button variant={filled ? 'filled' : 'light'} h={64} px={4} onClick={onClick} styles={{ label: { flexDirection: 'column', gap: 4 } }}>
      {icon}
      <Text size="sm" fw={600} lh={1}>
        {label}
      </Text>
    </Button>
  )
}

function loadDraft(): FormState | null {
  try {
    const saved = localStorage.getItem(DRAFT_KEY)
    return saved ? { ...EMPTY, ...JSON.parse(saved) } : null
  } catch {
    return null
  }
}

export function DrinkFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const client = useApolloClient()
  const notifyError = useNotifyError()
  const config = useSiteConfig()
  const online = useOnline()
  const photoAi = config?.photoAi ?? true

  const existing = useQuery(DRINK, { variables: { id: id ?? '' }, skip: !editing })
  const { data: values } = useQuery(FIELD_VALUES, { fetchPolicy: 'cache-and-network' })
  const [form, setForm] = useState<FormState>(() => (editing ? EMPTY : (loadDraft() ?? EMPTY)))
  const [loaded, setLoaded] = useState(!editing)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // Photo: the cropped JPEG to upload, the uncropped copy (to crop again), or a look-up picture.
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [original, setOriginal] = useState<Blob | null>(null)
  const [cropping, setCropping] = useState<Blob | null>(null)
  const [quality, setQuality] = useState<Quality | null>(null)
  const [importUrl, setImportUrl] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  const [scanning, setScanning] = useState(false)
  const [label, setLabel] = useState<LabelText | null>(null)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const formTop = useRef<HTMLDivElement>(null)

  const [runLookup, lookup] = useLazyQuery(LOOKUP)
  const [runBarcode, barcode] = useLazyQuery(LOOKUP_BARCODE)
  const [createDrink] = useMutation(CREATE_DRINK)
  const [updateDrink] = useMutation(UPDATE_DRINK)
  const [importPhoto] = useMutation(IMPORT_PHOTO)
  const [deletePhoto] = useMutation(REMOVE_PHOTO)

  const [debouncedName] = useDebouncedValue(form.name.trim(), 400)
  const similar = useQuery(SIMILAR_DRINKS, {
    variables: { name: debouncedName, excludeId: id },
    skip: debouncedName.length < 3 || !online,
  })

  useEffect(() => {
    if (editing && existing.data?.drink && !loaded) {
      setForm(fromDrink(existing.data.drink))
      setLoaded(true)
    }
  }, [editing, existing.data, loaded])

  // Keep a draft of a new drink, so nothing is lost if the phone closes the app.
  useEffect(() => {
    if (editing) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch {
      // Storage blocked: no draft.
    }
  }, [editing, form])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // --- Photo ---------------------------------------------------------------------------

  const handlePicked = async (file: Blob | null) => {
    if (!file) return
    setPreparing(true)
    try {
      const prepared = await prepare(file)
      setOriginal(prepared)
      setCropping(prepared)
    } catch {
      notifications.show({ color: 'red', message: t('photo.unreadable') })
    } finally {
      setPreparing(false)
    }
  }

  useEffect(() => {
    const restored = takePendingPhoto()
    if (restored) void handlePicked(restored)
    // Only once, on opening the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const takeNative = async (source: PhotoSource) => {
    try {
      await handlePicked(await nativePhoto(source))
    } catch (error) {
      notifications.show({ color: 'red', message: t('photo.cameraFailed', { detail: String(error) }) })
    }
  }

  const cropped = async (blob: Blob) => {
    setCropping(null)
    setPhoto(blob)
    setImportUrl(null)
    setRemovePhoto(false)
    setLabel(null)
    setQuality(await checkQuality(blob).catch(() => null))
  }

  const runOcr = async () => {
    if (!photo) return
    setOcrProgress(0)
    try {
      const result = await readLabel(photo, setOcrProgress)
      setLabel(result)
      if (result.abv != null && form.abv === '') set('abv', result.abv)
      if (result.query) {
        setSearch(result.query)
        setSearchOpen(true)
        if (online) void runLookup({ variables: { category: form.category, query: result.query } })
      }
      if (!result.lines.length) notifications.show({ color: 'orange', message: t('ocr.nothing') })
    } catch (error) {
      notifications.show({ color: 'red', message: t('ocr.failed', { detail: String(error) }) })
    } finally {
      setOcrProgress(null)
    }
  }

  // --- Barcode and look-up ------------------------------------------------------------------

  const applyResult = (result: LookupResult) => {
    setForm((f) => ({
      ...f,
      name: result.name || f.name,
      producer: result.producer || f.producer,
      style: result.style || f.style,
      abv: result.abv ?? f.abv,
      country: result.country || f.country,
      category: result.category === 'OTHER' && f.category !== 'OTHER' ? f.category : result.category,
      barcode: result.barcode || f.barcode,
    }))
    if (result.thumbnail && !photo && !(editing && existing.data?.drink.photoUrl && !removePhoto)) {
      setImportUrl(result.thumbnail)
    }
    setSearchOpen(false)
    formTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const gotCode = async (code: string) => {
    setScanning(false)
    set('barcode', code)
    if (!online) {
      notifications.show({ message: t('barcode.savedOffline', { code }) })
      return
    }
    const { data } = await runBarcode({ variables: { code } })
    const product = data?.lookupBarcode.product
    if (product) {
      applyResult(product)
      notifications.show({ color: 'green', message: t('barcode.found', { name: product.name }) })
    } else if (!data?.lookupBarcode.previous.length) {
      notifications.show({ color: 'orange', message: t('barcode.unknown', { code }) })
    }
  }

  const scan = async () => {
    if (hasNativeScanner) {
      try {
        const code = await scanNative()
        if (code) await gotCode(code)
      } catch {
        setScanning(true) // fall back to the web scanner
      }
    } else {
      setScanning(true)
    }
  }

  const doSearch = (query = search) => {
    if (query.trim().length >= 2) void runLookup({ variables: { category: form.category, query: query.trim() } })
  }

  // --- Saving ----------------------------------------------------------------------------------

  const validate = (): boolean => {
    const problems: typeof errors = {}
    if (!form.name.trim()) problems.name = t('errors.NAME_REQUIRED')
    if (!form.rating) problems.rating = t('errors.INVALID_RATING')
    if (form.abv !== '' && (Number(form.abv) < 0 || Number(form.abv) > 100)) problems.abv = t('errors.INVALID_ABV')
    if (form.dateTried > today()) problems.dateTried = t('errors.DATE_IN_FUTURE')
    setErrors(problems)
    if (Object.keys(problems).length) formTop.current?.scrollIntoView({ behavior: 'smooth' })
    return !Object.keys(problems).length
  }

  const finish = (drinkId: string | null) => {
    if (!editing) localStorage.removeItem(DRAFT_KEY)
    void client.refetchQueries({ include: [DRINKS, FIELD_VALUES] })
    void navigate(drinkId ? `/drinks/${drinkId}` : '/', { replace: true })
  }

  const saveOffline = async (clientId: string) => {
    await addToOutbox({ id: clientId, kind: 'drink', input: toInput(form), photo: photo ?? undefined })
    notifications.show({ color: 'beer', message: t('outbox.savedOffline'), autoClose: 5000 })
    finish(null)
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    const input = toInput(form)
    try {
      if (editing && id) {
        await updateDrink({ variables: { id, input } })
        if (removePhoto && !photo) await deletePhoto({ variables: { drinkId: id } })
        await attachPhoto(id)
        finish(id)
        return
      }
      const clientId = newClientId()
      if (!online) {
        await saveOffline(clientId)
        return
      }
      let drinkId: string
      try {
        const { data } = await createDrink({ variables: { input, clientId } })
        drinkId = data!.createDrink.id
      } catch (error) {
        if (isNetworkError(error)) {
          await saveOffline(clientId)
          return
        }
        throw error
      }
      await attachPhoto(drinkId)
      finish(drinkId)
    } catch (error) {
      notifyError(error)
    } finally {
      setSaving(false)
    }
  }

  /** Upload the new photo (queued if the connection drops), or import the look-up picture. */
  const attachPhoto = async (drinkId: string) => {
    if (photo) {
      try {
        await uploadPhoto(drinkId, photo)
      } catch (error) {
        if (!isNetworkError(error)) throw error
        await addToOutbox({ id: newClientId(), kind: 'photo', drinkId, photo })
        notifications.show({ color: 'beer', message: t('outbox.photoQueued') })
      }
    } else if (importUrl) {
      try {
        await importPhoto({ variables: { drinkId, url: importUrl } })
      } catch (error) {
        notifications.show({ color: 'orange', message: describeError(error, t) })
      }
    }
  }

  if (editing && existing.loading && !loaded) return <Loader m="xl" />
  if (editing && existing.data && !existing.data.drink.canEdit) {
    return <Alert color="red">{t('errors.FORBIDDEN')}</Alert>
  }

  const currentPhoto =
    photoUrl ?? importUrl ?? (editing && !removePhoto ? mediaUrl(existing.data?.drink.photoUrl) : undefined)
  const styleOptions = [...new Set([...STYLES[form.category], ...(values?.styles ?? [])])]
  const countryOptions = [...new Set([...(values?.countries ?? []), ...COUNTRIES])]
  const previous = barcode.data?.lookupBarcode.previous ?? []
  const similarDrinks = (similar.data?.similarDrinks ?? []).filter((d) => !previous.some((p) => p.id === d.id))

  return (
    <Stack gap="md">
      <Title order={2}>{editing ? t('form.editTitle') : t('form.addTitle')}</Title>

      {/* Photo ------------------------------------------------------------------------------- */}
      <Paper withBorder p="sm" radius="md">
        <Stack gap="sm">
          {currentPhoto ? (
            <div style={{ position: 'relative' }}>
              <Image src={currentPhoto} radius="md" mah={360} fit="contain" alt="" />
              <Group gap={6} style={{ position: 'absolute', top: 8, right: 8 }}>
                {original && (
                  <ActionIcon variant="filled" color="dark" size="lg" aria-label={t('photo.crop')} onClick={() => setCropping(original)}>
                    <IconCrop size={18} />
                  </ActionIcon>
                )}
                <ActionIcon
                  variant="filled"
                  color="red"
                  size="lg"
                  aria-label={t('photo.remove')}
                  onClick={() => {
                    setPhoto(null)
                    setOriginal(null)
                    setImportUrl(null)
                    setQuality(null)
                    setLabel(null)
                    if (editing) setRemovePhoto(true)
                  }}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
              {importUrl && !photo && (
                <Badge style={{ position: 'absolute', bottom: 8, left: 8 }} color="dark">
                  {t('photo.fromDatabase')}
                </Badge>
              )}
            </div>
          ) : (
            <Text size="sm" c="dimmed">
              {t('photo.none')}
            </Text>
          )}
          {preparing && <Progress value={100} animated size="sm" />}
          {quality?.blurry && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
              {t('photo.blurry')}
            </Alert>
          )}
          {quality?.dark && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
              {t('photo.dark')}
            </Alert>
          )}
          <SimpleGrid cols={photoAi ? 3 : 2} spacing="xs">
            {isNative ? (
              <>
                <Tile icon={<IconCamera size={22} />} label={t('photo.camera')} filled onClick={() => void takeNative('camera')} />
                <Tile icon={<IconPhoto size={22} />} label={t('photo.gallery')} onClick={() => void takeNative('gallery')} />
              </>
            ) : (
              <>
                <FileButton onChange={(f) => void handlePicked(f)} accept="image/*" capture="environment">
                  {(props) => <Tile icon={<IconCamera size={22} />} label={t('photo.camera')} filled {...props} />}
                </FileButton>
                <FileButton onChange={(f) => void handlePicked(f)} accept="image/*">
                  {(props) => <Tile icon={<IconPhoto size={22} />} label={t('photo.gallery')} {...props} />}
                </FileButton>
              </>
            )}
            {photoAi && <Tile icon={<IconBarcode size={22} />} label={t('barcode.scan')} onClick={() => void scan()} />}
          </SimpleGrid>
          {photoAi && photo && (
            <Button
              variant="subtle"
              leftSection={<IconScan size={18} />}
              onClick={() => void runOcr()}
              loading={ocrProgress !== null}
            >
              {t('ocr.read')}
            </Button>
          )}
          {ocrProgress !== null && (
            <Stack gap={4}>
              <Progress value={Math.round(ocrProgress * 100)} size="sm" animated />
              <Text size="xs" c="dimmed">
                {t('ocr.working')}
              </Text>
            </Stack>
          )}
          {label && label.lines.length > 0 && (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                {t('ocr.tapToUse')}
              </Text>
              <div className="chip-row">
                {label.lines.map((line) => (
                  <Chip key={line} checked={false} onChange={() => set('name', line)} size="sm">
                    {line}
                  </Chip>
                ))}
                {label.abv != null && (
                  <Chip checked={false} onChange={() => set('abv', label.abv!)} size="sm">
                    {formatAbv(label.abv)}
                  </Chip>
                )}
              </div>
            </Stack>
          )}
        </Stack>
      </Paper>

      {barcode.loading && <Loader size="sm" />}
      {previous.length > 0 && (
        <Alert color="beer" title={t('form.hadBefore')}>
          <Stack gap={4}>
            {previous.map((d) => (
              <Text key={d.id} size="sm" component={Link} to={`/drinks/${d.id}`}>
                {d.name} · {d.rating}/10 · {relativeDay(d.dateTried)}
                {d.createdBy && ` · ${d.createdBy.username}`}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Online look-up -------------------------------------------------------------------------- */}
      {config?.lookupEnabled && (
        <Paper withBorder p="sm" radius="md">
          <UnstyledButton
            onClick={() => {
              setSearchOpen((o) => !o)
              if (!search) setSearch(form.name)
            }}
            w="100%"
          >
            <Group gap="xs">
              <IconSearch size={18} />
              <Text fw={600}>{t('lookup.title')}</Text>
            </Group>
          </UnstyledButton>
          <Collapse expanded={searchOpen}>
            <Stack gap="xs" mt="sm">
              {!online && <Text size="sm" c="dimmed">{t('lookup.offline')}</Text>}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  doSearch()
                }}
              >
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  placeholder={t('lookup.placeholder')}
                  enterKeyHint="search"
                  rightSectionWidth={90}
                  rightSection={
                    <Button size="compact-sm" type="submit" loading={lookup.loading} disabled={!online}>
                      {t('lookup.search')}
                    </Button>
                  }
                />
              </form>
              {lookup.error && <Alert color="red">{describeError(lookup.error, t)}</Alert>}
              {lookup.data && !lookup.data.lookup.length && <Text size="sm" c="dimmed">{t('lookup.none')}</Text>}
              {lookup.data?.lookup.map((result) => (
                <UnstyledButton key={`${result.source}-${result.name}-${result.producer}`} onClick={() => applyResult(result)}>
                  <Group wrap="nowrap" gap="sm" p={6} style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}>
                    {result.thumbnail ? (
                      <img src={result.thumbnail} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6 }} loading="lazy" />
                    ) : (
                      <div style={{ width: 44, fontSize: 26, textAlign: 'center' }}>{CATEGORY_ICON[result.category]}</div>
                    )}
                    <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" lineClamp={1}>
                        {result.name}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {[result.producer, result.style, formatAbv(result.abv), result.country, result.detail].filter(Boolean).join(' · ')}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t(`lookup.source.${result.source}`)}
                      </Text>
                    </Stack>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </Collapse>
        </Paper>
      )}

      {/* Fields ------------------------------------------------------------------------------------ */}
      <div ref={formTop} />
      <Stack gap="sm">
        <div className="chip-row" role="radiogroup" aria-label={t('drink.category')}>
          {CATEGORIES.map((c) => (
            <Chip key={c} checked={form.category === c} onChange={() => set('category', c)} variant="filled">
              {CATEGORY_ICON[c]} {t(`category.${c}`)}
            </Chip>
          ))}
        </div>
        <TextInput
          label={t('drink.name')}
          required
          value={form.name}
          onChange={(e) => set('name', e.currentTarget.value)}
          error={errors.name}
          autoCapitalize="words"
          enterKeyHint="next"
        />
        {similarDrinks.length > 0 && (
          <Alert color="blue" p="xs" title={t('form.similar')}>
            <Stack gap={2}>
              {similarDrinks.slice(0, 3).map((d) => (
                <Text key={d.id} size="sm" component={Link} to={`/drinks/${d.id}`}>
                  {d.name} · {d.rating}/10 · {relativeDay(d.dateTried)}
                  {d.createdBy && ` · ${d.createdBy.username}`}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
        <div>
          <Text size="sm" fw={500} mb={6}>
            {t('drink.rating')} <span style={{ color: 'var(--mantine-color-red-6)' }}>*</span>
          </Text>
          <RatingPicker value={form.rating} onChange={(r) => set('rating', r)} />
          {errors.rating && (
            <Text c="red" size="sm" mt={4}>
              {errors.rating}
            </Text>
          )}
        </div>
        <Autocomplete
          label={t('drink.producer')}
          value={form.producer}
          onChange={(v) => set('producer', v)}
          data={values?.producers ?? []}
          limit={8}
          autoCapitalize="words"
        />
        <SimpleGrid cols={2} spacing="sm">
          <Autocomplete label={t('drink.style')} value={form.style} onChange={(v) => set('style', v)} data={styleOptions} limit={12} />
          <NumberInput
            label={t('drink.abv')}
            value={form.abv}
            onChange={(v) => set('abv', v)}
            min={0}
            max={100}
            step={0.1}
            decimalScale={1}
            decimalSeparator=","
            allowedDecimalSeparators={['.', ',']}
            inputMode="decimal"
            suffix=" %"
            hideControls
            error={errors.abv}
          />
        </SimpleGrid>
        <SimpleGrid cols={2} spacing="sm">
          <Autocomplete label={t('drink.country')} value={form.country} onChange={(v) => set('country', v)} data={countryOptions} limit={8} />
          <TextInput
            label={t('drink.date')}
            type="date"
            value={form.dateTried}
            max={today()}
            onChange={(e) => set('dateTried', e.currentTarget.value)}
            error={errors.dateTried}
          />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500} mb={6}>
            {t('drink.container')}
          </Text>
          <SegmentedControl
            fullWidth
            value={form.container}
            onChange={(v) => set('container', v as Container | '')}
            data={[{ value: '', label: '–' }, ...CONTAINERS.map((c) => ({ value: c, label: t(`container.${c}`) }))]}
          />
        </div>
        <Autocomplete
          label={t('drink.location')}
          placeholder={t('drink.locationPlaceholder')}
          value={form.location}
          onChange={(v) => set('location', v)}
          data={values?.locations ?? []}
          limit={8}
        />
        <Textarea
          label={t('drink.comment')}
          placeholder={t('drink.commentPlaceholder')}
          value={form.comment}
          onChange={(e) => set('comment', e.currentTarget.value)}
          autosize
          minRows={3}
          maxLength={5000}
        />
        <Switch
          size="md"
          label={t('drink.wouldHaveAgain')}
          checked={form.wouldHaveAgain}
          onChange={(e) => set('wouldHaveAgain', e.currentTarget.checked)}
        />
        {form.barcode && (
          <Group gap="xs">
            <Badge variant="outline" leftSection={<IconBarcode size={12} />}>
              {form.barcode}
            </Badge>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => set('barcode', '')}>
              {t('common.remove')}
            </Button>
          </Group>
        )}
      </Stack>

      <div className="sticky-actions">
        <Group grow>
          <Button variant="default" size="md" onClick={() => void navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button size="md" onClick={() => void save()} loading={saving}>
            {online || editing ? t('common.save') : t('form.saveOffline')}
          </Button>
        </Group>
        {form.rating && form.name && (
          <Group justify="center" gap="xs" mt={6}>
            <CategoryBadge category={form.category} />
            <RatingBadge rating={form.rating} size="sm" />
          </Group>
        )}
      </div>

      <CropModal photo={cropping} onCancel={() => setCropping(null)} onDone={(blob) => void cropped(blob)} />
      <BarcodeModal opened={scanning} onClose={() => setScanning(false)} onCode={(code) => void gotCode(code)} />
    </Stack>
  )
}
